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

    let value = line.slice(eqIndex + 1);

    // クォートを取り除く
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
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
