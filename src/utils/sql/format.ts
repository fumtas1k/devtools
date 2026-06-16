import { format, type SqlLanguage } from 'sql-formatter';

/** UI が扱う方言キー。 */
export type SqlDialect = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver';

/** カンマの配置。`after`: 行末（既定）/ `before`: 次行の先頭。 */
export type CommaPosition = 'after' | 'before';

/** UI の方言キー → sql-formatter の language。SQL Server は transactsql。 */
const LANGUAGE_MAP: Record<SqlDialect, SqlLanguage> = {
  mysql: 'mysql',
  postgresql: 'postgresql',
  sqlite: 'sqlite',
  sqlserver: 'transactsql',
};

/**
 * 整形済み SQL の行末カンマを次行の先頭へ移動する（先頭カンマスタイル）。
 *
 * sql-formatter v15 で `commaPosition` オプションが廃止されたため、整形結果に
 * 対する後処理として実装する。行ベースで判定し、行末（`,`）にあるカンマだけを
 * 対象にするため、文字列・コメント内のカンマ（行末に来ない）は変換されない。
 * 移動先の行はインデントを保ったまま `, ` を先頭に挿入する。
 */
function toLeadingCommas(sql: string): string {
  const lines = sql.split('\n');
  let pendingComma = false;
  const result = lines.map((line) => {
    let next = line;
    if (pendingComma) {
      // インデント（先頭空白）を保ったままカンマを差し込む
      next = next.replace(/^(\s*)/, '$1, ');
      pendingComma = false;
    }
    if (next.endsWith(',')) {
      next = next.slice(0, -1);
      pendingComma = true;
    }
    return next;
  });
  return result.join('\n');
}

/**
 * SQL を指定方言で整形する。キーワードは大文字・2 スペースインデント固定。
 * `commaPosition` で行末カンマ（既定）/ 先頭カンマを切り替える。
 * sql-formatter がトークナイズに失敗した場合は日本語メッセージの Error を投げる。
 */
export function formatSql(
  sql: string,
  dialect: SqlDialect,
  commaPosition: CommaPosition = 'after'
): string {
  let formatted: string;
  try {
    formatted = format(sql, {
      language: LANGUAGE_MAP[dialect],
      keywordCase: 'upper',
      tabWidth: 2,
      indentStyle: 'standard',
      // 先頭カンマスタイルでは文末セミコロンも単独行にして縦の区切りを揃える
      newlineBeforeSemicolon: commaPosition === 'before',
    });
  } catch {
    throw new Error('SQL を整形できませんでした。構文を確認してください');
  }
  return commaPosition === 'before' ? toLeadingCommas(formatted) : formatted;
}
