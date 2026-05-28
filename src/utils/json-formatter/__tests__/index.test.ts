import { describe, it, expect } from 'vitest';
import { processJson } from '../index';

describe('processJson', () => {
  it('整形モードで出力とツリーを返す', () => {
    const r = processJson('{"a":1}', { mode: 'format', indent: '2' });
    expect(r.output).toBe('{\n  "a": 1\n}');
    expect(r.tree.type).toBe('object');
    expect(r.tree.children?.[0].key).toBe('a');
  });

  it('最小化モードで空白を除去する', () => {
    const r = processJson('{\n  "a": 1\n}', { mode: 'minify', indent: '2' });
    expect(r.output).toBe('{"a":1}');
  });

  // 陽性対照: 不正 JSON は「行X列Y: メッセージ」ラベル付きで throw する。
  // 「常に成功扱い」の実装に当てると throw されず fail する。
  it('不正 JSON は行・列付きラベルで throw する', () => {
    expect(() => processJson('{"a":}', { mode: 'format', indent: '2' })).toThrow(/行.*列:/);
  });

  // 極端に深いネストは再帰上限を超えて RangeError になるため、
  // 生の英語メッセージではなく日本語の説明に変換して throw する。
  it('ネストが深すぎる JSON は日本語メッセージで弾く', () => {
    const depth = 100000;
    const deep = '['.repeat(depth) + ']'.repeat(depth);
    expect(() => processJson(deep, { mode: 'format', indent: '2' })).toThrow(/ネストが深すぎ/);
  });
});
