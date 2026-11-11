import type { DecryptionPlan } from './decryption-profile';

/** 復号 Worker 専用。認証失敗時には平文を返さない。 */
export async function decryptPlan(
  plan: DecryptionPlan,
  keyDer: Uint8Array<ArrayBuffer>,
  subtle: SubtleCrypto = crypto.subtle
): Promise<Uint8Array<ArrayBuffer>> {
  let cek: Uint8Array<ArrayBuffer> | undefined;
  try {
    const rsa = await subtle.importKey(
      'pkcs8',
      keyDer,
      { name: 'RSA-OAEP', hash: plan.oaepHash },
      false,
      ['decrypt']
    );
    const modulusLength = (rsa.algorithm as RsaHashedKeyAlgorithm).modulusLength;
    if (
      modulusLength < 2048 ||
      modulusLength > 8192 ||
      plan.encryptedKey.length !== Math.ceil(modulusLength / 8)
    )
      throw new Error('RSA 鍵の長さまたは暗号文の長さに対応していません');
    cek = new Uint8Array(
      await subtle.decrypt({ name: 'RSA-OAEP', label: plan.label }, rsa, plan.encryptedKey)
    );
    if (cek.length !== plan.aesBits / 8) throw new Error('復号した AES 鍵の長さが一致しません');
    if (plan.payload.length < 28 || plan.payload.length > 1024 * 1024 + 28)
      throw new Error('暗号文の長さに対応していません');
    const aes = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const plaintext = await subtle.decrypt(
      { name: 'AES-GCM', iv: plan.payload.subarray(0, 12), tagLength: 128 },
      aes,
      plan.payload.subarray(12)
    );
    return new Uint8Array(plaintext);
  } finally {
    keyDer.fill(0);
    cek?.fill(0);
  }
}
