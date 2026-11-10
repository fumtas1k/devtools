import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

const dir = 'tests/fixtures/saml-encryption/';
const ns = 'http://www.w3.org/2001/04/xmlenc#';
const read = (name: string) => readFileSync(dir + name, 'utf8');

async function decryptFixture(bits: number, tamper = false, oaep11 = false): Promise<string> {
  const pem = read('trial-key.pem');
  const pkcs8 = Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64');
  const key = await webcrypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'RSA-OAEP', hash: oaep11 ? 'SHA-256' : 'SHA-1' },
    false,
    ['decrypt']
  );
  const doc = new DOMParser().parseFromString(
    read(`xmlsec-aes${bits}${oaep11 ? '-oaep11' : ''}.xml`),
    'application/xml'
  );
  const data = doc.getElementsByTagNameNS(ns, 'EncryptedData')[0];
  const encryptedKey = data.getElementsByTagNameNS(ns, 'EncryptedKey')[0];
  const keyValue = encryptedKey.getElementsByTagNameNS(ns, 'CipherValue')[0].textContent ?? '';
  const values = data.getElementsByTagNameNS(ns, 'CipherValue');
  const payload = Buffer.from(values[values.length - 1].textContent ?? '', 'base64');
  if (tamper) payload[payload.length - 1] ^= 1;
  const cek = await webcrypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    key,
    Buffer.from(keyValue, 'base64')
  );
  const aes = await webcrypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plaintext = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: payload.subarray(0, 12), tagLength: 128 },
    aes,
    payload.subarray(12)
  );
  return Buffer.from(plaintext).toString('utf8');
}

describe('独立 libxmlsec 生成 fixture の整合性', () => {
  it.each([128, 256])('AES-%i-GCM の平文が期待値と一致する', async (bits) => {
    await expect(decryptFixture(bits)).resolves.toBe(read('expected.xml'));
  });

  it.each([128, 256])('AES-%i-GCM のタグ改変を拒否する', async (bits) => {
    await expect(decryptFixture(bits, true)).rejects.toThrow();
  });

  it.each([128, 256])('AES-%i-GCM と RSA-OAEP 1.1 SHA-256 の平文が一致する', async (bits) => {
    await expect(decryptFixture(bits, false, true)).resolves.toBe(read('expected.xml'));
  });

  it.each([128, 256])('RSA-OAEP 1.1 fixture の GCM タグ改変を拒否する', async (bits) => {
    expect(read(`xmlsec-aes${bits}-oaep11.xml`)).toContain('rsa-oaep');
    await expect(decryptFixture(bits, true, true)).rejects.toThrow();
  });
});
