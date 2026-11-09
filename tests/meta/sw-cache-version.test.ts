import { afterEach, describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...original,
    access: vi.fn(original.access),
    readFile: vi.fn(original.readFile),
  };
});

/**
 * meta test: SW cache versioning 検証 (issue #358)
 *
 * build 後の `dist/sw.js` を読み、`CACHE_NAME` が commit SHA で置換済みかを機械的に検証。
 * `CACHE_NAME = 'devtools-v1'` 固定のまま deploy すると古い cache が永続化し
 * hydration mismatch が起きうるため、build pipeline の注入が確実に動いていることを CI で保証する。
 */

const swDistPath = fileURLToPath(new URL('../../dist/sw.js', import.meta.url));

const PLACEHOLDER = '__BUILD_ID__';
const CACHE_NAME_RE = /const CACHE_NAME = 'devtools-[a-f0-9]{7,40}'/;

/** dist/sw.js に未置換 placeholder が残っているか検出する */
function hasPlaceholder(content: string): boolean {
  return content.includes(PLACEHOLDER);
}

/** CACHE_NAME が期待形式 devtools-{sha} ではないか検出する (true = NG) */
function hasInvalidCacheName(content: string): boolean {
  return !CACHE_NAME_RE.test(content);
}

async function readSwDist(): Promise<string> {
  try {
    return await fs.readFile(swDistPath, 'utf8');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      throw new Error('dist/sw.js が存在しません。先に `npm run build` を実行してください。');
    }
    throw error;
  }
}

describe('readSwDist', () => {
  afterEach(() => {
    vi.mocked(fs.access).mockRestore();
    vi.mocked(fs.readFile).mockRestore();
  });

  it('UTF-8 でファイルを読み取る', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    const read = vi.mocked(fs.readFile).mockResolvedValue('キャッシュ');

    await expect(readSwDist()).resolves.toBe('キャッシュ');
    expect(read).toHaveBeenCalledWith(swDistPath, 'utf8');
    expect(fs.access).not.toHaveBeenCalled();
  });

  it('読み取り時の ENOENT をビルド案内に変換する', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
    vi.mocked(fs.readFile).mockRejectedValue(error);

    await expect(readSwDist()).rejects.toThrow(
      'dist/sw.js が存在しません。先に `npm run build` を実行してください。'
    );
  });

  it.each(['EACCES', 'EIO'])('%s は元のエラーをそのまま返す', async (code) => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    const error = Object.assign(new Error(code), { code });
    vi.mocked(fs.readFile).mockRejectedValue(error);

    await expect(readSwDist()).rejects.toBe(error);
  });

  it.each([null, 'unexpected'])('Error 以外の拒否値 %s をそのまま返す', async (value) => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockRejectedValue(value);

    await expect(readSwDist()).rejects.toBe(value);
  });
});

describe('SW cache versioning (build artifact 検証)', () => {
  it('dist/sw.js に placeholder __BUILD_ID__ が残っていない', async () => {
    const content = await readSwDist();
    expect(hasPlaceholder(content)).toBe(false);
  });

  it('CACHE_NAME が devtools-{sha} 形式になっている', async () => {
    const content = await readSwDist();
    expect(hasInvalidCacheName(content)).toBe(false);
  });
});

// 陽性対照: test-gates skill 準拠 — 検知関数が空回りしていないことを保証
describe('[陽性対照] SW cache versioning 検知機構', () => {
  it('未置換 placeholder を含む文字列は hasPlaceholder が true を返す', () => {
    const bad = `const CACHE_NAME = 'devtools-${PLACEHOLDER}';`;
    expect(hasPlaceholder(bad)).toBe(true);
  });

  it('devtools-v1 (固定値) は hasInvalidCacheName が true を返す', () => {
    const legacy = `const CACHE_NAME = 'devtools-v1';`;
    expect(hasInvalidCacheName(legacy)).toBe(true);
  });

  it('正しい形式は hasPlaceholder が false を返す', () => {
    const good = `const CACHE_NAME = 'devtools-a1b2c3d';`;
    expect(hasPlaceholder(good)).toBe(false);
  });

  it('正しい形式は hasInvalidCacheName が false を返す', () => {
    const good = `const CACHE_NAME = 'devtools-a1b2c3d';`;
    expect(hasInvalidCacheName(good)).toBe(false);
  });
});
