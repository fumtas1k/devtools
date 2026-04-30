/** JSON文字列 → JS値。失敗時は Error を投げる */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('有効なJSONではありません');
  }
}

/** JS値 → 2スペースインデントのJSON文字列 */
export function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
