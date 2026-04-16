/** UUID v7 の5フィールド分解結果 */
export interface UuidV7Fields {
  /** unix_ts_ms: 48bit ミリ秒 UNIX タイムスタンプ（表示用 "tttttttt-tttt"） */
  unixTsMs: string;
  /** ver: 4bit バージョン番号（常に "7"） */
  ver: string;
  /** rand_a: 12bit ランダムビット（3桁 hex） */
  randA: string;
  /** var: バリアント nibble（RFC 4122 = "8"〜"b"） */
  varNibble: string;
  /** rand_b: 62bit ランダムビット（"xxx-xxxxxxxxxxxx" 形式） */
  randB: string;
}

/**
 * UUID v7 文字列から 5フィールドを分解する
 * UUID 形式: tttttttt-tttt-7rrr-Vrrr-rrrrrrrrrrrr
 *
 * @param uuid - UUID v7 文字列（例: "019687a2-1234-7abc-8def-0123456789ab"）
 */
export function parseUuidV7Fields(uuid: string): UuidV7Fields {
  const parts = uuid.split('-');
  // parts[0] = tttttttt (32 bits)
  // parts[1] = tttt      (16 bits) → 合計48bit = unix_ts_ms
  // parts[2] = 7rrr      (ver=4bit + rand_a=12bit)
  // parts[3] = Vrrr      (var nibble + rand_b 上位12bit)
  // parts[4] = rrrrrrrrrrrr (rand_b 下位48bit)
  return {
    unixTsMs: `${parts[0]}-${parts[1]}`,
    ver: parts[2][0],
    randA: parts[2].substring(1),
    varNibble: parts[3][0],
    randB: `${parts[3].substring(1)}-${parts[4]}`,
  };
}

/**
 * UUID v7 の unix_ts_ms フィールドから ISO 8601 タイムスタンプを取得する
 *
 * @param uuid - UUID v7 文字列
 */
export function extractUuidV7Timestamp(uuid: string): string {
  const hex = uuid.replace(/-/g, '').substring(0, 12);
  const tsMs = parseInt(hex, 16);
  return new Date(tsMs).toISOString();
}
