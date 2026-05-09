import { describe, it, expect } from 'vitest';
import { tools } from '@/data/tools';
import { PAGES, STATIC_PAGES } from '../e2e/visual-regression-pages';

/**
 * meta test: VRT カバレッジ漏れ検出 (issue #355 再発防止策)
 *
 * `src/data/tools.ts` の全 tool slug が `tests/e2e/visual-regression-pages.ts` の
 * `PAGES` 配列に登録されているかを機械的に検証。
 *
 * 背景: PR #346 で char-count tool 追加時に PAGES への登録漏れが発生し、
 * その後 PR #354 のレビューで初めて発覚した (人間の checklist 確認に依存していた)。
 * 本 test を CI (`npm run test`) で走らせることで、新規ツール追加 PR で
 * VRT 登録漏れが merge 前に必ず fail として検知される。
 */

/** tool 一覧と PAGES の差分を返す純粋関数 (陰性/陽性両対照で共有) */
function findUnregisteredTools(toolList: { slug: string }[], pages: readonly string[]): string[] {
  const toolUrls = toolList.map((t) => `/tools/${t.slug}`);
  return toolUrls.filter((url) => !pages.includes(url));
}

/**
 * PAGES にだけ存在する orphan エントリ (tools.ts から削除されたが PAGES に残存) を返す。
 * STATIC ページ (`/`, `/about`, `/privacy`) は visual-regression-pages.ts で定義済みの
 * `STATIC_PAGES` を import して除外 (重複定義による drift 防止)。
 */
function findOrphanPages(toolList: { slug: string }[], pages: readonly string[]): string[] {
  const toolUrls = new Set(toolList.map((t) => `/tools/${t.slug}`));
  return pages.filter((url) => !STATIC_PAGES.has(url) && !toolUrls.has(url));
}

describe('VRT PAGES coverage', () => {
  it('src/data/tools.ts の全 tool slug が visual-regression PAGES に登録されている', () => {
    const missing = findUnregisteredTools(tools, PAGES);
    expect(missing).toEqual([]);
  });
});

// 陽性対照: 検知機構が空回りしていないことを保証 (test-gates skill 準拠)。
// fixture を注入して旧実装 (検知ロジック無し) では fail する設計を別 spec で確認する。
describe('[陽性対照] VRT PAGES coverage 検知機構', () => {
  it('未登録 slug を fixture に注入すると findUnregisteredTools が検出する', () => {
    const fakeTools = [{ slug: 'unregistered-fake-tool' }];
    const missing = findUnregisteredTools(fakeTools, PAGES);
    expect(missing).toEqual(['/tools/unregistered-fake-tool']);
  });

  it('登録済み + 未登録の混在 fixture で未登録のみを列挙する (過検知なし)', () => {
    const fakeTools = [
      { slug: 'fake-a' },
      { slug: 'url-encode' }, // 既存 (登録済み)
      { slug: 'fake-b' },
    ];
    const missing = findUnregisteredTools(fakeTools, PAGES);
    expect(missing.sort()).toEqual(['/tools/fake-a', '/tools/fake-b']);
  });

  it('全登録済み fixture では何も検出しない (過検知なし)', () => {
    const fakeTools = [{ slug: 'url-encode' }, { slug: 'qr-code' }];
    const missing = findUnregisteredTools(fakeTools, PAGES);
    expect(missing).toEqual([]);
  });
});

// orphan 検出 (PAGES にあるが tools.ts には無い): ツール削除時の PAGES 削除忘れ検知
describe('VRT PAGES orphan 検出', () => {
  it('PAGES に存在するが tools.ts に対応する slug が無い orphan エントリがない', () => {
    const orphans = findOrphanPages(tools, PAGES);
    expect(orphans).toEqual([]);
  });
});

describe('[陽性対照] orphan 検出機構', () => {
  it('tools.ts に無い slug が PAGES にあると orphan として検出される', () => {
    // ツールが url-encode 1 つだけ存在する fixture → 他の /tools/* は全部 orphan
    const fakeTools = [{ slug: 'url-encode' }];
    const orphans = findOrphanPages(fakeTools, PAGES);
    expect(orphans.length).toBeGreaterThan(0);
    expect(orphans).not.toContain('/tools/url-encode'); // 登録済みは含まない
  });

  it('STATIC ページ (`/`, `/about`, `/privacy`) は orphan として検出されない', () => {
    // ツール 0 件 fixture でも STATIC は除外される
    const orphans = findOrphanPages([], PAGES);
    expect(orphans).not.toContain('/');
    expect(orphans).not.toContain('/about');
    expect(orphans).not.toContain('/privacy');
  });
});

// PAGES の重複登録検出: 同じ URL を 2 回追加してしまった場合の検知
describe('VRT PAGES 重複登録検出', () => {
  it('PAGES 配列に重複登録がない', () => {
    expect(new Set(PAGES).size).toBe(PAGES.length);
  });
});

describe('[陽性対照] 重複検出機構', () => {
  it('重複を含む配列では Set サイズが配列長より小さくなる', () => {
    const dup = ['/tools/a', '/tools/b', '/tools/a'] as const;
    expect(new Set(dup).size).toBeLessThan(dup.length);
  });
});
