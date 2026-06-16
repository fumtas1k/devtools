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

    it('before では文末セミコロンを単独行にする', () => {
      const result = formatSql('select id from users;', 'mysql', 'before');
      const lines = result.split('\n');
      // セミコロンだけの行が存在する
      expect(lines).toContain(';');
    });

    it('after（既定）では文末セミコロンを単独行にしない', () => {
      const result = formatSql('select id from users;', 'mysql');
      const lines = result.split('\n');
      // セミコロン単独行は作らない（直前トークンと同じ行に付く）
      expect(lines).not.toContain(';');
    });

    it('before でも文字列リテラル内のカンマは変換しない', () => {
      const result = formatSql("select id from t where tag = 'a,b'", 'mysql', 'before');
      // 文字列内のカンマはそのまま保持される
      expect(result).toContain("'a,b'");
      // 'a,b' を先頭カンマに割ってしまっていないこと
      expect(result).not.toContain(", b'");
    });

    // 以下は行ベースの素朴な後処理だと SQL を壊すケースの回帰ガード（陽性対照）。
    // 旧実装（行末が `,` かだけで判定）に当てると壊れて fail する。
    it('before で行末コメントのカンマ（-- foo,）を行末カンマと誤認しない', () => {
      const result = formatSql(
        'select id, name from t -- ok\n-- foo,\nwhere id = 1',
        'mysql',
        'before'
      );
      const lines = result.split('\n');
      // コメント内の `,` を剥がして次行へ差し込んだ不正な行が無い
      expect(lines).toContain('  -- foo,');
      expect(lines.some((l) => /^\s*,\s*WHERE/i.test(l))).toBe(false);
    });

    it('before で # 行コメントのカンマも誤認しない', () => {
      const result = formatSql('select id, name from t # foo,\nwhere id = 1', 'mysql', 'before');
      expect(result).toContain('# foo,');
      expect(result.split('\n').some((l) => /^\s*,\s*WHERE/i.test(l))).toBe(false);
    });

    it('before で複数行にまたがる文字列リテラルを壊さない', () => {
      const result = formatSql("select id from t where note = 'line1,\nline2'", 'mysql', 'before');
      // 文字列の中身（line1, を含む）がそのまま保持される
      expect(result).toContain("'line1,");
      expect(result).toContain("line2'");
      // 文字列内 `,` を行末カンマと誤認して先頭カンマ行を作っていない
      expect(result.split('\n').some((l) => /^\s*,\s*line2/.test(l))).toBe(false);
    });

    it('before で最終行の行末カンマを欠落させない', () => {
      // 整形器が末尾カンマを出す稀なケースでもカンマを失わない
      const result = formatSql('select a, b,', 'mysql', 'before');
      // 移動できた a→,b に加え、最終行の末尾カンマが保持されている
      expect(result).toContain(', b');
      expect(result.replace(/[^,]/g, '').length).toBe(2);
    });
  });
});
