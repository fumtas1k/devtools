import { describe, it, expect, beforeAll } from 'vitest';
import { parseCertificates, extractAttributeValue, formatIpAddress } from '@/utils/cert/parse';
import { makeTestChain, makeRsaCert, type TestChain } from './cert-fixtures';

let chain: TestChain;
beforeAll(async () => {
  chain = await makeTestChain();
});

describe('parseCertificates', () => {
  it('空入力は topLevelError を返す', async () => {
    const r = await parseCertificates('');
    expect(r.certs).toHaveLength(0);
    expect(r.topLevelError).toBeTruthy();
  });

  it('PEM の leaf 証明書から主要フィールドを抽出する', async () => {
    const r = await parseCertificates(chain.leafPem);
    expect(r.certs).toHaveLength(1);
    const c = r.certs[0];
    expect(c.error).toBeUndefined();
    expect(c.subject.full).toContain('CN=');
    expect(c.san).toContain('DNS:example.test');
    expect(c.notAfter.getTime()).toBeGreaterThan(Date.now());
    expect(c.fingerprintSha256).toMatch(/^[0-9A-F:]+$/i);
    expect(c.publicKey.algorithm).toBe('EC');
  });

  it('複数 PEM ブロックを全件パースする', async () => {
    const all = `${chain.leafPem}\n${chain.intermediatePem}\n${chain.rootPem}`;
    const r = await parseCertificates(all);
    expect(r.certs).toHaveLength(3);
  });

  it('壊れた1枚があっても他の証明書はパースを継続する', async () => {
    const broken = `-----BEGIN CERTIFICATE-----\nMIIBADGARBAGE\n-----END CERTIFICATE-----`;
    const r = await parseCertificates(`${chain.leafPem}\n${broken}`);
    expect(r.certs.length).toBeGreaterThanOrEqual(1);
    expect(r.certs.some((c) => c.error)).toBe(true);
  });

  it('2048bit RSA 証明書の鍵長を正確に算出する（modulus 長から）', async () => {
    const der = await makeRsaCert();
    const r = await parseCertificates(der);
    expect(r.certs).toHaveLength(1);
    expect(r.certs[0].publicKey.algorithm).toBe('RSA');
    // BIT STRING 全体長からの概算（旧実装は 2080 等にずれる）ではなく modulus 長から 2048 を得る
    expect(r.certs[0].publicKey.keySizeBits).toBe(2048);
  });

  it('EC 証明書の曲線を P-256 として返す', async () => {
    const r = await parseCertificates(chain.leafPem);
    expect(r.certs[0].publicKey.namedCurve).toBe('P-256');
  });

  it('1 MiB を超える入力は topLevelError を返す（#1b 入力長ガード・陽性対照）', async () => {
    const tooLarge = 'a'.repeat(1024 * 1024 + 1);
    const r = await parseCertificates(tooLarge);
    expect(r.certs).toHaveLength(0);
    expect(r.topLevelError).toBeTruthy();
  });

  it('上限直下の正常な PEM は通常どおりパースできる（陰性対照）', async () => {
    const r = await parseCertificates(chain.leafPem);
    expect(r.certs).toHaveLength(1);
    expect(r.certs[0].error).toBeUndefined();
  });
});

describe('extractAttributeValue（#4 DN 値の整形）', () => {
  it('valueBlock.value が文字列ならそのまま返す', () => {
    expect(extractAttributeValue({ valueBlock: { value: 'example.test' } })).toBe('example.test');
  });

  it('文字列でなく valueHexView を持つ場合は hex にフォールバックする', () => {
    expect(
      extractAttributeValue({
        valueBlock: { valueHexView: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) },
      })
    ).toBe('deadbeef');
  });

  it('値が取り出せない場合は空文字を返す（[object Object] にしない）', () => {
    expect(extractAttributeValue(null)).toBe('');
    expect(extractAttributeValue({})).toBe('');
  });
});

describe('formatIpAddress（#6 IPv6 圧縮）', () => {
  it('IPv4（4 byte）はドット表記', () => {
    expect(formatIpAddress(new Uint8Array([192, 168, 0, 1]))).toBe('192.168.0.1');
  });

  it('IPv6 のゼロ連続を :: に圧縮する', () => {
    const bytes = new Uint8Array([0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(formatIpAddress(bytes)).toBe('2001:db8::1');
  });

  it('全ゼロは :: になる', () => {
    expect(formatIpAddress(new Uint8Array(16))).toBe('::');
  });

  it('ループバック ::1', () => {
    const bytes = new Uint8Array(16);
    bytes[15] = 1;
    expect(formatIpAddress(bytes)).toBe('::1');
  });

  it('長さ1のゼロ群は圧縮しない', () => {
    // 2001:0:1:0:1:1:1:1（各ゼロ群は長さ1）
    const bytes = new Uint8Array([0x20, 0x01, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1]);
    expect(formatIpAddress(bytes)).toBe('2001:0:1:0:1:1:1:1');
  });

  it('複数のゼロ連続がある場合は最長を圧縮する', () => {
    // 0:0:1:0:0:0:0:1 → 後半の長さ4を圧縮 → 0:0:1::1
    const bytes = new Uint8Array([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(formatIpAddress(bytes)).toBe('0:0:1::1');
  });
});
