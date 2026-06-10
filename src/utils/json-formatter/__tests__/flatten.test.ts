import { describe, it, expect } from 'vitest';
import { flattenTree, countRows, computeWindow } from '../flatten';
import { parseJson } from '../parse';
import { buildTree } from '../tree';
import type { TreeNode } from '../tree';

function treeOf(text: string): TreeNode {
  const r = parseJson(text);
  if (!r.ok) throw new Error('fixture の JSON が不正');
  return buildTree(r.root, text);
}

describe('flattenTree', () => {
  // 全展開 8 行: root open / a / b open / true / null / b close / c / root close
  const FIXTURE = '{"a": 1, "b": [true, null], "c": "x"}';

  it('全展開で value/open/close を文書順に列挙し depth を付与する', () => {
    const rows = flattenTree(treeOf(FIXTURE), new Set(), true);
    expect(rows.map((r) => r.kind)).toEqual([
      'open',
      'value',
      'open',
      'value',
      'value',
      'close',
      'value',
      'close',
    ]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 2, 2, 1, 1, 0]);
  });

  it('toggled の path を折りたたみ、子孫と close 行を出力しない（defaultOpen=true の XOR）', () => {
    const rows = flattenTree(treeOf(FIXTURE), new Set(['$.b']), true);
    expect(rows.map((r) => r.key)).toEqual(['$', '$.a', '$.b', '$.c', '$:close']);
    const b = rows.find((r) => r.key === '$.b');
    expect(b?.kind).toBe('open');
    expect(b?.collapsed).toBe(true);
  });

  it('defaultOpen=false では toggled の path だけが開く', () => {
    const rows = flattenTree(treeOf(FIXTURE), new Set(['$']), false);
    expect(rows.map((r) => r.key)).toEqual(['$', '$.a', '$.b', '$.c', '$:close']);
    expect(rows.find((r) => r.key === '$.b')?.collapsed).toBe(true);
  });

  it('defaultOpen=false かつ toggled 空ではルート 1 行だけになる', () => {
    const rows = flattenTree(treeOf(FIXTURE), new Set(), false);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('open');
    expect(rows[0].collapsed).toBe(true);
  });

  it('行キーは全行で一意になる（close 行は path + ":close"）', () => {
    const rows = flattenTree(treeOf(FIXTURE), new Set(), true);
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('プリミティブのみのルートは value 1 行', () => {
    const rows = flattenTree(treeOf('42'), new Set(), true);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('value');
    expect(rows[0].node.raw).toBe('42');
  });
});

describe('countRows', () => {
  it('flattenTree 全展開の行数と一致する', () => {
    const tree = treeOf('{"a": 1, "b": [true, null], "c": "x"}');
    expect(countRows(tree)).toBe(flattenTree(tree, new Set(), true).length);
  });

  it('プリミティブのみのルートは 1', () => {
    expect(countRows(treeOf('"s"'))).toBe(1);
  });

  it('空オブジェクトは open + close の 2', () => {
    expect(countRows(treeOf('{}'))).toBe(2);
  });
});

describe('computeWindow', () => {
  it('スクロール位置から可視範囲 + overscan を返す', () => {
    // 100 行 × 行高 20px、viewport 200px、scrollTop 400 → 可視 20〜30 行目 ± overscan 5
    expect(computeWindow(400, 200, 20, 100, 5)).toEqual({ start: 15, end: 35 });
  });

  it('先頭で start を 0 に clamp する', () => {
    expect(computeWindow(0, 200, 20, 100, 5)).toEqual({ start: 0, end: 15 });
  });

  it('末尾（実スクロール上限）で end を totalRows に clamp する', () => {
    // contentH 2000 - viewport 200 = scrollTop 上限 1800
    expect(computeWindow(1800, 200, 20, 100, 5)).toEqual({ start: 85, end: 100 });
  });

  it('行数縮小直後の過大な scrollTop でも範囲が破綻しない', () => {
    const w = computeWindow(10_000, 200, 20, 100, 5);
    expect(w.start).toBeLessThan(w.end);
    expect(w.end).toBe(100);
  });

  it('totalRows=0 は空範囲を返す', () => {
    expect(computeWindow(0, 200, 20, 0, 5)).toEqual({ start: 0, end: 0 });
  });

  it('rowH 未確定（<=0）では先頭から overscan ぶんだけ描画する', () => {
    expect(computeWindow(0, 200, 0, 100, 5)).toEqual({ start: 0, end: 5 });
  });

  it('負の scrollTop（バウンススクロール）は 0 として扱う', () => {
    expect(computeWindow(-50, 200, 20, 100, 5)).toEqual({ start: 0, end: 15 });
  });
});
