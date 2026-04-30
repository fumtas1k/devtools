import { parse, stringify } from 'smol-toml';

/** TOML文字列 → JS値。失敗時は Error を投げる */
export function parseToml(text: string): unknown {
  try {
    return parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error('有効なTOMLではありません: ' + msg);
  }
}

/** JS値 → TOML文字列 */
export function stringifyToml(value: unknown): string {
  return stringify(value as Record<string, unknown>);
}
