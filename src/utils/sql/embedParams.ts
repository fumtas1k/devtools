import { type SqlDialect } from './format';

type ParamStyle = 'positional' | 'numbered' | 'named';

interface Placeholder {
  style: ParamStyle;
  start: number; // sql 内の開始 index
  end: number; // 終了 index（排他）
  index?: number; // numbered: 1 始まりの番号
  name?: string; // named: キー名
}

const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;

/**
 * SQL を走査し、文字列リテラル（'...'）・識別子クォート（"..." / `...`）・
 * コメント（-- 行 / 区間）を読み飛ばした「外側」のプレースホルダのみ収集する。
 * これにより 'why?' の ? を誤検出しない。
 * 制約: PostgreSQL の dollar-quoted string（$tag$...$tag$）は未対応（$ + 数字のみ番号指定として扱う）。
 */
function scanPlaceholders(sql: string): Placeholder[] {
  const result: Placeholder[] = [];
  const n = sql.length;
  let i = 0;
  // クォート系（' " `）を終端までスキップ。同記号 2 連はエスケープ扱い。
  const skipQuoted = (quote: string): void => {
    i++; // 開きクォートを消費
    while (i < n) {
      if (sql[i] === quote) {
        if (sql[i + 1] === quote) {
          i += 2; // エスケープ（'' / "" / ``）
          continue;
        }
        i++; // 閉じクォート
        return;
      }
      i++;
    }
  };

  while (i < n) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2; // 閉じ */ を消費（未終端でも i は末尾超で while を抜ける）
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      skipQuoted(c);
      continue;
    }
    if (c === '?') {
      result.push({ style: 'positional', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '$' && /[0-9]/.test(sql[i + 1] ?? '')) {
      let j = i + 1;
      while (j < n && /[0-9]/.test(sql[j])) j++;
      result.push({ style: 'numbered', start: i, end: j, index: Number(sql.slice(i + 1, j)) });
      i = j;
      continue;
    }
    if (c === ':') {
      if (sql[i + 1] === ':') {
        i += 2; // PostgreSQL の :: キャスト演算子
        continue;
      }
      if (i + 1 < n && IDENT_START.test(sql[i + 1])) {
        let j = i + 1;
        while (j < n && IDENT_CHAR.test(sql[j])) j++;
        result.push({ style: 'named', start: i, end: j, name: sql.slice(i + 1, j) });
        i = j;
        continue;
      }
    }
    i++;
  }
  return result;
}

/** JSON 値を方言に応じた SQL リテラルへ変換する。配列・オブジェクトは非対応。 */
function renderValue(value: unknown, dialect: SqlDialect): string {
  if (value === null) return 'NULL';
  switch (typeof value) {
    case 'string':
      return `'${value.replace(/'/g, "''")}'`;
    case 'number':
      return String(value);
    case 'boolean':
      return dialect === 'postgresql' ? (value ? 'TRUE' : 'FALSE') : value ? '1' : '0';
    default:
      throw new Error('配列・オブジェクトの値は埋め込めません');
  }
}

/**
 * プレースホルダ付き SQL に JSON パラメータを埋め込む（整形は行わない）。
 * 失敗時は日本語メッセージの Error を throw する。
 */
export function embedParams(sql: string, paramsJson: string, dialect: SqlDialect): string {
  const placeholders = scanPlaceholders(sql);
  if (placeholders.length === 0) return sql;

  const styles = new Set(placeholders.map((p) => p.style));
  if (styles.size > 1) {
    throw new Error(
      'プレースホルダの記法が混在しています（? / $n / :name のいずれかに統一してください）'
    );
  }
  const style = placeholders[0].style;

  let parsed: unknown;
  try {
    parsed = JSON.parse(paramsJson);
  } catch {
    throw new Error('パラメータが JSON として解釈できません');
  }

  const rendered: string[] = [];
  if (style === 'positional') {
    if (!Array.isArray(parsed)) throw new Error('? 記法のパラメータは JSON 配列で指定してください');
    if (parsed.length !== placeholders.length) {
      throw new Error(
        `プレースホルダ ${placeholders.length} 個に対しパラメータ ${parsed.length} 個です`
      );
    }
    placeholders.forEach((_, idx) => rendered.push(renderValue(parsed[idx], dialect)));
  } else if (style === 'numbered') {
    if (!Array.isArray(parsed))
      throw new Error('$n 記法のパラメータは JSON 配列で指定してください');
    placeholders.forEach((ph) => {
      const num = ph.index as number;
      if (num < 1 || num > parsed.length) {
        throw new Error(`$${num} はパラメータ配列の範囲外です（配列長 ${parsed.length}）`);
      }
      rendered.push(renderValue(parsed[num - 1], dialect));
    });
  } else {
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(':name 記法のパラメータは JSON オブジェクトで指定してください');
    }
    const obj = parsed as Record<string, unknown>;
    placeholders.forEach((ph) => {
      const key = ph.name as string;
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        throw new Error(`パラメータに :${key} がありません`);
      }
      rendered.push(renderValue(obj[key], dialect));
    });
  }

  let out = sql;
  for (let k = placeholders.length - 1; k >= 0; k--) {
    out = out.slice(0, placeholders[k].start) + rendered[k] + out.slice(placeholders[k].end);
  }
  return out;
}
