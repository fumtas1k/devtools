import { describe, it, expect } from 'vitest';
import { parseDotenv, stringifyDotenv } from '../dotenv';

describe('parseDotenv', () => {
  it('シンプルなKEY=VALUE行をパースする', () => {
    const result = parseDotenv('KEY=value\nNUM=42');
    expect(result).toEqual({ KEY: 'value', NUM: '42' });
  });

  it('#コメント行をスキップする', () => {
    const result = parseDotenv('# comment\nKEY=value');
    expect(result).toEqual({ KEY: 'value' });
  });

  it('空行をスキップする', () => {
    const result = parseDotenv('KEY=value\n\nOTHER=test');
    expect(result).toEqual({ KEY: 'value', OTHER: 'test' });
  });

  it('ダブルクォートで囲まれた値をパースする', () => {
    const result = parseDotenv('KEY="value with spaces"');
    expect(result).toEqual({ KEY: 'value with spaces' });
  });

  it('シングルクォートで囲まれた値をパースする', () => {
    const result = parseDotenv("KEY='value with spaces'");
    expect(result).toEqual({ KEY: 'value with spaces' });
  });

  it('クォートなし値のインラインコメントを除去する', () => {
    expect(parseDotenv('KEY=value # comment')).toEqual({ KEY: 'value' });
  });

  it('ダブルクォート内の # はコメントとして扱わず保持する', () => {
    expect(parseDotenv('KEY="value # not a comment"')).toEqual({ KEY: 'value # not a comment' });
  });

  it('シングルクォート内の # はコメントとして扱わず保持する', () => {
    expect(parseDotenv("KEY='val # kept'")).toEqual({ KEY: 'val # kept' });
  });

  it('空白を伴わない # は値の一部として保持する（URL フラグメント等）', () => {
    expect(parseDotenv('URL=https://example.com#fragment')).toEqual({
      URL: 'https://example.com#fragment',
    });
  });

  it('クォート付き値の後の末尾コメントを除去しクォートを剥がす', () => {
    expect(parseDotenv('KEY="hello" # trailing comment')).toEqual({ KEY: 'hello' });
  });

  it('不正な行で日本語エラーを投げる', () => {
    expect(() => parseDotenv('INVALID LINE WITHOUT EQUALS')).toThrow('有効な.envではありません');
  });

  it('ダブルクォート内のエスケープされたダブルクォートを解除する', () => {
    expect(parseDotenv('KEY="say \\"hi\\""')).toEqual({ KEY: 'say "hi"' });
  });

  it('ダブルクォート内のエスケープされたバックスラッシュを解除する', () => {
    expect(parseDotenv('KEY="C:\\\\path"')).toEqual({ KEY: 'C:\\path' });
  });

  it('ダブルクォート内のバックスラッシュ＋エスケープクォート連鎖を正しく解除する', () => {
    expect(parseDotenv('KEY="a\\\\\\"b"')).toEqual({ KEY: 'a\\"b' });
  });

  it('シングルクォート内のエスケープされたシングルクォートを解除する', () => {
    expect(parseDotenv("KEY='it\\'s'")).toEqual({ KEY: "it's" });
  });
});

describe('roundtrip', () => {
  it('parseDotenv(stringifyDotenv(x)) が元のオブジェクトと一致する', () => {
    const original = {
      GREETING: 'say "hello"',
      WIN: 'C:\\path\\to',
      EMPTY: '',
      SP: 'a b',
    };
    expect(parseDotenv(stringifyDotenv(original))).toEqual(original);
  });
});

describe('stringifyDotenv', () => {
  it('フラットオブジェクトをKEY=VALUE形式に変換する', () => {
    const result = stringifyDotenv({ KEY: 'value', NUM: 42 });
    expect(result).toContain('KEY=value\n');
    expect(result).toContain('NUM=42\n');
  });

  it('スペースを含む値をクォートする', () => {
    const result = stringifyDotenv({ KEY: 'value with spaces' });
    expect(result).toContain('KEY="value with spaces"\n');
  });

  it('ネストしたオブジェクトで日本語エラーを投げる', () => {
    expect(() => stringifyDotenv({ nested: { key: 'value' } })).toThrow(
      '.envはフラットなKEY=VALUEのみ対応です。ネストしたオブジェクトや配列は変換できません'
    );
  });

  it('配列を含む場合に日本語エラーを投げる', () => {
    expect(() => stringifyDotenv({ arr: [1, 2, 3] })).toThrow(
      '.envはフラットなKEY=VALUEのみ対応です。ネストしたオブジェクトや配列は変換できません'
    );
  });

  it('真偽値を文字列に変換する', () => {
    const result = stringifyDotenv({ FLAG: true });
    expect(result).toContain('FLAG=true\n');
  });

  it('ダブルクォートを含む値をエスケープする', () => {
    const result = stringifyDotenv({ GREETING: 'say "hello"' });
    expect(result).toContain('GREETING="say \\"hello\\""');
  });

  it('空文字列をダブルクォートで囲む', () => {
    const result = stringifyDotenv({ EMPTY: '' });
    expect(result).toContain('EMPTY=""');
  });
});
