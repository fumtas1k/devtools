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
    // 単一要素なので sequence ではなく terminal
    expect(root.kind).toBe('terminal');
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

  it('未対応構文（量指定子）はフォールバック枠', () => {
    const root = buildRailroad('a+', '');
    // a+ は Repetition（PR2a 未対応）→ fallback。ラベルは source 'a+'
    expect(root.kind).toBe('fallback');
    expect(root.label).toBe('a+');
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
