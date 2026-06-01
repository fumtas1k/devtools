import { describe, it, expect } from 'vitest';
import { convert } from '../index';

describe('convert', () => {
  it('JSONをYAMLに変換する', () => {
    const result = convert('{"a":1}', 'json', 'yaml');
    expect(result.output).toContain('a: 1');
    expect(result.warnings).toEqual([]);
  });

  it('YAMLをJSONに変換する', () => {
    const result = convert('a: 1', 'yaml', 'json');
    const parsed = JSON.parse(result.output);
    expect(parsed).toEqual({ a: 1 });
  });

  it('TOMLをJSONに変換する', () => {
    const result = convert('[server]\nport = 8080', 'toml', 'json');
    const parsed = JSON.parse(result.output);
    expect(parsed).toEqual({ server: { port: 8080 } });
  });

  it('dotenvをJSONに変換する', () => {
    const result = convert('KEY=value', 'dotenv', 'json');
    const parsed = JSON.parse(result.output);
    expect(parsed).toEqual({ KEY: 'value' });
  });

  it('YAML→YAML同一フォーマットでコメントを保持する', () => {
    const result = convert('# my comment\nkey: value', 'yaml', 'yaml');
    expect(result.output).toContain('# my comment');
    expect(result.warnings).toEqual([]);
  });

  it('JSON→JSON同一フォーマットで整形する', () => {
    const result = convert('{"a":1}', 'json', 'json');
    expect(result.output).toContain('  "a"');
    expect(result.warnings).toEqual([]);
  });

  it('TOML→TOML同一フォーマットでコメント警告を出す', () => {
    const result = convert('name = "app"', 'toml', 'toml');
    expect(result.warnings).toContain('TOMLは整形時にコメントが失われます');
  });

  it('ネストしたオブジェクトをdotenvに変換しようとするとエラーを投げる', () => {
    expect(() => convert('{"a":{"b":1}}', 'json', 'dotenv')).toThrow();
  });

  it('YAML→JSONでコメント警告を出す', () => {
    const result = convert('a: 1', 'yaml', 'json');
    expect(result.warnings).toContain('コメントは変換時に失われます');
  });

  it('TOML→JSONでコメント警告を出す', () => {
    const result = convert('[s]\nk = 1', 'toml', 'json');
    expect(result.warnings).toContain('コメントは変換時に失われます');
  });

  it('JSON→dotenvで値の文字列化警告を出す', () => {
    const result = convert('{"KEY":"val"}', 'json', 'dotenv');
    expect(result.warnings).toContain('値はすべて文字列に変換されます');
  });

  it('dotenv→JSONで値の文字列読み込み警告を出す', () => {
    const result = convert('KEY=value', 'dotenv', 'json');
    expect(result.warnings).toContain('値はすべて文字列として読み込まれます');
  });
});
