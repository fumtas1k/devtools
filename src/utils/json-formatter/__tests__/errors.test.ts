import { describe, it, expect } from 'vitest';
import { offsetToLineColumn, parseErrorMessage, formatErrorLabel } from '../errors';

describe('offsetToLineColumn', () => {
  it('1 行目先頭は 1 行 1 列', () => {
    expect(offsetToLineColumn('{}', 0)).toEqual({ line: 1, column: 1 });
  });

  it('同一行内は列だけが進む', () => {
    // '{"a":1}' の offset 5（"1" の位置）
    expect(offsetToLineColumn('{"a":1}', 5)).toEqual({ line: 1, column: 6 });
  });

  it('改行をまたぐと行が進み列がリセットされる', () => {
    // "{\n  \"a\": ,\n}" の 2 行目「,」位置
    const text = '{\n  "a": ,\n}';
    const offset = text.indexOf(',');
    expect(offsetToLineColumn(text, offset)).toEqual({ line: 2, column: 8 });
  });

  it('複数行を正しく数える', () => {
    const text = 'a\nb\nc';
    expect(offsetToLineColumn(text, 4)).toEqual({ line: 3, column: 1 });
  });
});

describe('parseErrorMessage', () => {
  it('既知のエラーコードを日本語メッセージに変換する', () => {
    // ParseErrorCode.CommaExpected = 6
    expect(parseErrorMessage(6)).toContain('カンマ');
    // ParseErrorCode.CloseBraceExpected = 7
    expect(parseErrorMessage(7)).toContain('}');
  });

  it('未知のコードでもフォールバック文字列を返す（空にしない）', () => {
    expect(parseErrorMessage(9999).length).toBeGreaterThan(0);
  });
});

describe('formatErrorLabel', () => {
  it('行・列・メッセージを結合したラベルを返す', () => {
    expect(formatErrorLabel({ message: '値が必要です', line: 3, column: 5, offset: 10 })).toBe(
      '3行5列: 値が必要です'
    );
  });
});
