import type { Har } from './types';

export type ParseResult =
  | { ok: true; har: Har }
  | { ok: false; message: string };

/**
 * HAR JSON 文字列をパースし、最小スキーマ（log.entries が配列）を検証する。
 * 純関数。スキーマ全体は検証せず、本ツールが必要とする構造のみ確認する。
 */
export function parseHar(input: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `JSON として解析できません: ${detail}` };
  }

  if (typeof data !== 'object' || data === null || !('log' in data)) {
    return { ok: false, message: 'HAR 形式ではありません（log フィールドがありません）' };
  }

  const log = (data as { log: unknown }).log;
  if (typeof log !== 'object' || log === null || !('entries' in log)) {
    return { ok: false, message: 'HAR 形式ではありません（log.entries がありません）' };
  }

  const entries = (log as { entries: unknown }).entries;
  if (!Array.isArray(entries)) {
    return { ok: false, message: 'HAR 形式ではありません（log.entries が配列ではありません）' };
  }

  return { ok: true, har: data as Har };
}
