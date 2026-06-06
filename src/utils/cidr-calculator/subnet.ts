/**
 * CIDR サブネット分割ロジック。
 * 外部ライブラリなし・ブラウザ完結。BigInt で IPv4/IPv6 統一処理。
 */

import { parseCidr } from './parse';
import { parseIpv4, formatIpv4 } from './ipv4';
import { parseIpv6, formatIpv6 } from './ipv6';
import type { CidrInfo } from './types';

/** splitSubnet の上限（分割数が多すぎるとブラウザが固まるため制限） */
const SPLIT_MAX_COUNT = 1024n;

/**
 * 指定した CIDR を新しい prefix 長で等分割し、各サブネットの CidrInfo 配列を返す。
 *
 * @param input  分割元 CIDR 文字列（例: "192.168.1.0/24"）
 * @param newPrefix  分割先 prefix 長（整数。元の prefix より大きい必要がある）
 * @throws {Error} バリデーション違反（日本語メッセージ）
 */
export function splitSubnet(input: string, newPrefix: number): CidrInfo[] {
  // 1. 基底サブネットを parseCidr で検証・取得（重複ロジックなし）
  const base = parseCidr(input);

  // 2. newPrefix バリデーション
  if (!Number.isInteger(newPrefix)) {
    throw new Error('分割先 prefix は整数で指定してください');
  }

  const maxBits = base.version === 4 ? 32 : 128;

  if (newPrefix < 0 || newPrefix > maxBits) {
    throw new Error(
      `分割先 prefix は 0–${maxBits} の範囲で指定してください（指定値: ${newPrefix}）`
    );
  }

  if (newPrefix <= base.prefixLength) {
    throw new Error(
      `分割先 prefix は元の prefix より大きくする必要があります（元: /${base.prefixLength}、指定: /${newPrefix}）`
    );
  }

  // 3. 分割数チェック
  const count = 1n << BigInt(newPrefix - base.prefixLength);
  if (count > SPLIT_MAX_COUNT) {
    throw new Error(
      `分割数が多すぎます（最大 1024）。より小さい prefix 差を指定してください（現在の分割数: ${count.toLocaleString()}）`
    );
  }

  // 4. ネットワーク先頭アドレスを BigInt に復元
  const step = 1n << BigInt(maxBits - newPrefix);
  const networkInt =
    base.version === 4 ? parseIpv4(base.networkAddress) : parseIpv6(base.networkAddress);

  // 5. 各サブネットを生成
  const results: CidrInfo[] = [];
  for (let i = 0n; i < count; i++) {
    const subNetworkInt = networkInt + i * step;
    const ip = base.version === 4 ? formatIpv4(subNetworkInt) : formatIpv6(subNetworkInt);
    results.push(parseCidr(`${ip}/${newPrefix}`));
  }

  return results;
}
