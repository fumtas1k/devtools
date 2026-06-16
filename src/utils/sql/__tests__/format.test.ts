import { describe, it, expect } from 'vitest';
import { formatSql } from '../format';

describe('formatSql', () => {
  it('小文字キーワードを大文字に整形しインデントする', () => {
    const result = formatSql('select id, name from users where id = 1', 'mysql');
    expect(result).toContain('SELECT');
    expect(result).toContain('FROM');
    expect(result).toContain('WHERE');
    // 複数行に整形される
    expect(result.split('\n').length).toBeGreaterThan(1);
  });

  it('PostgreSQL 方言で整形できる', () => {
    const result = formatSql('select * from t', 'postgresql');
    expect(result).toContain('SELECT');
    expect(result).toContain('*');
    expect(result).toContain('FROM');
  });

  it('SQLite 方言で整形できる', () => {
    const result = formatSql('select 1', 'sqlite');
    expect(result).toContain('SELECT');
  });

  it('SQL Server 方言（transactsql）で整形できる', () => {
    const result = formatSql('select top 1 id from t', 'sqlserver');
    expect(result).toContain('SELECT');
  });

  it('整形不能な入力で日本語エラーを投げる', () => {
    expect(() => formatSql("select * from t where name = 'unterminated", 'mysql')).toThrow(
      'SQL を整形できませんでした'
    );
  });

  describe('カンマ位置（commaPosition）', () => {
    it('既定（after）は行末カンマで整形する', () => {
      const result = formatSql('select id, name from users', 'mysql');
      const lines = result.split('\n');
      // カラム行が行末カンマで終わる（先頭カンマ行は存在しない）
      expect(lines).toContain('  id,');
      expect(lines.some((l) => /^\s*,/.test(l))).toBe(false);
    });

    it('before 指定で行末カンマを次行の先頭へ移動する', () => {
      const result = formatSql('select id, name, email from users', 'mysql', 'before');
      const lines = result.split('\n');
      // 先頭カンマスタイル: カラム行の先頭にカンマが付き、行末カンマは消える
      expect(lines).toContain('  id');
      expect(lines).toContain('  , name');
      expect(lines).toContain('  , email');
      expect(lines.some((l) => l.endsWith(','))).toBe(false);
    });

    it('before でも文字列リテラル内のカンマは変換しない', () => {
      const result = formatSql("select id from t where tag = 'a,b'", 'mysql', 'before');
      // 文字列内のカンマはそのまま保持される
      expect(result).toContain("'a,b'");
      // 'a,b' を先頭カンマに割ってしまっていないこと
      expect(result).not.toContain(", b'");
    });
  });
});
