export const MAX_HASH_FILE_BYTES = 32 * 1024 * 1024;

export async function sha256(bytes: BufferSource): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashFile(file: Pick<File, 'size' | 'arrayBuffer'>): Promise<string> {
  if (file.size > MAX_HASH_FILE_BYTES) {
    throw new RangeError('32 MiB以下のファイルを選んでください。');
  }
  return sha256(await file.arrayBuffer());
}
