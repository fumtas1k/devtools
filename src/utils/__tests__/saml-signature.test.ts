// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { signatureSnapshot } from '../saml/signature-profile';

const fixture = (name: string) => readFileSync(`tests/fixtures/saml-signature/${name}`, 'utf8');
const browserParser = DOMParser;
async function verifyXml(xml: string, certificate = 'certificate.pem') {
  const snapshot = signatureSnapshot(new browserParser().parseFromString(xml, 'text/xml'));
  const { verifySignatures } = await import('../saml/signature-verify');
  return verifySignatures(xml, snapshot, fixture(certificate));
}

const verify = (name: string, certificate = 'certificate.pem') =>
  verifyXml(fixture(name), certificate);

describe('独立生成した SAML XML 署名', () => {
  it.each(['response.xml', 'assertion.xml', 'both.xml', 'multiple.xml', 'namespaces.xml'])(
    '%s の各署名を検証する',
    async (name) => {
      const results = await verify(name);
      expect(results, JSON.stringify(results)).toContainEqual(
        expect.objectContaining({ status: 'match' })
      );
      expect(results.every((r) => r.status === 'match' || r.status === 'unsigned')).toBe(true);
    }
  );
  it.each(['tampered-content.xml', 'tampered-signature.xml', 'wrong-digest.xml'])(
    '%s の不一致を検出する',
    async (name) => {
      expect((await verify(name)).some((r) => r.status === 'mismatch')).toBe(true);
    }
  );
  it('異なる証明書を拒否する', async () => {
    expect((await verify('response.xml', 'other-certificate.pem'))[0].status).toBe('mismatch');
  });
  it('弱い RSA 鍵を拒否する', async () => {
    expect((await verify('weak.xml', 'weak-certificate.pem'))[0].status).toBe('input-error');
  });
  it('上限を超える RSA 鍵を拒否する', async () => {
    expect((await verify('response.xml', 'overlong-certificate.pem'))[0].status).toBe(
      'input-error'
    );
  });
  it('InclusiveNamespaces を拒否する', async () => {
    expect((await verify('inclusive-prefixes.xml'))[0].status).toBe('unsupported');
  });
});

describe('署名プロファイルの拒否', () => {
  const xml = fixture('response.xml');
  it.each([
    ['重複 ID', xml.replace('ID="_assertion"', 'ID="_response"')],
    ['ID の別名', xml.replace('ID="_assertion"', 'Id="_assertion"')],
    ['名前空間付き ID', xml.replace('ID="_assertion"', 'saml:ID="_assertion"')],
    ['別対象参照', xml.replace('URI="#_response"', 'URI="#_assertion"')],
    ['外部参照', xml.replace('URI="#_response"', 'URI="https://example.test/x"')],
    ['空参照', xml.replace('URI="#_response"', 'URI=""')],
    ['XPointer', xml.replace('URI="#_response"', 'URI="#xpointer(id(_response))"')],
    [
      '未知の変換',
      xml.replace(
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/TR/1999/REC-xpath-19991116'
      ),
    ],
    [
      'DigestValue の子要素',
      xml.replace('<ds:DigestValue>', '<ds:DigestValue><ds:KeyName>x</ds:KeyName>'),
    ],
    [
      'SignatureValue の子要素',
      xml.replace('<ds:SignatureValue>', '<ds:SignatureValue><ds:KeyName>x</ds:KeyName>'),
    ],
    [
      '証明書の子要素',
      xml.replace('<ds:X509Certificate>', '<ds:X509Certificate><ds:KeyName>x</ds:KeyName>'),
    ],
    ['隠れた署名', xml.replace('<saml:Subject>', '<saml:Subject><ds:Signature/>')],
    ['Object', xml.replace('</ds:Signature>', '<ds:Object/></ds:Signature>')],
    ['署名方式', xml.replace('rsa-sha256', 'rsa-sha1')],
    [
      '未知 digest',
      xml.replace(
        'http://www.w3.org/2001/04/xmlenc#sha256',
        'http://www.w3.org/2000/09/xmldsig#sha1'
      ),
    ],
    [
      'C14N コメントあり',
      xml.replace(
        'http://www.w3.org/2001/10/xml-exc-c14n#',
        'http://www.w3.org/2001/10/xml-exc-c14n#WithComments'
      ),
    ],
    [
      'C14N 1.1',
      xml.replace(
        'http://www.w3.org/2001/10/xml-exc-c14n#',
        'http://www.w3.org/2006/12/xml-c14n11'
      ),
    ],
    ['複数参照', xml.replace('</ds:Reference>', '</ds:Reference><ds:Reference URI="#_response"/>')],
    ['複数署名', xml.replace('</ds:Signature>', '</ds:Signature><ds:Signature/>')],
    [
      '変換順序逆',
      xml
        .replace('http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'TEMP')
        .replace(
          'http://www.w3.org/2001/10/xml-exc-c14n#"/></ds:Transforms>',
          'http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></ds:Transforms>'
        )
        .replace('TEMP', 'http://www.w3.org/2001/10/xml-exc-c14n#'),
    ],
    [
      'wrapping',
      xml
        .replace('<ds:Signature>', '<saml:Subject><ds:Signature>')
        .replace('</ds:Signature>', '</ds:Signature></saml:Subject>'),
    ],
  ])('%s を拒否する', async (_label, input) => {
    expect((await verifyXml(input)).some((result) => result.status === 'unsupported')).toBe(true);
  });
  it('正しい埋め込み証明書があっても別の指定証明書を使う', async () => {
    expect((await verify('response.xml', 'other-certificate.pem'))[0].status).toBe('mismatch');
  });
  it.each([
    '',
    'invalid',
    '-----BEGIN PRIVATE KEY-----\naaaa\n-----END PRIVATE KEY-----',
    fixture('certificate.pem') + fixture('other-certificate.pem'),
  ])('不正な証明書を拒否する', async (pem) => {
    const snapshot = signatureSnapshot(new browserParser().parseFromString(xml, 'text/xml'));
    const { verifySignatures } = await import('../saml/signature-verify');
    expect((await verifySignatures(xml, snapshot, pem))[0].status).toBe('input-error');
  });
  it('DTD を拒否する', async () => {
    const { verifySignatures } = await import('../saml/signature-verify');
    await expect(
      verifySignatures(
        '<!DOCTYPE x [<!ENTITY x SYSTEM "https://example.test">]>' + xml,
        '',
        fixture('certificate.pem')
      )
    ).rejects.toThrow('DTD');
  });
  it('表示 DOM と worker DOM の不一致を拒否する', async () => {
    const { verifySignatures } = await import('../saml/signature-verify');
    const altered = signatureSnapshot(
      new browserParser().parseFromString(xml.replace('reader', 'admin'), 'text/xml')
    );
    await expect(verifySignatures(xml, altered, fixture('certificate.pem'))).rejects.toThrow(
      '解析結果が一致しない'
    );
  });
  it('解析上限を超えた XML を拒否する', async () => {
    const { verifySignatures } = await import('../saml/signature-verify');
    await expect(verifySignatures('x'.repeat(2 * 1024 * 1024 + 1), '', '')).rejects.toThrow(
      '2 MiB'
    );
    await expect(
      verifySignatures(
        xml,
        signatureSnapshot(new browserParser().parseFromString(xml, 'text/xml')),
        'x'.repeat(64 * 1024 + 1)
      )
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'input-error' })])
    );
  });
  it.each([
    ['要素数', '<r>' + '<x/>'.repeat(10000) + '</r>', '10,000'],
    ['深さ', '<r>'.repeat(65) + '</r>'.repeat(65), '深さ'],
    [
      '署名数',
      '<r xmlns:ds="http://www.w3.org/2000/09/xmldsig#">' + '<ds:Signature/>'.repeat(17) + '</r>',
      '16 個',
    ],
  ])('%s の上限を拒否する', (_name, input, reason) => {
    expect(() => signatureSnapshot(new browserParser().parseFromString(input, 'text/xml'))).toThrow(
      reason
    );
  });
  it.each(['<root a="1" a="2"/>', '<root><broken></root>'])(
    '重複属性・不正 XML をブラウザ parser が拒否する',
    (input) => {
      expect(
        new browserParser().parseFromString(input, 'text/xml').getElementsByTagName('parsererror')
          .length
      ).toBeGreaterThan(0);
    }
  );
});

describe('名前空間の署名検証プロファイル', () => {
  const xml = fixture('response.xml');
  const inputs = [
    ['query の &', 'xmlns:extra="https://example.test/ns?a=1&amp;b=2"'],
    ['空白', 'xmlns:extra="urn:example:one two"'],
    ['二重引用符', 'xmlns:extra="urn:example:&quot;value"'],
    ['タブ', 'xmlns:extra="urn:example:&#x9;value"'],
    ['改行', 'xmlns:extra="urn:example:&#xA;value"'],
    ['復帰', 'xmlns:extra="urn:example:&#xD;value"'],
    ['小なり', 'xmlns:extra="urn:example:&lt;value"'],
    ['大なり', 'xmlns:extra="urn:example:&gt;value"'],
    ['非 ASCII prefix', 'xmlns:日本語="urn:example:namespace"'],
  ] as const;
  it.each(inputs)('%s の名前空間を検証前に拒否する', async (_label, declaration) => {
    const input = xml.replace('<samlp:Response ', `<samlp:Response ${declaration} `);
    const doc = new browserParser().parseFromString(input, 'text/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(() => signatureSnapshot(doc)).toThrow('名前空間');
    const { verifySignatures } = await import('../saml/signature-verify');
    await expect(verifySignatures(input, '', fixture('certificate.pem'))).rejects.toThrow(
      '名前空間'
    );
  });
  it('通常のテキストと属性値に含まれる日本語と & は受け入れる', () => {
    const input = xml
      .replace('Destination="https://sp.example.test/acs"', 'Destination="日本語 &amp; value"')
      .replace('alice@example.test', '日本語 &amp; Alice');
    const doc = new browserParser().parseFromString(input, 'text/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(() => signatureSnapshot(doc)).not.toThrow();
  });
});

describe('名前空間属性の正規化ガード', () => {
  it.each([
    ['Response', 'response.xml', '<samlp:Response ', 'xxmlns'],
    ['Assertion', 'assertion.xml', '<saml:Assertion ', 'xxmlns'],
    ['別 prefix', 'response.xml', '<samlp:Response ', 'a-xmlns'],
  ])('%s の偽の名前空間属性を検証前に拒否する', async (_label, name, target, prefix) => {
    const xml = fixture(name).replace(
      target,
      `${target}xmlns:${prefix}="urn:example:extra" ${prefix}:role="admin" `
    );
    const doc = new browserParser().parseFromString(xml, 'text/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    await expect(verifyXml(xml)).rejects.toThrow('名前空間');
    const { verifySignatures } = await import('../saml/signature-verify');
    await expect(verifySignatures(xml, '', fixture('certificate.pem'))).rejects.toThrow('名前空間');
  });
  it('通常の名前空間付き属性の追加は署名不一致になる', async () => {
    const xml = fixture('response.xml').replace(
      '<samlp:Response ',
      '<samlp:Response xmlns:extra="urn:example:extra" extra:role="admin" '
    );
    expect((await verifyXml(xml))[0].status).toBe('mismatch');
  });
});

describe('空の default 名前空間宣言', () => {
  it('表示用 XML はそのまま解析し、署名検証では未対応として拒否する', async () => {
    const xml = fixture('response.xml').replace('<saml:Subject>', '<saml:Subject xmlns="">');
    const doc = new browserParser().parseFromString(xml, 'text/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(
      doc.getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:assertion', 'NameID')[0].textContent
    ).toBe('alice@example.test');
    await expect(verifyXml(xml)).rejects.toThrow('空の default 名前空間宣言');
    const { verifySignatures } = await import('../saml/signature-verify');
    await expect(verifySignatures(xml, '', fixture('certificate.pem'))).rejects.toThrow(
      '空の default 名前空間宣言'
    );
  });
  it('同じ文字列が通常のテキストや属性値にあっても拒否しない', () => {
    const xml = fixture('response.xml')
      .replace('alice@example.test', 'xmlns=""')
      .replace('Destination="https://sp.example.test/acs"', 'Destination="xmlns=&quot;&quot;"');
    expect(() =>
      signatureSnapshot(new browserParser().parseFromString(xml, 'text/xml'))
    ).not.toThrow();
  });
});
