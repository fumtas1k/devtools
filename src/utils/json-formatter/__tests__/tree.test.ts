import { describe, it, expect } from 'vitest';
import { parseJson } from '../parse';
import { buildTree } from '../tree';

function tree(text: string) {
  const r = parseJson(text);
  if (!r.ok) throw new Error('テスト用の JSON が不正: ' + r.error.message);
  return buildTree(r.root, text);
}

describe('buildTree', () => {
  it('ルートはオブジェクト型でパスは $', () => {
    const root = tree('{"a":1}');
    expect(root.type).toBe('object');
    expect(root.path).toBe('$');
    expect(root.key).toBeNull();
  });

  it('オブジェクトのプロパティを key 付きの子にする', () => {
    const root = tree('{"name":"x","age":20}');
    expect(root.children?.map((c) => c.key)).toEqual(['name', 'age']);
    expect(root.children?.map((c) => c.path)).toEqual(['$.name', '$.age']);
  });

  it('配列の要素はインデックスを key にしブラケットパスを付ける', () => {
    const root = tree('{"tags":["a","b"]}');
    const tags = root.children?.[0];
    expect(tags?.type).toBe('array');
    expect(tags?.children?.map((c) => c.key)).toEqual([0, 1]);
    expect(tags?.children?.map((c) => c.path)).toEqual(['$.tags[0]', '$.tags[1]']);
  });

  it('プリミティブの型と値を保持する', () => {
    const root = tree('{"s":"x","n":1,"b":true,"z":null}');
    const byKey = Object.fromEntries((root.children ?? []).map((c) => [c.key, c]));
    expect(byKey.s.type).toBe('string');
    expect(byKey.s.value).toBe('x');
    expect(byKey.n.type).toBe('number');
    expect(byKey.n.value).toBe(1);
    expect(byKey.b.type).toBe('boolean');
    expect(byKey.b.value).toBe(true);
    expect(byKey.z.type).toBe('null');
    expect(byKey.z.value).toBeNull();
  });

  it('大きな整数は raw に元の表記を保持する（精度欠落の回避）', () => {
    const root = tree('{"id":123456789012345678}');
    const id = root.children?.[0];
    expect(id?.raw).toBe('123456789012345678');
  });

  it('識別子にならないキーはブラケット記法でパスを作る', () => {
    const root = tree('{"a b":{"c":1}}');
    const ab = root.children?.[0];
    expect(ab?.path).toBe('$["a b"]');
    expect(ab?.children?.[0].path).toBe('$["a b"].c');
  });

  it('空オブジェクト・空配列は children を空配列にする', () => {
    expect(tree('{}').children).toEqual([]);
    expect(tree('[]').children).toEqual([]);
  });

  it('コンテナノードも元ソース全体を raw に保持する（部分木コピー用）', () => {
    const root = tree('{"a":{"b":1}}');
    expect(root.raw).toBe('{"a":{"b":1}}');
    expect(root.children?.[0].raw).toBe('{"b":1}');
  });
});
