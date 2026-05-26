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
});
