import { describe, it, expect } from 'vitest';
import { parseJson, stringifyJson } from '../json';

describe('parseJson', () => {
  it('有効なJSONをパースする', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('配列をパースする', () => {
    expect(parseJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('不正なJSONで日本語エラーを投げる', () => {
    expect(() => parseJson('{invalid}')).toThrow('有効なJSONではありません');
  });

  it('空文字列で日本語エラーを投げる', () => {
    expect(() => parseJson('')).toThrow('有効なJSONではありません');
  });
});

describe('stringifyJson', () => {
  it('オブジェクトを2スペースインデントのJSON文字列に変換する', () => {
    const result = stringifyJson({ a: 1 });
    expect(result).toBe('{\n  "a": 1\n}');
  });

  it('配列を2スペースインデントのJSON文字列に変換する', () => {
    const result = stringifyJson([1, 2, 3]);
    expect(result).toBe('[\n  1,\n  2,\n  3\n]');
  });

  it('ネストしたオブジェクトを整形する', () => {
    const result = stringifyJson({ a: { b: 2 } });
    expect(result).toContain('  "a"');
    expect(result).toContain('    "b"');
  });
});
