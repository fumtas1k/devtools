import { describe, it, expect } from 'vitest';
import { parseToml, stringifyToml } from '../toml';

describe('parseToml', () => {
  it('シンプルなTOMLをパースする', () => {
    const result = parseToml('[server]\nport = 8080');
    expect(result).toEqual({ server: { port: 8080 } });
  });

  it('トップレベルのキーをパースする', () => {
    const result = parseToml('name = "myapp"\nversion = "1.0"');
    expect(result).toEqual({ name: 'myapp', version: '1.0' });
  });

  it('不正なTOMLで日本語エラーを投げる', () => {
    expect(() => parseToml('[unclosed')).toThrow('有効なTOMLではありません');
  });
});

describe('stringifyToml', () => {
  it('オブジェクトをTOML文字列に変換する', () => {
    const result = stringifyToml({ server: { port: 8080 } });
    expect(result).toContain('[server]');
    expect(result).toContain('port = 8080');
  });

  it('文字列値をTOML文字列に変換する', () => {
    const result = stringifyToml({ name: 'myapp' });
    expect(result).toContain('name = "myapp"');
  });
});
