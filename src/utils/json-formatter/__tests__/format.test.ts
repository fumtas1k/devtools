import { describe, it, expect } from 'vitest';
import { parseJson } from '../parse';
import { formatJson, minifyJson } from '../format';

function pretty(text: string, indent: '2' | '4' | 'tab') {
  const r = parseJson(text);
  if (!r.ok) throw new Error('テスト用 JSON が不正: ' + r.error.message);
  return formatJson(text, r.root, indent);
}
function minify(text: string) {
  const r = parseJson(text);
  if (!r.ok) throw new Error('テスト用 JSON が不正: ' + r.error.message);
  return minifyJson(text, r.root);
}

describe('formatJson（整形）', () => {
  it('2 スペースでネスト構造を整形する', () => {
    expect(pretty('{"a":1,"b":[2,3]}', '2')).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  });

  it('4 スペースで整形する', () => {
    expect(pretty('{"a":[1]}', '4')).toBe('{\n    "a": [\n        1\n    ]\n}');
  });

  it('タブで整形する', () => {
    expect(pretty('{"a":1}', 'tab')).toBe('{\n\t"a": 1\n}');
  });

  it('空オブジェクト・空配列はそのまま', () => {
    expect(pretty('{}', '2')).toBe('{}');
    expect(pretty('{"a":[]}', '2')).toBe('{\n  "a": []\n}');
  });

  it('トップレベルのプリミティブも扱える', () => {
    expect(pretty('42', '2')).toBe('42');
    expect(pretty('"hi"', '2')).toBe('"hi"');
  });

  it('整形結果は再パースしても妥当', () => {
    const out = pretty('{"a":1,"b":[2,3]}', '2');
    expect(parseJson(out).ok).toBe(true);
  });
});

describe('minifyJson（最小化）', () => {
  it('空白を除去する', () => {
    expect(minify('{\n  "a": 1,\n  "b": [2, 3]\n}')).toBe('{"a":1,"b":[2,3]}');
  });

  it('空オブジェクト・空配列', () => {
    expect(minify('{ }')).toBe('{}');
    expect(minify('[ ]')).toBe('[]');
  });
});

describe('lossless（精度・表記の保持）', () => {
  it('大きな整数を整形・最小化で欠落させない', () => {
    const text = '{"id": 123456789012345678}';
    expect(pretty(text, '2')).toBe('{\n  "id": 123456789012345678\n}');
    expect(minify(text)).toBe('{"id":123456789012345678}');
  });

  it('数値表記（1.0 / 1e3）を保持する', () => {
    expect(minify('{"a":1.0,"b":1e3}')).toBe('{"a":1.0,"b":1e3}');
  });

  it('文字列内のエスケープを保持する', () => {
    const text = '{"s":"a\\nb\\t\\u00e9"}';
    expect(minify(text)).toBe('{"s":"a\\nb\\t\\u00e9"}');
  });
});
