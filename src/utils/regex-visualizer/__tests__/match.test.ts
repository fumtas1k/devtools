import { describe, it, expect } from 'vitest';
import { runMatch } from '../match';

describe('runMatch', () => {
  it('g なしは最初の1件のみ返す', () => {
    const r = runMatch('\\d+', '', 'a1 b22 c333');
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].value).toBe('1');
    expect(r.matches[0].start).toBe(1);
    expect(r.matches[0].end).toBe(2);
  });

  it('g ありは全マッチを返す', () => {
    const r = runMatch('\\d+', 'g', 'a1 b22 c333');
    expect(r.matches.map((m) => m.value)).toEqual(['1', '22', '333']);
  });

  it('キャプチャグループを index 付きで抽出する', () => {
    const r = runMatch('(\\w+)@(\\w+)', 'g', 'a@x b@y');
    expect(r.matches).toHaveLength(2);
    expect(r.matches[0].groups.map((g) => g.value)).toEqual(['a', 'x']);
    expect(r.matches[0].groups.map((g) => g.index)).toEqual([1, 2]);
  });

  it('名前付きグループの名前を解決する', () => {
    const r = runMatch('(?<user>\\w+)@(?<host>\\w+)', '', 'a@x');
    expect(r.matches[0].groups[0]).toMatchObject({ index: 1, name: 'user', value: 'a' });
    expect(r.matches[0].groups[1]).toMatchObject({ index: 2, name: 'host', value: 'x' });
  });

  it('非キャプチャ (?:) と先読み (?=) はグループ番号を消費しない', () => {
    const r = runMatch('(?:ab)(c)(?=d)', '', 'abcd');
    expect(r.matches[0].groups).toHaveLength(1);
    expect(r.matches[0].groups[0]).toMatchObject({ index: 1, value: 'c' });
  });

  it('エスケープ括弧と文字クラス内括弧はグループとして数えない', () => {
    const r = runMatch('\\((\\d)\\)[()]', '', '(5))');
    expect(r.matches[0].groups).toHaveLength(1);
    expect(r.matches[0].groups[0].value).toBe('5');
  });

  it('未マッチの省略可能グループは value undefined', () => {
    const r = runMatch('(a)?(b)', '', 'b');
    expect(r.matches[0].groups[0].value).toBeUndefined();
    expect(r.matches[0].groups[1].value).toBe('b');
  });

  it('マッチなしは空配列', () => {
    const r = runMatch('z+', 'g', 'aaa');
    expect(r.matches).toEqual([]);
  });

  it('空マッチでも無限ループせず厳密な件数を返す', () => {
    // V8 (Node v22) では 'a'@0 / ''@1 / 'a'@2 / ''@3 の 4 件
    // （空マッチ guard で lastIndex を 1 進めるため重複しない）
    const r = runMatch('a*', 'g', 'aXa');
    expect(r.matches.length).toBe(4);
  });

  it('maxLength で input を切り詰め truncated を立てる', () => {
    const r = runMatch('.', 'g', 'abcdef', 3);
    expect(r.truncated).toBe(true);
    expect(r.matches).toHaveLength(3);
  });

  it('maxLength 未指定なら truncated は false', () => {
    const r = runMatch('.', 'g', 'abc');
    expect(r.truncated).toBe(false);
  });

  it('maxLength === input.length のとき truncated は false', () => {
    const r = runMatch('.', 'g', 'abc', 3);
    expect(r.truncated).toBe(false);
    expect(r.matches).toHaveLength(3);
  });
});
