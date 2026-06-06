/**
 * CIDR 文字列をパースしてネットワーク情報を計算する純関数。
 * 外部送信なし、ブラウザ完結。
 */

import { parseIpv4, formatIpv4 } from './ipv4';
import { parseIpv6, formatIpv6 } from './ipv6';
import type { CidrInfo } from './types';

/**
 * CIDR 文字列（"addr/prefix" または "addr"）を解析し、ネットワーク情報を返す。
 *
 * - ':' を含む → IPv6 とみなす
 * - '.' を含み ':' を含まない → IPv4 とみなす
 * - prefix 省略時は IPv4=32, IPv6=128
 *
 * @throws {Error} 不正な入力（アドレス形式・prefix 範囲外・非数等）
 */
export function parseCidr(input: string): CidrInfo {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('入力が空です');
  }

  // "/" でアドレスと prefix 長に分割
  const slashIdx = trimmed.indexOf('/');
  const addrStr = slashIdx >= 0 ? trimmed.slice(0, slashIdx) : trimmed;
  const prefixStr = slashIdx >= 0 ? trimmed.slice(slashIdx + 1) : null;

  // '/' だけで addrStr が空の場合
  if (!addrStr) {
    throw new Error(`不正な CIDR: アドレス部が空 ("${input}")`);
  }

  // IP バージョン判定
  const isV6 = addrStr.includes(':');
  const isV4 = !isV6;

  // prefix 長のパース
  let prefixLength: number;
  if (prefixStr === null) {
    prefixLength = isV6 ? 128 : 32;
  } else {
    if (!/^\d+$/.test(prefixStr)) {
      throw new Error(`不正な prefix 長: 数字以外の文字 ("${prefixStr}")`);
    }
    prefixLength = parseInt(prefixStr, 10);
  }

  if (isV4) {
    return calcV4(addrStr, prefixLength, input);
  } else {
    return calcV6(addrStr, prefixLength, input);
  }
}

// ─── IPv4 計算 ─────────────────────────────────────────────────────────────

function calcV4(addrStr: string, prefixLength: number, originalInput: string): CidrInfo {
  if (prefixLength < 0 || prefixLength > 32) {
    throw new Error(
      `IPv4 の prefix 長は 0–32 の範囲でなければなりません (${prefixLength}) ("${originalInput}")`
    );
  }

  const addrInt = parseIpv4(addrStr);

  // マスク計算（BigInt 32bit）
  // prefixLength=0 の場合はマスクなし（全ビット 0）
  const maskInt =
    prefixLength === 0 ? 0n : ((1n << BigInt(prefixLength)) - 1n) << BigInt(32 - prefixLength);
  const wildcardInt = 0xffffffffn ^ maskInt;

  const networkInt = addrInt & maskInt;
  const broadcastInt = networkInt | wildcardInt;

  const totalCount = 1n << BigInt(32 - prefixLength);

  // firstHost / lastHost / usableHostCount は prefix に依存
  let firstHostInt: bigint;
  let lastHostInt: bigint;
  let usableHostCount: bigint;

  if (prefixLength === 32) {
    // /32: ホスト自身のみ（network=broadcast=host）
    firstHostInt = networkInt;
    lastHostInt = networkInt;
    usableHostCount = 1n;
  } else if (prefixLength === 31) {
    // /31: RFC 3021 P2P リンク。network/broadcast 控除なし
    firstHostInt = networkInt;
    lastHostInt = broadcastInt;
    usableHostCount = 2n;
  } else {
    // /30 以下: network+1 ～ broadcast-1
    firstHostInt = networkInt + 1n;
    lastHostInt = broadcastInt - 1n;
    usableHostCount = totalCount - 2n;
  }

  // 2 進表記: ネットワークアドレスを 32 ビット 0 埋め → オクテット区切り
  const binStr = networkInt.toString(2).padStart(32, '0');
  const binaryNetwork = [
    binStr.slice(0, 8),
    binStr.slice(8, 16),
    binStr.slice(16, 24),
    binStr.slice(24, 32),
  ].join('.');

  return {
    version: 4,
    inputAddress: addrStr,
    prefixLength,
    networkAddress: formatIpv4(networkInt),
    broadcastAddress: formatIpv4(broadcastInt),
    firstHost: formatIpv4(firstHostInt),
    lastHost: formatIpv4(lastHostInt),
    totalCount,
    usableHostCount,
    subnetMask: formatIpv4(maskInt),
    wildcardMask: formatIpv4(wildcardInt),
    binaryNetwork,
  };
}

// ─── IPv6 計算 ─────────────────────────────────────────────────────────────

function calcV6(addrStr: string, prefixLength: number, originalInput: string): CidrInfo {
  if (prefixLength < 0 || prefixLength > 128) {
    throw new Error(
      `IPv6 の prefix 長は 0–128 の範囲でなければなりません (${prefixLength}) ("${originalInput}")`
    );
  }

  const addrInt = parseIpv6(addrStr);

  // 128 ビットマスク
  const maskInt =
    prefixLength === 0 ? 0n : ((1n << BigInt(prefixLength)) - 1n) << BigInt(128 - prefixLength);
  const wildcardInt = ((1n << 128n) - 1n) ^ maskInt;

  const networkInt = addrInt & maskInt;
  const totalCount = 1n << BigInt(128 - prefixLength);

  const firstHostInt = networkInt;
  const lastHostInt = networkInt | wildcardInt;
  const usableHostCount = totalCount;

  // 2 進表記: prefix までのビット列を "/" で示す簡潔表現
  // 例: prefixLength=32 → 先頭 32 ビット + "/32"
  const fullBinStr = networkInt.toString(2).padStart(128, '0');
  const binaryNetwork = `${fullBinStr.slice(0, prefixLength)}.../${prefixLength}`;

  return {
    version: 6,
    inputAddress: addrStr,
    prefixLength,
    networkAddress: formatIpv6(networkInt),
    broadcastAddress: null,
    firstHost: formatIpv6(firstHostInt),
    lastHost: formatIpv6(lastHostInt),
    totalCount,
    usableHostCount,
    subnetMask: null,
    wildcardMask: null,
    binaryNetwork,
  };
}
