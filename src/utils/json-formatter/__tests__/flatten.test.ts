import { describe, it, expect } from 'vitest';
import { flattenTree, countRows } from '../flatten';
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
