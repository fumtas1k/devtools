import { describe, it, expect } from 'vitest';
import { parseYaml, stringifyYaml, formatYaml } from '../yaml';

describe('parseYaml', () => {
  it('シンプルなYAMLをパースする', () => {
    const result = parseYaml('key: value\nnum: 42');
    expect(result).toEqual({ key: 'value', num: 42 });
  });

  it('ネストしたYAMLをパースする', () => {
    const result = parseYaml('server:\n  port: 8080');
    expect(result).toEqual({ server: { port: 8080 } });
  });

  it('不正なYAMLで日本語エラーを投げる', () => {
    expect(() => parseYaml('key: [unclosed')).toThrow('有効なYAMLではありません');
  });
});

describe('stringifyYaml', () => {
  it('オブジェクトをYAML文字列に変換する', () => {
    const result = stringifyYaml({ key: 'value', num: 42 });
    expect(result).toContain('key: value');
    expect(result).toContain('num: 42');
  });

  it('ネストしたオブジェクトをYAML文字列に変換する', () => {
    const result = stringifyYaml({ server: { port: 8080 } });
    expect(result).toContain('server:');
    expect(result).toContain('port: 8080');
  });
});

describe('formatYaml', () => {
  it('コメントを保持して整形する', () => {
    const input = '# my comment\nkey: value';
    const result = formatYaml(input);
    expect(result).toContain('# my comment');
    expect(result).toContain('key: value');
  });

  it('インラインコメントを保持する', () => {
    const input = 'key: value # inline comment\nother: 123';
    const result = formatYaml(input);
    expect(result).toContain('inline comment');
    expect(result).toContain('other: 123');
  });
});
