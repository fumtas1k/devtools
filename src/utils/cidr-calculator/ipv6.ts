/**
 * IPv6 アドレスの文字列 ⇄ BigInt 変換。
 * 128 ビット符号なし整数を BigInt で表す。RFC 5952 準拠のフォーマット。
 */

import { parseIpv4 } from './ipv4';

/**
 * IPv6 アドレス文字列を 128 ビット BigInt にパースする。
 *
 * 対応記法:
 * - 完全形式: "2001:0db8:0000:0000:0000:0000:0000:0001"
 * - :: 省略形式: "2001:db8::1"（:: は 1 回のみ）
 * - IPv4 mapped/compatible 末尾記法: "::ffff:192.168.1.1"
 *
 * 拒否するケース:
 * - :: が 2 回以上
 * - hextet が 0000–ffff 範囲外（5 桁以上 = 必ず範囲外）
 * - グループ数の不整合（::なしで 8 グループでない、::込みで 9 グループ以上）
 * - 空グループ（::: 等）
 *
 * @throws {Error} 不正な IPv6 アドレス文字列
 */
export function parseIpv6(s: string): bigint {
  // :: の出現回数チェック（1 回のみ許可）
  const doubleColonCount = (s.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) {
    throw new Error(`不正な IPv6 アドレス: "::" が複数回現れる ("${s}")`);
  }

  // :: で左右に分割
  const hasDC = doubleColonCount === 1;
  let left: string;
  let right: string;

  if (hasDC) {
    const idx = s.indexOf('::');
    left = s.slice(0, idx);
    right = s.slice(idx + 2);
  } else {
    left = s;
    right = '';
  }

  // 左右をグループに分解
  const leftGroups = left !== '' ? left.split(':') : [];
  let rightGroups = right !== '' ? right.split(':') : [];

  // IPv4 末尾記法の検出と変換（最後のグループにドットが含まれる場合）
  let ipv4Suffix: bigint | null = null;
  if (rightGroups.length > 0 && rightGroups[rightGroups.length - 1].includes('.')) {
    const ipv4Str = rightGroups[rightGroups.length - 1];
    ipv4Suffix = parseIpv4(ipv4Str);
    rightGroups = rightGroups.slice(0, -1);
    // IPv4 は 32 ビット = 2 hextet 分
  } else if (leftGroups.length > 0 && leftGroups[leftGroups.length - 1].includes('.') && !hasDC) {
    // :: なしで左側の最後が IPv4（稀なケース対応）
    const ipv4Str = leftGroups[leftGroups.length - 1];
    // ドット区切りはパーサーに投げず、そもそも `:` 区切りグループ中の `.` は不正
    // IPv4 末尾は :: あり（右側）のみサポート
    void ipv4Str;
    throw new Error(
      `不正な IPv6 アドレス: IPv4 末尾記法は :: と組み合わせて使用してください ("${s}")`
    );
  }

  const allGroups = [...leftGroups, ...rightGroups];
  const ipv4HextetCount = ipv4Suffix !== null ? 2 : 0;
  const expectedTotal = 8 - ipv4HextetCount;

  if (!hasDC) {
    // :: なし → グループ数はちょうど expectedTotal でなければならない
    if (allGroups.length !== expectedTotal) {
      throw new Error(
        `不正な IPv6 アドレス: グループ数が不正 (期待=${expectedTotal}, 実際=${allGroups.length}) ("${s}")`
      );
    }
  } else {
    // :: あり → 合計グループ数が expectedTotal 以下でなければならない
    if (allGroups.length >= expectedTotal) {
      throw new Error(
        `不正な IPv6 アドレス: :: 使用時にグループが多すぎる (期待<${expectedTotal}, 実際=${allGroups.length}) ("${s}")`
      );
    }
  }

  // 各 hextet をパース
  const parsedHextets: bigint[] = [];
  for (const g of allGroups) {
    if (g === '') {
      // 空グループ（::: 等で発生する）
      throw new Error(`不正な IPv6 アドレス: 空の hextet が含まれる ("${s}")`);
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) {
      throw new Error(`不正な IPv6 アドレス: 無効な hextet "${g}" ("${s}")`);
    }
    parsedHextets.push(BigInt(parseInt(g, 16)));
  }

  // :: の省略部分を 0 で埋める
  const zeroFillCount = expectedTotal - parsedHextets.length;
  const expanded: bigint[] = hasDC
    ? [
        ...parsedHextets.slice(0, leftGroups.length),
        ...Array<bigint>(zeroFillCount).fill(0n),
        ...parsedHextets.slice(leftGroups.length),
      ]
    : parsedHextets;

  // 128 ビット BigInt に組み立て
  let result = 0n;
  for (const h of expanded) {
    result = (result << 16n) | h;
  }

  // IPv4 末尾がある場合は末尾 32 ビットに設定
  if (ipv4Suffix !== null) {
    result = (result << 32n) | ipv4Suffix;
  }

  return result;
}

/**
 * 128 ビット BigInt を RFC 5952 準拠の IPv6 アドレス文字列に変換する。
 *
 * RFC 5952 の規則:
 * - 小文字
 * - 先頭ゼロ省略（0001 → 1、0000 → 0）
 * - 最長の連続ゼロ hextet を :: で圧縮（同じ長さなら最初の連続を優先）
 * - :: で圧縮できる最小は 2 グループ以上（1 グループを :: にしない）
 */
export function formatIpv6(n: bigint): string {
  // 16 個の hextet に分解（8 × 16bit）
  const hextets: number[] = [];
  let tmp = n;
  for (let i = 0; i < 8; i++) {
    hextets.unshift(Number(tmp & 0xffffn));
    tmp >>= 16n;
  }

  // 最長の連続ゼロを探す（長さ 2 以上のみ :: 圧縮対象）
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;

  for (let i = 0; i < 8; i++) {
    if (hextets[i] === 0) {
      if (curStart === -1) {
        curStart = i;
        curLen = 1;
      } else {
        curLen++;
      }
      if (curLen > bestLen) {
        bestStart = curStart;
        bestLen = curLen;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  // 1 グループのみのゼロは圧縮しない（RFC 5952 §4.2.2）
  if (bestLen < 2) {
    bestStart = -1;
  }

  // 文字列組み立て
  const parts: string[] = [];
  for (let i = 0; i < 8; ) {
    if (i === bestStart) {
      parts.push('');
      i += bestLen;
      if (i === 8) parts.push(''); // 末尾に :: が来る場合
    } else {
      parts.push(hextets[i].toString(16));
      i++;
    }
  }

  const result = parts.join(':');
  // :: が先頭にある場合は "::xxx"、末尾の場合は "xxx::" になるよう調整
  if (result.startsWith(':') && !result.startsWith('::')) {
    return ':' + result;
  }
  return result;
}
