export const MAX_HASH_FILE_BYTES = 32 * 1024 * 1024;

export const SHA2_ALGORITHMS = ['SHA-256', 'SHA-384', 'SHA-512'] as const;
export type Sha2Algorithm = (typeof SHA2_ALGORITHMS)[number];

export async function hashBytes(algorithm: Sha2Algorithm, bytes: BufferSource): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(algorithm, bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashFile(
  algorithm: Sha2Algorithm,
  file: Pick<File, 'size' | 'arrayBuffer'>
): Promise<string> {
  if (file.size > MAX_HASH_FILE_BYTES) {
    throw new RangeError('32 MiB以下のファイルを選んでください。');
  }
  return hashBytes(algorithm, await file.arrayBuffer());
}
