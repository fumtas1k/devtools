// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { createDecryptionPlan } from '../saml/decryption-profile';
const fixture = (bits: number) =>
  readFileSync(`tests/fixtures/saml-encryption/xmlsec-aes${bits}.xml`, 'utf8');
async function plan(xml: string, index = 0) {
  return createDecryptionPlan(xml, index);
}

describe('復号プロファイル', () => {
  it.each([128, 256])('独立生成 AES-%i の方式と鍵を取得する', async (bits) => {
    const result = await plan(fixture(bits));
    expect(result).toMatchObject({ aesBits: bits, oaepHash: 'SHA-1' });
    expect(result.encryptedKey.length).toBe(256);
    expect(result.payload.length).toBeGreaterThan(28);
  });

  it('選択対象外の Assertion を推測しない', async () => {
    await expect(plan(fixture(128), 1)).rejects.toThrow();
  });

  it('未対応の CBC を拒否する', async () => {
    await expect(plan(fixture(128).replace('aes128-gcm', 'aes128-cbc'))).rejects.toThrow();
  });

  it('外部 CipherReference を拒否する', async () => {
    await expect(
      plan(
        fixture(128).replace(
          '<xenc:CipherValue>',
          '<xenc:CipherReference URI="https://example.test"/><xenc:CipherValue>'
        )
      )
    ).rejects.toThrow();
  });

  it('OAEP 1.1 SHA-256 と MGF1-SHA256 を識別する', async () => {
    const xml = readFileSync('tests/fixtures/saml-encryption/xmlsec-aes256-oaep11.xml', 'utf8');
    await expect(plan(xml)).resolves.toMatchObject({ aesBits: 256, oaepHash: 'SHA-256' });
  });

  it('SHA-256 と既定 MGF1-SHA1 の組合せを拒否する', async () => {
    const xml = readFileSync('tests/fixtures/saml-encryption/xmlsec-aes256-oaep11.xml', 'utf8');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const mgfs = doc.getElementsByTagNameNS('http://www.w3.org/2009/xmlenc11#', 'MGF');
    expect(mgfs.length).toBe(1);
    expect(
      doc
        .getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'DigestMethod')[0]
        .getAttribute('Algorithm')
    ).toBe('http://www.w3.org/2001/04/xmlenc#sha256');
    mgfs[0].remove();
    expect(doc.getElementsByTagNameNS('http://www.w3.org/2009/xmlenc11#', 'MGF').length).toBe(0);
    await expect(plan(new XMLSerializer().serializeToString(doc))).rejects.toThrow(
      'OAEP digest / MGF'
    );
  });

  it('明示した DigestMethod に Algorithm がない場合は拒否する', async () => {
    const doc = new DOMParser().parseFromString(fixture(128), 'application/xml');
    const key = doc.getElementsByTagNameNS('http://www.w3.org/2001/04/xmlenc#', 'EncryptedKey')[0];
    const method = Array.from(key.children).find(
      (child) => child.localName === 'EncryptionMethod'
    )!;
    method.appendChild(
      doc.createElementNS('http://www.w3.org/2000/09/xmldsig#', 'ds:DigestMethod')
    );
    await expect(plan(new XMLSerializer().serializeToString(doc))).rejects.toThrow();
  });

  it('明示した MGF に Algorithm がない場合は拒否する', async () => {
    const xml = readFileSync('tests/fixtures/saml-encryption/xmlsec-aes256-oaep11.xml', 'utf8');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    doc
      .getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'DigestMethod')[0]
      .setAttribute('Algorithm', 'http://www.w3.org/2000/09/xmldsig#sha1');
    doc
      .getElementsByTagNameNS('http://www.w3.org/2009/xmlenc11#', 'MGF')[0]
      .removeAttribute('Algorithm');
    await expect(plan(new XMLSerializer().serializeToString(doc))).rejects.toThrow();
  });

  it('別名を持つ ID 属性を拒否する', async () => {
    const xml = fixture(128).replace('<samlp:Response ', '<samlp:Response ID="one" Id="two" ');
    await expect(plan(xml)).rejects.toThrow();
  });

  it('暗号構造内の余分なテキストを拒否する', async () => {
    const xml = fixture(128).replace('<xenc:CipherData>', '<xenc:CipherData>unexpected');
    await expect(plan(xml)).rejects.toThrow();
  });

  it('文書全体で 16 個を超える EncryptedAssertion を拒否する', async () => {
    const xml = fixture(128).replace(
      '</samlp:Response>',
      `<saml:Assertion>${'<saml:EncryptedAssertion/>'.repeat(16)}</saml:Assertion></samlp:Response>`
    );
    await expect(plan(xml)).rejects.toThrow();
  });
});

describe('鍵の関連付け', () => {
  const xenc = 'http://www.w3.org/2001/04/xmlenc#';
  const ds = 'http://www.w3.org/2000/09/xmldsig#';
  function sibling(retrieval: boolean, referenceList = false): string {
    const doc = new DOMParser().parseFromString(fixture(128), 'application/xml');
    const data = doc.getElementsByTagNameNS(xenc, 'EncryptedData')[0];
    const wrapper = data.parentElement!;
    const info = Array.from(data.children).find((e) => e.localName === 'KeyInfo')!;
    const key = doc.getElementsByTagNameNS(xenc, 'EncryptedKey')[0];
    key.setAttribute('Id', 'key1');
    data.setAttribute('Id', 'data1');
    wrapper.appendChild(key);
    if (retrieval) {
      const ref = doc.createElementNS(ds, 'ds:RetrievalMethod');
      ref.setAttribute('URI', '#key1');
      info.appendChild(ref);
    } else info.remove();
    if (referenceList) {
      const list = doc.createElementNS(xenc, 'xenc:ReferenceList');
      const ref = doc.createElementNS(xenc, 'xenc:DataReference');
      ref.setAttribute('URI', '#data1');
      list.appendChild(ref);
      key.appendChild(list);
    }
    return new XMLSerializer().serializeToString(doc);
  }
  it('兄弟鍵を一対一で関連付ける', async () => {
    await expect(plan(sibling(false, true))).resolves.toMatchObject({ aesBits: 128 });
  });
  it('空の KeyInfo と単一の兄弟鍵も一対一で関連付ける', async () => {
    const doc = new DOMParser().parseFromString(sibling(false), 'application/xml');
    const data = doc.getElementsByTagNameNS(xenc, 'EncryptedData')[0];
    const cipherData = Array.from(data.children).find((child) => child.localName === 'CipherData')!;
    data.insertBefore(doc.createElementNS(ds, 'ds:KeyInfo'), cipherData);
    await expect(plan(new XMLSerializer().serializeToString(doc))).resolves.toMatchObject({
      aesBits: 128,
    });
  });
  it('同一 Assertion 内の RetrievalMethod で兄弟鍵を関連付ける', async () => {
    await expect(plan(sibling(true))).resolves.toMatchObject({ aesBits: 128 });
  });
  it('別の鍵へ向けた RetrievalMethod を拒否する', async () => {
    await expect(plan(sibling(true).replace('URI="#key1"', 'URI="#other"'))).rejects.toThrow();
  });
  it('RetrievalMethod の Transform を拒否する', async () => {
    const doc = new DOMParser().parseFromString(sibling(true), 'application/xml');
    const ref = doc.getElementsByTagNameNS(ds, 'RetrievalMethod')[0];
    ref.appendChild(doc.createElementNS(ds, 'ds:Transforms'));
    await expect(plan(new XMLSerializer().serializeToString(doc))).rejects.toThrow();
  });
  it('RetrievalMethod のチェーンを拒否する', async () => {
    const doc = new DOMParser().parseFromString(sibling(true), 'application/xml');
    const key = doc.getElementsByTagNameNS(xenc, 'EncryptedKey')[0];
    const info = key.getElementsByTagNameNS(ds, 'KeyInfo')[0];
    const chained = doc.createElementNS(ds, 'ds:RetrievalMethod');
    chained.setAttribute('URI', '#other');
    info.appendChild(chained);
    await expect(plan(new XMLSerializer().serializeToString(doc))).rejects.toThrow();
  });
  it('別のデータへ向けた DataReference を拒否する', async () => {
    await expect(
      plan(sibling(false, true).replace('URI="#data1"', 'URI="#other"'))
    ).rejects.toThrow();
  });
  it('重複 ID を拒否する', async () => {
    await expect(plan(sibling(true).replace('Id="data1"', 'Id="key1"'))).rejects.toThrow();
  });
  it('同じ Assertion に複数鍵がある場合に推測しない', async () => {
    const xml = sibling(false);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const key = doc.getElementsByTagNameNS(xenc, 'EncryptedKey')[0];
    key.parentElement!.appendChild(key.cloneNode(true));
    await expect(plan(new XMLSerializer().serializeToString(doc))).rejects.toThrow();
  });
  it('inline と兄弟鍵の両方がある場合に推測しない', async () => {
    const doc = new DOMParser().parseFromString(fixture(128), 'application/xml');
    const key = doc.getElementsByTagNameNS(xenc, 'EncryptedKey')[0];
    const wrapper = doc.getElementsByTagNameNS(
      'urn:oasis:names:tc:SAML:2.0:assertion',
      'EncryptedAssertion'
    )[0];
    wrapper.appendChild(key.cloneNode(true));
    await expect(plan(new XMLSerializer().serializeToString(doc))).rejects.toThrow();
  });
});

describe('復号範囲と制限', () => {
  function groups(count: number): string {
    const parts: string[] = [];
    while (count > 0) {
      const size = Math.min(count, 100);
      parts.push('<group>' + '<extra/>'.repeat(size - 1) + '</group>');
      count -= size;
    }
    return parts.join('');
  }
  function addParameter(value: string): string {
    const doc = new DOMParser().parseFromString(fixture(128), 'application/xml');
    const key = doc.getElementsByTagNameNS('http://www.w3.org/2001/04/xmlenc#', 'EncryptedKey')[0];
    const method = Array.from(key.children).find(
      (element) => element.localName === 'EncryptionMethod'
    )!;
    const label = doc.createElementNS('http://www.w3.org/2001/04/xmlenc#', 'xenc:OAEPparams');
    label.textContent = value;
    method.appendChild(label);
    return new XMLSerializer().serializeToString(doc);
  }
  it('ラベルを厳密に base64 復号する', async () => {
    const parsed = await plan(addParameter(btoa('label')));
    expect(Array.from(parsed.label)).toEqual(Array.from(new TextEncoder().encode('label')));
  });
  it('OAEP ラベルが 1024 バイトを超える場合は拒否する', async () => {
    await expect(plan(addParameter(btoa('x'.repeat(1025))))).rejects.toThrow();
  });
  it('1024 バイトの OAEP ラベルを受け入れる', async () => {
    const result = await plan(addParameter(btoa('x'.repeat(1024))));
    expect(result.label).toHaveLength(1024);
  });
  it('正規でない base64 を拒否する', async () => {
    await expect(plan(addParameter('YR=='))).rejects.toThrow();
  });
  it('RSA-OAEP 1.1 の省略値は SHA-1 / MGF1-SHA1 とする', async () => {
    const xml = fixture(128).replace(
      'http://www.w3.org/2001/04/xmlenc#rsa-oaep-mgf1p',
      'http://www.w3.org/2009/xmlenc11#rsa-oaep'
    );
    await expect(plan(xml)).resolves.toMatchObject({ oaepHash: 'SHA-1' });
  });
  it('GCM 暗号文が 1 MiB + 28 byte を超えれば拒否する', async () => {
    const doc = new DOMParser().parseFromString(fixture(128), 'application/xml');
    const data = doc.getElementsByTagNameNS(
      'http://www.w3.org/2001/04/xmlenc#',
      'EncryptedData'
    )[0];
    const values = data.getElementsByTagNameNS('http://www.w3.org/2001/04/xmlenc#', 'CipherValue');
    values[values.length - 1].textContent = btoa('x'.repeat(1024 * 1024 + 29));
    await expect(plan(new XMLSerializer().serializeToString(doc))).rejects.toThrow();
  });
  it('ちょうど 1 MiB + 28 byte の GCM 暗号文を受け入れる', async () => {
    const doc = new DOMParser().parseFromString(fixture(128), 'application/xml');
    const data = doc.getElementsByTagNameNS(
      'http://www.w3.org/2001/04/xmlenc#',
      'EncryptedData'
    )[0];
    const values = data.getElementsByTagNameNS('http://www.w3.org/2001/04/xmlenc#', 'CipherValue');
    values[values.length - 1].textContent = btoa('x'.repeat(1024 * 1024 + 28));
    expect((await plan(new XMLSerializer().serializeToString(doc))).payload).toHaveLength(
      1024 * 1024 + 28
    );
  });
  it('2 MiB を超える XML を拒否する', async () => {
    await expect(plan(fixture(128) + ' '.repeat(2 * 1024 * 1024))).rejects.toThrow();
  });
  it('ちょうど 2 MiB の XML を受け入れる', async () => {
    const xml = fixture(128);
    const padding = 2 * 1024 * 1024 - new TextEncoder().encode(xml).length;
    await expect(plan(xml + ' '.repeat(padding))).resolves.toMatchObject({ aesBits: 128 });
  });
  it('10,000 要素を超える XML を拒否する', async () => {
    const xml = fixture(128).replace('</samlp:Response>', groups(10000) + '</samlp:Response>');
    await expect(plan(xml)).rejects.toThrow();
  });
  it('ちょうど 10,000 要素の XML を受け入れる', async () => {
    const xml = fixture(128);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const remaining = 10000 - doc.getElementsByTagName('*').length;
    await expect(
      plan(xml.replace('</samlp:Response>', groups(remaining) + '</samlp:Response>'))
    ).resolves.toMatchObject({ aesBits: 128 });
  });
  it('深さ 64 を超える XML を拒否する', async () => {
    const xml = fixture(128).replace(
      '</samlp:Response>',
      '<x>'.repeat(65) + '</x>'.repeat(65) + '</samlp:Response>'
    );
    await expect(plan(xml)).rejects.toThrow();
  });
  it('深さ 64 の XML を受け入れる', async () => {
    const xml = fixture(128).replace(
      '</samlp:Response>',
      '<x>'.repeat(63) + '</x>'.repeat(63) + '</samlp:Response>'
    );
    await expect(plan(xml)).resolves.toMatchObject({ aesBits: 128 });
  });
  it('16 件の暗号化 Assertion から選択できる', async () => {
    const xml = fixture(128);
    const assertion = xml.match(/<saml:EncryptedAssertion>[\s\S]*?<\/saml:EncryptedAssertion>/)![0];
    const sixteen = xml.replace(assertion, assertion.repeat(16));
    await expect(plan(sixteen, 15)).resolves.toMatchObject({ aesBits: 128 });
  });
});

describe('未対応方式と曖昧なパラメータ', () => {
  it.each([
    ['RSA1_5', (xml: string) => xml.replace('rsa-oaep-mgf1p', 'rsa-1_5')],
    [
      '3DES',
      (xml: string) =>
        xml.replace(
          'http://www.w3.org/2009/xmlenc11#aes128-gcm',
          'http://www.w3.org/2001/04/xmlenc#tripledes-cbc'
        ),
    ],
    ['AES-KW', (xml: string) => xml.replace('rsa-oaep-mgf1p', 'kw-aes128')],
    ['ECDH', (xml: string) => xml.replace('rsa-oaep-mgf1p', 'ECDH-ES')],
    ['Content Type', (xml: string) => xml.replace('#Element', '#Content')],
    [
      '不一致の KeySize',
      (xml: string) =>
        xml.replace(
          'xmlenc11#aes128-gcm"/>',
          'xmlenc11#aes128-gcm"><xenc:KeySize>256</xenc:KeySize></xenc:EncryptionMethod>'
        ),
    ],
    [
      '重複した KeySize',
      (xml: string) =>
        xml.replace(
          'xmlenc11#aes128-gcm"/>',
          'xmlenc11#aes128-gcm"><xenc:KeySize>128</xenc:KeySize><xenc:KeySize>128</xenc:KeySize></xenc:EncryptionMethod>'
        ),
    ],
    [
      '重複した DigestMethod',
      (xml: string) =>
        xml.replace(
          'rsa-oaep-mgf1p"/>',
          'rsa-oaep-mgf1p"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/></xenc:EncryptionMethod>'
        ),
    ],
    [
      '未知のアルゴリズム引数',
      (xml: string) =>
        xml.replace('rsa-oaep-mgf1p"/>', 'rsa-oaep-mgf1p"><xenc:Unknown/></xenc:EncryptionMethod>'),
    ],
    [
      'XML 名前空間の偽装',
      (xml: string) => xml.replace('http://www.w3.org/2001/04/xmlenc#', 'urn:spoof:xmlenc#'),
    ],
    [
      '外部 RetrievalMethod',
      (xml: string) =>
        xml.replace(
          '<xenc:EncryptedKey>',
          '<ds:RetrievalMethod URI="https://example.invalid/key"/><xenc:EncryptedKey>'
        ),
    ],
    [
      'DTD',
      (xml: string) =>
        xml.replace('?>', '?><!DOCTYPE samlp:Response SYSTEM "https://example.invalid/dtd">'),
    ],
  ] as const)('%s を拒否する', async (_name, transform) => {
    await expect(plan(transform(fixture(128)))).rejects.toThrow();
  });
});
