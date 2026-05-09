import { describe, it, expect } from 'vitest';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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
    await access(swDistPath);
  } catch {
    throw new Error('dist/sw.js が存在しません。先に `npm run build` を実行してください。');
  }
  return readFile(swDistPath, 'utf8');
}

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
