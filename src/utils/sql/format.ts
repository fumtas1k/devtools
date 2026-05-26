import { format, type SqlLanguage } from 'sql-formatter';

/** UI が扱う方言キー。 */
export type SqlDialect = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver';

/** UI の方言キー → sql-formatter の language。SQL Server は transactsql。 */
const LANGUAGE_MAP: Record<SqlDialect, SqlLanguage> = {
  mysql: 'mysql',
  postgresql: 'postgresql',
  sqlite: 'sqlite',
  sqlserver: 'transactsql',
};

/**
 * SQL を指定方言で整形する。キーワードは大文字・2 スペースインデント固定。
 * sql-formatter がトークナイズに失敗した場合は日本語メッセージの Error を投げる。
 */
export function formatSql(sql: string, dialect: SqlDialect): string {
  try {
    return format(sql, {
      language: LANGUAGE_MAP[dialect],
      keywordCase: 'upper',
      tabWidth: 2,
      indentStyle: 'standard',
    });
  } catch {
    throw new Error('SQL を整形できませんでした。構文を確認してください');
  }
}
