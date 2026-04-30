// クォート種・バックスラッシュのみアンエスケープ（単発走査で順序問題を回避）
function unescapeDotenv(s: string, quote: '"' | "'"): string {
  return s.replace(/\\(.)/g, (_, c) => (c === quote || c === '\\' ? c : '\\' + c));
}

/** .env文字列 → Record<string, string>。失敗時は Error を投げる */
export function parseDotenv(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.split('\n');

  for (const raw of lines) {
    const line = raw.trim();

    // 空行とコメント行をスキップ
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      throw new Error('有効な.envではありません: KEY=VALUE形式でない行があります: ' + line);
    }

    const key = line.slice(0, eqIndex).trim();
    if (key === '') {
      throw new Error('有効な.envではありません: キーが空の行があります: ' + line);
    }

    const rawValue = line.slice(eqIndex + 1);

    // ダブルクォート: "..." の後に末尾コメントがあっても正しく除去
    const dqMatch = rawValue.match(/^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/);
    // シングルクォート: '...' の後に末尾コメントがあっても正しく除去
    const sqMatch = rawValue.match(/^'((?:[^'\\]|\\.)*)'\s*(?:#.*)?$/);

    let value: string;
    if (dqMatch) {
      value = unescapeDotenv(dqMatch[1], '"');
    } else if (sqMatch) {
      value = unescapeDotenv(sqMatch[1], "'");
    } else {
      // クォートなし: 空白+# 以降をインラインコメントとして除去
      const commentIdx = rawValue.search(/\s+#/);
      value = (commentIdx !== -1 ? rawValue.slice(0, commentIdx) : rawValue).trim();
    }

    result[key] = value;
  }

  return result;
}

function quoteValue(val: string): string {
  if (!/[\s='"#\\]/.test(val) && val !== '') return val;
  // prefer double-quote; escape internal double-quotes
  const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/** JS値 → .env形式の文字列。ネストしたオブジェクト・配列は不可 */
export function stringifyDotenv(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    throw new Error(
      '.envはフラットなKEY=VALUEのみ対応です。ネストしたオブジェクトや配列は変換できません'
    );
  }

  const obj = value as Record<string, unknown>;
  const lines: string[] = [];

  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'object' && val !== null) {
      throw new Error(
        '.envはフラットなKEY=VALUEのみ対応です。ネストしたオブジェクトや配列は変換できません'
      );
    }

    const strVal = String(val);
    const serialized = quoteValue(strVal);

    lines.push(`${key}=${serialized}`);
  }

  return lines.map((l) => l + '\n').join('');
}
