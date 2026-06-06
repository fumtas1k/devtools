/** IP バージョン */
export type IpVersion = 4 | 6;

/**
 * parseCidr の計算結果。
 * IPv6 では broadcastAddress / subnetMask / wildcardMask は null になる。
 */
export interface CidrInfo {
  version: IpVersion;
  /** 入力されたアドレス文字列（prefix 除いた部分） */
  inputAddress: string;
  /** prefix 長 (0–32 for v4, 0–128 for v6) */
  prefixLength: number;
  /** ネットワークアドレス文字列 */
  networkAddress: string;
  /**
   * ブロードキャストアドレス文字列。
   * IPv6 はブロードキャストの概念がないため null。
   */
  broadcastAddress: string | null;
  /** 最初のホストアドレス文字列 */
  firstHost: string;
  /** 最後のホストアドレス文字列 */
  lastHost: string;
  /** ネットワーク内の総アドレス数（2^(host bits)） */
  totalCount: bigint;
  /**
   * 実際に利用可能なホスト数。
   * - IPv4 /32: 1（ホスト自身）
   * - IPv4 /31: 2（RFC 3021 P2P リンク）
   * - IPv4 /30 以下: total - 2（network + broadcast 除外）
   * - IPv6: total（控除なし）
   */
  usableHostCount: bigint;
  /**
   * サブネットマスク文字列（例: "255.255.255.0"）。
   * IPv6 は null。
   */
  subnetMask: string | null;
  /**
   * ワイルドカードマスク文字列（例: "0.0.0.255"）。
   * IPv6 は null。
   */
  wildcardMask: string | null;
  /**
   * ネットワークアドレスの 2 進表記。
   * IPv4: "11000000.10101000.00000001.00000000"（オクテット区切り）
   * IPv6: prefix 長までのビット列（簡潔表現）
   */
  binaryNetwork: string;
}
