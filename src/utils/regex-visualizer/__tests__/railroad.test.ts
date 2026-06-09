import { describe, it, expect } from 'vitest';
import { buildRailroad } from '../railroad';

describe('buildRailroad', () => {
  it('連結 abc を sequence にし、各終端ラベルは source 由来', () => {
    const root = buildRailroad('abc', '');
    expect(root.kind).toBe('sequence');
    expect(root.children.map((c) => c.label)).toEqual(['a', 'b', 'c']);
  });

  it('文字クラスは source 文字列をラベルにする', () => {
    const root = buildRailroad('[a-z]', '');
    // 単一要素なので sequence ではなく charclass
    expect(root.kind).toBe('charclass');
    expect(root.label).toBe('[a-z]');
  });

  it('グループは group ノードになり inner を内包', () => {
    const root = buildRailroad('(ab)', '');
    expect(root.kind).toBe('group');
    expect(root.title).toBe('#1');
    expect(root.children[0].kind).toBe('sequence');
  });

  it('非キャプチャグループのタイトルは (?:)', () => {
    const root = buildRailroad('(?:a)', '');
    expect(root.kind).toBe('group');
    expect(root.title).toBe('(?:)');
  });

  it('量指定子 a+ は repetition ノードになる（PR2c で本実装済み）', () => {
    const root = buildRailroad('a+', '');
    expect(root.kind).toBe('repetition');
    expect(root.label).toBe('1回以上');
  });

  it('各ノードに pattern 基準 loc（offset-1）が付く', () => {
    const root = buildRailroad('ab', '');
    expect(root.children[0].loc).toEqual({ start: 0, end: 1 });
  });

  // 回帰防止: regexp-tree は空グループの expression を null で返す。
  // null ガードが無いと build(null) で throw する（PR #491 レビュー指摘）。
  it('空キャプチャグループ () で throw せず group ノードになる', () => {
    expect(() => buildRailroad('()', '')).not.toThrow();
    const root = buildRailroad('()', '');
    expect(root.kind).toBe('group');
    expect(root.children[0].kind).toBe('fallback'); // 空式は「（空）」フォールバック枠
  });

  it('空非キャプチャグループ (?:) で throw しない', () => {
    expect(() => buildRailroad('(?:)', '')).not.toThrow();
    expect(buildRailroad('(?:)', '').kind).toBe('group');
  });
});

describe('buildRailroad（量指定子・後方参照）', () => {
  it('a+ は loop あり skip なしの repetition', () => {
    const r = buildRailroad('a+', '');
    expect(r.kind).toBe('repetition');
    expect(r.loop).toBe(true);
    expect(r.skip).toBe(false);
    expect(r.label).toBe('1回以上');
    expect(r.children[0].kind).toBe('terminal');
  });

  it('a* は skip も loop もある', () => {
    const r = buildRailroad('a*', '');
    expect(r.skip).toBe(true);
    expect(r.loop).toBe(true);
  });

  it('a? は skip のみ', () => {
    const r = buildRailroad('a?', '');
    expect(r.skip).toBe(true);
    expect(r.loop).toBe(false);
  });

  it('lazy a*? はラベルに（最短）が付く', () => {
    const r = buildRailroad('a*?', '');
    expect(r.label).toBe('0回以上（最短）');
  });

  it('a{2,5} は Range ラベル（日本語）', () => {
    const r = buildRailroad('a{2,5}', '');
    expect(r.kind).toBe('repetition');
    expect(r.label).toBe('2〜5回');
  });

  it('後方参照 (a)\\1 の \\1 は backreference', () => {
    const r = buildRailroad('(a)\\1', '');
    expect(r.kind).toBe('sequence');
    expect(r.children[1].kind).toBe('backreference');
    expect(r.children[1].label).toBe('\\1');
  });
});

describe('buildRailroad（選択肢・アサーション）', () => {
  it('a|b|c を平坦化して 3 分岐の choice にする', () => {
    const root = buildRailroad('a|b|c', '');
    expect(root.kind).toBe('choice');
    expect(root.children.map((c) => c.label)).toEqual(['a', 'b', 'c']);
  });

  it('^ $ は assertion ノードになる', () => {
    const root = buildRailroad('^a$', ''); // Alternative[^, a, $]
    expect(root.kind).toBe('sequence');
    expect(root.children[0].kind).toBe('assertion');
    expect(root.children[0].label).toBe('^');
    expect(root.children[2].kind).toBe('assertion');
    expect(root.children[2].label).toBe('$');
  });

  it('\\b は assertion ノードになる', () => {
    const root = buildRailroad('\\bx', '');
    expect(root.children[0].kind).toBe('assertion');
    expect(root.children[0].label).toBe('\\b');
  });

  it('先読み (?=foo) は group としてタイトル (?=) で内部式を内包', () => {
    const root = buildRailroad('(?=foo)', '');
    expect(root.kind).toBe('group');
    expect(root.title).toBe('(?=)');
    expect(root.children[0].kind).toBe('sequence'); // foo
  });

  it('否定後読み (?<!bar) は group タイトル (?<!)', () => {
    const root = buildRailroad('(?<!bar)', '');
    expect(root.kind).toBe('group');
    expect(root.title).toBe('(?<!)');
  });

  // 補強（PR #492 レビュー指摘）: 境界ケースで throw せず期待構造になること
  it('空 alternative a| は choice の片側を（空）fallback にする', () => {
    const root = buildRailroad('a|', '');
    expect(root.kind).toBe('choice');
    expect(root.children).toHaveLength(2);
    expect(root.children.some((c) => c.kind === 'fallback')).toBe(true);
  });

  it('空先読み (?=) で throw せず group になる', () => {
    expect(() => buildRailroad('(?=)', '')).not.toThrow();
    expect(buildRailroad('(?=)', '').kind).toBe('group');
  });
});

describe('量指定子ラベル（日本語）', () => {
  const labelOf = (p: string) => buildRailroad(p, '').label;
  it('* は 0回以上', () => expect(labelOf('a*')).toBe('0回以上'));
  it('+ は 1回以上', () => expect(labelOf('a+')).toBe('1回以上'));
  it('? は 0または1回', () => expect(labelOf('a?')).toBe('0または1回'));
  it('{3} は 3回', () => expect(labelOf('a{3}')).toBe('3回'));
  it('{2,} は 2回以上', () => expect(labelOf('a{2,}')).toBe('2回以上'));
  it('{2,5} は 2〜5回', () => expect(labelOf('a{2,5}')).toBe('2〜5回'));
  it('lazy *? は 0回以上（最短）', () => expect(labelOf('a*?')).toBe('0回以上（最短）'));
});

describe('種別分割（リテラル / 文字クラス・メタ文字）', () => {
  it('通常リテラル a は terminal', () => {
    const node = buildRailroad('a', '');
    expect(node.kind).toBe('terminal');
  });
  it('メタ文字 . は charclass', () => {
    const node = buildRailroad('.', '');
    expect(node.kind).toBe('charclass');
  });
  it('\\s は charclass', () => {
    const node = buildRailroad('\\s', '');
    expect(node.kind).toBe('charclass');
  });
  it('文字クラス [ab] は charclass', () => {
    const node = buildRailroad('[ab]', '');
    expect(node.kind).toBe('charclass');
  });
});
