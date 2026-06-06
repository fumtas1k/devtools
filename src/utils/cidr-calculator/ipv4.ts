/**
 * IPv4 アドレスの文字列 ⇄ BigInt 変換。
 * 32 ビット符号なし整数を BigInt で表す。
 */

/**
 * IPv4 アドレス文字列を 32 ビット BigInt にパースする。
 *
 * 拒否するケース:
 * - オクテット数が 4 でない（余分なドット・不足）
 * - 各オクテットが整数でない（小数・空・記号）
 * - 各オクテットが 0–255 の範囲外
 * - 先頭ゼロ（"01.0.0.0" 等 octal 表記を排除）
 *
 * @throws {Error} 不正な IPv4 アドレス文字列
 */
export function parseIpv4(s: string): bigint {
  const parts = s.split('.');
  if (parts.length !== 4) {
    throw new Error(`不正な IPv4 アドレス: オクテット数が 4 でない ("${s}")`);
  }

  let result = 0n;
  for (const part of parts) {
    // 空文字列・空白を弾く
    if (part === '') {
      throw new Error(`不正な IPv4 アドレス: 空のオクテットが含まれる ("${s}")`);
    }
    // 先頭ゼロを弾く（"0" 単体は許可、"00" や "01" は拒否）
    if (part.length > 1 && part[0] === '0') {
      throw new Error(`不正な IPv4 アドレス: 先頭ゼロは許可されない ("${part}")`);
    }
    // 整数チェック（符号・小数点・スペース不可）
    if (!/^\d+$/.test(part)) {
      throw new Error(`不正な IPv4 アドレス: 数字以外の文字 ("${part}")`);
    }
    const num = parseInt(part, 10);
    if (num < 0 || num > 255) {
      throw new Error(`不正な IPv4 アドレス: オクテット範囲外 ${num}`);
    }
    result = (result << 8n) | BigInt(num);
  }

  return result;
}

/**
 * 32 ビット BigInt を IPv4 アドレス文字列（ドット区切り 4 オクテット）に変換する。
 */
export function formatIpv4(n: bigint): string {
  const a = (n >> 24n) & 0xffn;
  const b = (n >> 16n) & 0xffn;
  const c = (n >> 8n) & 0xffn;
  const d = n & 0xffn;
  return `${a}.${b}.${c}.${d}`;
}
