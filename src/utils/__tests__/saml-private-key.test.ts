import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { parsePrivateKeyPem } from '../saml/decryption-key';
const pem = readFileSync('tests/fixtures/saml-encryption/trial-key.pem', 'utf8');
async function parse(input: string) {
  return parsePrivateKeyPem(input);
}

describe('復号用秘密鍵', () => {
  it('単一の PKCS#8 PEM を DER に変換する', async () => {
    expect((await parse(pem))?.length).toBeGreaterThan(1000);
  });
  it.each([
    ['複数の鍵', pem + pem],
    ['余分な PEM 以外の文字', pem + 'abc'],
    ['PKCS#1', pem.replaceAll('PRIVATE KEY', 'RSA PRIVATE KEY')],
    ['暗号化 PKCS#8', pem.replaceAll('PRIVATE KEY', 'ENCRYPTED PRIVATE KEY')],
    ['不正 base64', pem.replace(/\n[A-Za-z0-9]/, '\n!')],
    ['上限超過', ' '.repeat(65537) + pem],
    ['JWK', '{"kty":"RSA","n":"dummy"}'],
    ['PFX の base64', 'MIIEAgIBAzCCBAgGCSqGSIb3DQEHAaCCA/kEggP1'],
  ])('%s を拒否する', async (_label, input) => {
    await expect(parse(input)).rejects.toThrow();
  });
  it('64 KiB の PEM は上限内として受け入れる', async () => {
    const padded = ' '.repeat(65536 - pem.length) + pem;
    expect((await parse(padded)).length).toBeGreaterThan(1000);
  });
  it('EC の PKCS#8 を拒否する', async () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    });
    await expect(parse(ec)).rejects.toThrow();
  });
  it('DER の後ろの余分なデータを拒否する', async () => {
    const body = pem.replace(/-----[^-]+-----|\s/g, '');
    const bytes = Buffer.concat([Buffer.from(body, 'base64'), Buffer.from([0])]);
    await expect(
      parse(`-----BEGIN PRIVATE KEY-----\n${bytes.toString('base64')}\n-----END PRIVATE KEY-----`)
    ).rejects.toThrow();
  });
  it('任意属性を持つ非暗号化 PKCS#8 を受け入れる', async () => {
    const body = pem.replace(/-----[^-]+-----|\s/g, '');
    const bytes = Buffer.from(body, 'base64');
    const lengthBytes = bytes[1] & 0x7f;
    const length = bytes.readUIntBE(2, lengthBytes);
    const withAttributes = Buffer.concat([bytes, Buffer.from([0xa0, 0])]);
    withAttributes.writeUIntBE(length + 2, 2, lengthBytes);
    const input = `-----BEGIN PRIVATE KEY-----\n${withAttributes.toString('base64')}\n-----END PRIVATE KEY-----`;
    expect((await parse(input)).length).toBe(withAttributes.length);
  });

  it.each([
    ['不正な INTEGER', Buffer.from([0xa0, 0x03, 0x02, 0x01, 0x2a])],
    ['不正な Attribute SEQUENCE', Buffer.from([0xa0, 0x05, 0x30, 0x03, 0x02, 0x01, 0x2a])],
    [
      '非空 Attribute',
      Buffer.from([
        0xa0, 0x11, 0x30, 0x0f, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x14,
        0x31, 0x02, 0x0c, 0x00,
      ]),
    ],
    [
      '追加の鍵を含む OCTET STRING',
      (() => {
        const der = Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64');
        const size = Buffer.from([0x82, der.length >> 8, der.length & 0xff]);
        const octet = Buffer.concat([Buffer.from([0x04]), size, der]);
        const outerSize = Buffer.from([0x82, octet.length >> 8, octet.length & 0xff]);
        return Buffer.concat([Buffer.from([0xa0]), outerSize, octet]);
      })(),
    ],
  ])('PKCS#8 任意属性内の%sを拒否する', async (_name, attribute) => {
    const der = Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64');
    const lengthBytes = der[1] & 0x7f;
    const length = der.readUIntBE(2, lengthBytes);
    const combined = Buffer.concat([der, attribute]);
    combined.writeUIntBE(length + attribute.length, 2, lengthBytes);
    const input = `-----BEGIN PRIVATE KEY-----\n${combined.toString('base64')}\n-----END PRIVATE KEY-----`;
    await expect(parse(input)).rejects.toThrow();
  });
});
