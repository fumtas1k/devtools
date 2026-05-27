import { describe, it, expect } from 'vitest';
import { parseRegex } from '../parse';

describe('parseRegex', () => {
  it('単一文字を Char ノードにする', () => {
    const root = parseRegex('a', '');
    expect(root.children[0].type).toBe('Char');
    expect(root.children[0].label).toContain('a');
  });

  it('量指定子付きグループを Repetition > Group で表現する', () => {
    const root = parseRegex('(ab)+', '');
    const rep = root.children[0];
    expect(rep.type).toBe('Repetition');
    expect(rep.label).toContain('1 回以上');
    expect(rep.children[0].type).toBe('Group');
  });

  it('選択肢を Disjunction にする', () => {
    const root = parseRegex('a|b', '');
    expect(root.children[0].type).toBe('Disjunction');
    expect(root.children[0].children).toHaveLength(2);
  });

  it('各ノードに pattern 基準の loc（offset-1 補正済み）を持つ', () => {
    const root = parseRegex('a+', '');
    // '/a+/' の Repetition 'a+' は offset 1..3 → pattern 基準 0..2
    expect(root.children[0].loc).toEqual({ start: 0, end: 2 });
  });

  it('不正な正規表現で例外を投げる', () => {
    expect(() => parseRegex('(', '')).toThrow();
  });

  it('不正なフラグで例外を投げる', () => {
    expect(() => parseRegex('a', 'Z')).toThrow();
  });
});
