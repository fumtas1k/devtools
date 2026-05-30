import { describe, it, expect } from 'vitest';
import { tools } from '@/data/tools';
import { FEATURED_404_SLUGS } from '@/data/featured-tools';

/**
 * meta test: 404 ページ (src/pages/404.astro) の featured tool shortcut が
 * silent regression しないことを検証する (PR #534 review follow-up)。
 *
 * 背景: 404.astro は `FEATURED_404_SLUGS.map(slug => tools.find(...)).filter(Boolean)` で
 * shortcut を描画する。slug を rename / typo すると該当 slug が undefined で filter 落ちし、
 * 「よく使われるツール」セクションが歯抜けのまま build / test とも green になる。
 * 本 test で全 slug の実在を CI (`npm run test`) で保証し、merge 前に fail させる。
 */

/** featured slug のうち tools.ts に実在しないものを返す純粋関数 (陰性/陽性両対照で共有) */
function findMissingFeaturedSlugs(
  featuredSlugs: readonly string[],
  toolList: { slug: string }[]
): string[] {
  const existing = new Set(toolList.map((t) => t.slug));
  return featuredSlugs.filter((slug) => !existing.has(slug));
}

describe('404 featured tools coverage', () => {
  it('FEATURED_404_SLUGS の全 slug が tools.ts に実在する', () => {
    const missing = findMissingFeaturedSlugs(FEATURED_404_SLUGS, tools);
    expect(missing).toEqual([]);
  });

  it('FEATURED_404_SLUGS に重複がない', () => {
    expect(new Set(FEATURED_404_SLUGS).size).toBe(FEATURED_404_SLUGS.length);
  });
});

// 陽性対照: 検知機構が空回りしていないことを保証 (test-gates skill 準拠)。
// slug を 1 つ壊した fixture では必ず検出されることを別 test で確認する。
describe('[陽性対照] 404 featured tools coverage 検知機構', () => {
  it('実在しない slug を fixture に注入すると検出する', () => {
    const missing = findMissingFeaturedSlugs(['base64', 'renamed-typo-slug'], tools);
    expect(missing).toEqual(['renamed-typo-slug']);
  });

  it('実在 + 不在の混在 fixture で不在のみを列挙する (過検知なし)', () => {
    const missing = findMissingFeaturedSlugs(['base64', 'fake-a', 'qr-code', 'fake-b'], tools);
    expect(missing.sort()).toEqual(['fake-a', 'fake-b']);
  });
});
