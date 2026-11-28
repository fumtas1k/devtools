import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { MAX_HASH_FILE_BYTES, SHA2_ALGORITHMS, hashBytes, hashFile } from '../sha2';

describe('SHA-2', () => {
  it('空入力に標準のダイジェストを返す', async () => {
    expect(await hashBytes('SHA-256', new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it.each(SHA2_ALGORITHMS)('%sでバイナリを正しく計算する', async (algorithm) => {
    const bytes = Uint8Array.of(0xff, 0x00, 0x0d, 0x0a);
    const expected = createHash(algorithm.toLowerCase().replace('-', ''))
      .update(bytes)
      .digest('hex');
    expect(await hashFile(algorithm, new Blob([bytes]))).toBe(expected);
  });

  it('上限32 MiBのバイナリを末尾まで計算する', async () => {
    const bytes = new Uint8Array(MAX_HASH_FILE_BYTES);
    bytes[bytes.length - 1] = 0xff;
    const file = new Blob([bytes]);
    expect(await hashFile('SHA-512', file)).toBe(createHash('sha512').update(bytes).digest('hex'));
  });

  it('上限を1バイト超えるファイルを読み取り前に拒否する', async () => {
    const arrayBuffer = vi.fn();
    await expect(
      hashFile('SHA-256', { size: MAX_HASH_FILE_BYTES + 1, arrayBuffer })
    ).rejects.toThrow('32 MiB');
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
