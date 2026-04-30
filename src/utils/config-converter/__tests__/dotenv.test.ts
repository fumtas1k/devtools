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

  it('不正な行で日本語エラーを投げる', () => {
    expect(() => parseDotenv('INVALID LINE WITHOUT EQUALS')).toThrow('有効な.envではありません');
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
});
