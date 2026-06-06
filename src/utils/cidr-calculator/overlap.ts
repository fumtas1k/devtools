/**
 * 複数 CIDR の重複検出ロジック。
 * 外部送信なし、ブラウザ完結。
 */

import { parseCidr } from './parse';
import { parseIpv4 } from './ipv4';
import { parseIpv6 } from './ipv6';

/** 2 つの CIDR の重複関係 */
export type OverlapRelation = 'identical' | 'a-contains-b' | 'b-contains-a' | 'partial';

/** 重複が検出されたペア */
export interface OverlapPair {
  /** 入力行のインデックス（0 始まり、元配列位置を保持） */
  aIndex: number;
  bIndex: number;
  /** 正規化した CIDR（`${networkAddress}/${prefixLength}`） */
  aCidr: string;
  bCidr: string;
  relation: OverlapRelation;
}

/** 行単位の解析エラー */
export interface OverlapLineError {
  index: number;
  input: string;
  message: string;
}

/** detectOverlaps の戻り値 */
export interface OverlapResult {
  pairs: OverlapPair[];
  errors: OverlapLineError[];
  /** 解析成功した CIDR 数 */
  validCount: number;
}

interface ValidEntry {
  index: number;
  cidr: string;
  start: bigint;
  end: bigint;
  version: 4 | 6;
}

/**
 * 複数行の CIDR 文字列から重複するペアを検出する。
 *
 * - 空行はスキップ（インデックスは元配列位置を保持）
 * - 解析失敗行は errors に収集し、重複判定からは除外
 * - バージョンが異なるペア（IPv4 vs IPv6）は重複なしとして扱う
 */
export function detectOverlaps(inputs: string[]): OverlapResult {
  const pairs: OverlapPair[] = [];
  const errors: OverlapLineError[] = [];
  const valid: ValidEntry[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const trimmed = inputs[i].trim();
    if (!trimmed) continue; // 空行スキップ

    try {
      const info = parseCidr(trimmed);
      const start =
        info.version === 4 ? parseIpv4(info.networkAddress) : parseIpv6(info.networkAddress);
      const end = start + info.totalCount - 1n;
      valid.push({
        index: i,
        cidr: `${info.networkAddress}/${info.prefixLength}`,
        start,
        end,
        version: info.version,
      });
    } catch (e) {
      errors.push({
        index: i,
        input: trimmed,
        message: e instanceof Error ? e.message : '解析に失敗しました',
      });
    }
  }

  // 全有効ペア (i < j) を検査
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i];
      const b = valid[j];

      // バージョンが異なれば重複なし
      if (a.version !== b.version) continue;

      // 独立（重複なし）
      if (a.end < b.start || b.end < a.start) continue;

      let relation: OverlapRelation;
      if (a.start === b.start && a.end === b.end) {
        relation = 'identical';
      } else if (a.start <= b.start && a.end >= b.end) {
        relation = 'a-contains-b';
      } else if (b.start <= a.start && b.end >= a.end) {
        relation = 'b-contains-a';
      } else {
        relation = 'partial';
      }

      pairs.push({
        aIndex: a.index,
        bIndex: b.index,
        aCidr: a.cidr,
        bCidr: b.cidr,
        relation,
      });
    }
  }

  return { pairs, errors, validCount: valid.length };
}
