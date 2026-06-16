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
 * 各行が「コード文脈の行末カンマ」で終わるかを判定する。
 *
 * 文字列リテラル（'...' / "..." / `...`、同記号 2 連はエスケープ）・行コメント
 * （`--` / `#`）・区間コメント（`/* *\/`）の内側を読み飛ばし、それらの外側で
 * かつ行の末尾（末尾空白を除く最後の非空白文字）にあるカンマだけを true とする。
 * 区間コメント・複数行文字列は行をまたぐため、状態を行間で持ち越す。
 *
 * これにより「行末コメントがカンマで終わる行（`-- memo,`）」「カンマで折り返された
 * 複数行文字列（`'line1,` の物理行末）」を行末カンマと誤認せず、SQL を壊さない。
 */
function detectTrailingCodeCommas(lines: string[]): boolean[] {
  let inBlockComment = false;
  let inString: string | null = null; // 開いているクォート文字（' " `）。null はコード文脈
  return lines.map((line) => {
    let inLineComment = false; // 行コメントは行末でリセット（持ち越さない）
    let lastNonWsIsCodeComma = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const inCode = !inBlockComment && !inLineComment && !inString;
      // 末尾の非空白文字がコード文脈のカンマか追跡する（空白以外で毎回更新）
      if (ch !== ' ' && ch !== '\t') {
        lastNonWsIsCodeComma = inCode && ch === ',';
      }
      if (inBlockComment) {
        if (ch === '*' && line[i + 1] === '/') {
          inBlockComment = false;
          i++;
        }
        continue;
      }
      if (inLineComment) continue;
      if (inString) {
        if (ch === inString) {
          if (line[i + 1] === inString)
            i++; // エスケープ（'' / "" / ``）
          else inString = null;
        }
        continue;
      }
      // コード文脈での状態遷移
      if (ch === '-' && line[i + 1] === '-') {
        inLineComment = true;
        i++;
      } else if (ch === '#') {
        inLineComment = true;
      } else if (ch === '/' && line[i + 1] === '*') {
        inBlockComment = true;
        i++;
      } else if (ch === "'" || ch === '"' || ch === '`') {
        inString = ch;
      }
    }
    return lastNonWsIsCodeComma;
  });
}

/**
 * 整形済み SQL の行末カンマを次行の先頭へ移動する（先頭カンマスタイル）。
 *
 * sql-formatter v15 で `commaPosition` オプションが廃止されたため、整形結果に
 * 対する後処理として実装する。`detectTrailingCodeCommas` で「コード上の列区切り
 * カンマ」だけを対象に選別し（文字列・コメント内のカンマは除外）、移動先の行は
 * インデントを保ったまま `, ` を先頭に挿入する。
 * 最終行のカンマは移動先が無いため動かさず保持する（カンマ欠落を防ぐ）。
 */
function toLeadingCommas(sql: string): string {
  const lines = sql.split('\n');
  const endsWithCodeComma = detectTrailingCodeCommas(lines);
  const lastIndex = lines.length - 1;
  let pendingComma = false;
  const result = lines.map((line, ln) => {
    let next = line;
    if (pendingComma) {
      // インデント（先頭空白）を保ったままカンマを差し込む
      next = next.replace(/^(\s*)/, '$1, ');
      pendingComma = false;
    }
    // 移動先となる次行があるときだけ行末カンマを剥がす（最終行は保持）
    if (endsWithCodeComma[ln] && ln < lastIndex) {
      next = next.replace(/,(\s*)$/, '$1');
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
