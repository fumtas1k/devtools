import { describe, it, expect } from 'vitest';
import { tools, categories, categoryLabel } from '@/data/tools';

/**
 * meta test: tools.ts のカテゴリ整合性検証 (PR #469 レビュー指摘1)
 *
 * `categoryLabel` は `Record<ToolCategory, string>` のため union 網羅は型で守られるが、
 * 表示順を決める `categories: ToolCategory[]` は単なる配列で *網羅性が型で保証されない*。
 * union と `categoryLabel` に新カテゴリを足しても `categories` への追加を忘れると、
 * そのカテゴリのツールが Sidebar / index タブの *どこにも描画されない*（「すべて」タブのみに
 * 出る）silent failure になる。これは PR #469 で index.astro の `categories` ハードコード重複を
 * 撤去して潰したバグと同じクラス。TypeScript は配列の網羅を検査しないため、ここで invariant を
 * CI で強制する。
 */

/** `categories` 配列と `categoryLabel` のキー集合の差分（両方向）を返す純粋関数 (陰性/陽性で共有) */
function findCategorySetMismatch(
  categoryList: string[],
  labelKeys: string[]
): { missingFromList: string[]; missingFromLabel: string[] } {
  const listSet = new Set(categoryList);
  const labelSet = new Set(labelKeys);
  return {
    missingFromList: labelKeys.filter((k) => !listSet.has(k)),
    missingFromLabel: categoryList.filter((k) => !labelSet.has(k)),
  };
}

/** category が「描画される集合（`categories` 配列）」に含まれないツールの slug を返す純粋関数 (陰性/陽性で共有) */
function findOrphanTools(
  toolList: { slug: string; category: string }[],
  categoryList: string[]
): string[] {
  const known = new Set(categoryList);
  return toolList.filter((t) => !known.has(t.category)).map((t) => t.slug);
}

describe('tools.ts カテゴリ整合性', () => {
  it('categories 配列が categoryLabel の全キーを過不足なく含む', () => {
    expect(findCategorySetMismatch([...categories], Object.keys(categoryLabel))).toEqual({
      missingFromList: [],
      missingFromLabel: [],
    });
  });

  it('全ツールの category が categories 配列に含まれる (= 必ずどこかに描画される)', () => {
    expect(findOrphanTools(tools, [...categories])).toEqual([]);
  });
});

// 陽性対照: 検知機構が空回りしていないことを保証 (test-gates skill 準拠)。
// findCategorySetMismatch / findOrphanTools を空回り実装に差し替えると下記は必ず fail する。
describe('[陽性対照] カテゴリ整合性 検知機構', () => {
  it('categories 配列に欠けたカテゴリ (label にだけ存在) を検出する', () => {
    const result = findCategorySetMismatch(
      ['generate', 'convert'],
      ['generate', 'code', 'convert']
    );
    expect(result.missingFromList).toEqual(['code']);
    expect(result.missingFromLabel).toEqual([]);
  });

  it('label に欠けたカテゴリ (categories にだけ存在) を検出する', () => {
    const result = findCategorySetMismatch(
      ['generate', 'code', 'convert'],
      ['generate', 'convert']
    );
    expect(result.missingFromList).toEqual([]);
    expect(result.missingFromLabel).toEqual(['code']);
  });

  it('完全一致の集合では何も検出しない (過検知なし)', () => {
    const result = findCategorySetMismatch(['a', 'b'], ['b', 'a']);
    expect(result).toEqual({ missingFromList: [], missingFromLabel: [] });
  });

  it('categories に無いカテゴリを持つツール (orphan) を検出する', () => {
    const fixture = [
      { slug: 'ok', category: 'generate' },
      { slug: 'orphan', category: 'unknown' },
    ];
    expect(findOrphanTools(fixture, ['generate', 'convert'])).toEqual(['orphan']);
  });

  it('全ツールが既知カテゴリの fixture では何も検出しない (過検知なし)', () => {
    const fixture = [
      { slug: 'a', category: 'generate' },
      { slug: 'b', category: 'convert' },
    ];
    expect(findOrphanTools(fixture, ['generate', 'convert'])).toEqual([]);
  });
});
