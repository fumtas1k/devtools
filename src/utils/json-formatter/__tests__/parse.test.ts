import { describe, it, expect } from 'vitest';
import { parseJson } from '../parse';

// 陰性対照: 正しい JSON は ok:true。これ単体では「常に ok を返す空回り validator」と区別できない。
describe('parseJson 陰性対照（正常系）', () => {
  it('オブジェクトを受理する', () => {
    const r = parseJson('{"a":1}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.root.type).toBe('object');
  });

  it('ネストした配列/オブジェクトを受理する', () => {
    const r = parseJson('{"items":[{"id":1},{"id":2}],"ok":true,"x":null}');
    expect(r.ok).toBe(true);
  });

  it('整形済み（改行・インデント入り）の JSON を受理する', () => {
    const r = parseJson('{\n  "a": 1,\n  "b": [1, 2, 3]\n}');
    expect(r.ok).toBe(true);
  });
});

// 陽性対照（別 describe に分離）: 不正 JSON を必ず検知する。
// 「常に ok:true を返す」空回り実装に当てると、以下はすべて fail する = 検知能力の証明。
describe('parseJson 陽性対照（不正を検知）', () => {
  it('末尾カンマを拒否する', () => {
    const r = parseJson('{"a":1,}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message.length).toBeGreaterThan(0);
  });

  it('値の欠落を拒否する', () => {
    const r = parseJson('{"a":}');
    expect(r.ok).toBe(false);
  });

  it('閉じ括弧の欠落を拒否する', () => {
    const r = parseJson('{"a":1');
    expect(r.ok).toBe(false);
  });

  it('コメントを拒否する（strict JSON）', () => {
    const r = parseJson('{"a":1 // comment\n}');
    expect(r.ok).toBe(false);
  });

  it('シングルクォートを拒否する', () => {
    const r = parseJson("{'a':1}");
    expect(r.ok).toBe(false);
  });

  it('複数行のカンマ欠落を該当行（3行目）として報告する', () => {
    const text = '{\n  "a": 1\n  "b": 2\n}';
    const r = parseJson(text);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.line).toBe(3);
      expect(r.error.message).toContain('カンマ');
    }
  });

  it('空文字列を不正として扱う', () => {
    const r = parseJson('');
    expect(r.ok).toBe(false);
  });
});
