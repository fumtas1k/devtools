import { parse, parseDocument, stringify } from 'yaml';

/** YAML文字列 → JS値。失敗時は Error を投げる */
export function parseYaml(text: string): unknown {
  try {
    return parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error('有効なYAMLではありません: ' + msg);
  }
}

/** JS値 → YAML文字列 */
export function stringifyYaml(value: unknown): string {
  return stringify(value);
}

/**
 * YAML → YAML 整形（コメント保持）
 * parseDocument() で Document を取得し、toString() で再シリアライズ
 */
export function formatYaml(text: string): string {
  const doc = parseDocument(text);
  return doc.toString();
}
