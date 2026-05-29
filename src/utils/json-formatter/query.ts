import { search } from 'jmespath';

export type QueryResult = { ok: true; result: unknown } | { ok: false; error: string };

/**
 * JMESPath 式で value から値を抽出する。該当なしは jmespath が null を返す。
 * 不正式は jmespath が throw するため捕捉し、日本語メッセージに変換する。
 */
export function runQuery(value: unknown, expr: string): QueryResult {
  try {
    return { ok: true, result: search(value, expr) };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `クエリ式が不正です: ${detail}` };
  }
}
