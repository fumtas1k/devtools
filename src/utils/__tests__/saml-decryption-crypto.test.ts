// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import {
  webcrypto,
  generateKeyPairSync,
  createPublicKey,
  publicEncrypt,
  constants,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDecryptionPlan } from '../saml/decryption-profile';
import { parsePrivateKeyPem } from '../saml/decryption-key';

import { decryptPlan } from '../saml/decryption-crypto';
const read = (name: string) => readFileSync(`tests/fixtures/saml-encryption/${name}`, 'utf8');
async function decrypt(
  bits: number,
  options: { oaep11?: boolean; tamper?: boolean; pem?: string } = {}
) {
  const xml = read(`xmlsec-aes${bits}${options.oaep11 ? '-oaep11' : ''}.xml`);
  const plan = createDecryptionPlan(xml, 0);
  if (options.tamper) plan.payload[plan.payload.length - 1] ^= 1;
  const der = parsePrivateKeyPem(options.pem ?? read('trial-key.pem'));
  return decryptPlan(plan, der, webcrypto.subtle as unknown as SubtleCrypto);
}

describe('復号 Worker の暗号処理', () => {
  it.each([128, 256])('libxmlsec AES-%i / OAEP-SHA1 を復号する', async (bits) => {
    const plaintext = await decrypt(bits);
    expect(new TextDecoder().decode(plaintext)).toBe(read('expected.xml'));
  });
  it.each([128, 256])('libxmlsec AES-%i / OAEP11-SHA256 を復号する', async (bits) => {
    const plaintext = await decrypt(bits, { oaep11: true });
    expect(new TextDecoder().decode(plaintext)).toBe(read('expected.xml'));
  });
  it('GCM タグの改変を拒否する', async () => {
    await expect(decrypt(128, { tamper: true })).rejects.toThrow();
  });
  it.each(['iv', 'ciphertext', 'truncated'] as const)('GCM %s の破損を拒否する', async (part) => {
    const plan = createDecryptionPlan(read('xmlsec-aes128.xml'), 0);
    if (part === 'iv') plan.payload[0] ^= 1;
    if (part === 'ciphertext') plan.payload[12] ^= 1;
    if (part === 'truncated') plan.payload = plan.payload.slice(0, -1);
    const der = parsePrivateKeyPem(read('trial-key.pem'));
    await expect(
      decryptPlan(plan, der, webcrypto.subtle as unknown as SubtleCrypto)
    ).rejects.toThrow();
    expect(der.every((byte) => byte === 0)).toBe(true);
  });
  it('異なる RSA 秘密鍵を拒否する', async () => {
    const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    });
    await expect(decrypt(128, { pem: key })).rejects.toThrow();
  });

  it('復号鍵長と宣言された AES 鍵長が異なる場合は拒否する', async () => {
    const plan = createDecryptionPlan(read('xmlsec-aes128.xml'), 0);
    plan.aesBits = 256;
    const der = parsePrivateKeyPem(read('trial-key.pem'));
    await expect(
      decryptPlan(plan, der, webcrypto.subtle as unknown as SubtleCrypto)
    ).rejects.toThrow('AES 鍵の長さ');
    expect(der.every((byte) => byte === 0)).toBe(true);
  });

  it('RSA 暗号文の長さが鍵に合わない場合は拒否する', async () => {
    const plan = createDecryptionPlan(read('xmlsec-aes128.xml'), 0);
    plan.encryptedKey = plan.encryptedKey.slice(1);
    const der = parsePrivateKeyPem(read('trial-key.pem'));
    await expect(
      decryptPlan(plan, der, webcrypto.subtle as unknown as SubtleCrypto)
    ).rejects.toThrow('暗号文の長さ');
    expect(der.every((byte) => byte === 0)).toBe(true);
  });

  it('2048 bit 未満の鍵を拒否する', async () => {
    const weak = read('trial-weak-1024.pem');
    const plan = createDecryptionPlan(read('xmlsec-aes128.xml'), 0);
    const der = parsePrivateKeyPem(weak);
    const imported = await webcrypto.subtle.importKey(
      'pkcs8',
      der,
      { name: 'RSA-OAEP', hash: 'SHA-1' },
      false,
      ['decrypt']
    );
    expect((imported.algorithm as RsaHashedKeyAlgorithm).modulusLength).toBe(1024);
    // 暗号文長の別ガードが下限ガードの欠落を隠さないよう、実鍵の長さに合わせる。
    plan.encryptedKey = plan.encryptedKey.slice(0, 128);
    await expect(
      decryptPlan(plan, der, webcrypto.subtle as unknown as SubtleCrypto)
    ).rejects.toThrow('RSA 鍵の長さ');
    expect(der.every((byte) => byte === 0)).toBe(true);
  });
  it.each([
    [8192, true],
    [8193, false],
  ] as const)('RSA 鍵長 %i bit の上限を判定する', async (bits, accepted) => {
    // 生成コストの高い境界鍵に代え、importKey が返す鍵長だけを制御し、実際のガードを通す。
    const subtle = {
      importKey: async () => ({ algorithm: { modulusLength: bits } }),
      decrypt: async () => new Uint8Array(16).buffer,
    } as unknown as SubtleCrypto;
    const plan = createDecryptionPlan(read('xmlsec-aes128.xml'), 0);
    plan.encryptedKey = new Uint8Array(Math.ceil(bits / 8));
    const der = parsePrivateKeyPem(read('trial-key.pem'));
    if (accepted) await expect(decryptPlan(plan, der, subtle)).resolves.toBeInstanceOf(Uint8Array);
    else await expect(decryptPlan(plan, der, subtle)).rejects.toThrow('RSA 鍵の長さ');
    expect(der.every((byte) => byte === 0)).toBe(true);
  });

  it('OAEP ラベル付きの暗号文を指定されたラベルで復号する', async () => {
    const plan = createDecryptionPlan(read('xmlsec-aes128-oaep11.xml'), 0);
    const label = new TextEncoder().encode('試験ラベル');
    const cek = new Uint8Array(16).fill(7);
    const iv = new Uint8Array(12).fill(3);
    const aes = await webcrypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const encrypted = new Uint8Array(
      await webcrypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aes,
        new TextEncoder().encode(read('expected.xml'))
      )
    );
    const payload = new Uint8Array(iv.length + encrypted.length);
    payload.set(iv);
    payload.set(encrypted, iv.length);
    const publicKey = createPublicKey(read('trial-key.pem'));
    const encryptedKey = publicEncrypt(
      {
        key: publicKey,
        oaepHash: 'sha256',
        oaepLabel: label,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
      },
      cek
    );
    plan.label = label;
    plan.encryptedKey = new Uint8Array(encryptedKey);
    plan.payload = payload;
    const der = parsePrivateKeyPem(read('trial-key.pem'));
    const plaintext = await decryptPlan(plan, der, webcrypto.subtle as unknown as SubtleCrypto);
    expect(new TextDecoder().decode(plaintext)).toBe(read('expected.xml'));
  });
});
