import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { MAX_HASH_FILE_BYTES, hashFile, sha256 } from '../sha256';

describe('SHA-256', () => {
  it('空入力に標準のダイジェストを返す', async () => {
    expect(await sha256(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('上限32 MiBのバイナリを末尾まで計算する', async () => {
    const bytes = new Uint8Array(MAX_HASH_FILE_BYTES);
    bytes[bytes.length - 1] = 0xff;
    const file = new Blob([bytes]);
    expect(await hashFile(file)).toBe(createHash('sha256').update(bytes).digest('hex'));
  });

  it('上限を1バイト超えるファイルを読み取り前に拒否する', async () => {
    const arrayBuffer = vi.fn();
    await expect(hashFile({ size: MAX_HASH_FILE_BYTES + 1, arrayBuffer })).rejects.toThrow(
      '32 MiB'
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
