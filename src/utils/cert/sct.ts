/**
 * cert/sct.ts
 *
 * SCT（Signed Certificate Timestamp）拡張のデコード。
 * RFC 6962 の TLS シリアライズ構造を手動デコードする（ASN.1 ではない）。
 *
 * 構造:
 *   outer list length (2 bytes)
 *   for each SCT:
 *     sct length (2 bytes)
 *     version (1 byte)
 *     logId (32 bytes)
 *     timestamp (8 bytes, big-endian ms)
 *     extensions length (2 bytes)
 *     extensions (variable)
 *     signature hash alg (1 byte)
 *     signature sign alg (1 byte)
 *     signature length (2 bytes)
 *     signature (variable)
 */

import type { SctEntry } from './types';

/**
 * SCT 拡張の TLS シリアライズ済みバイト列をデコードする。
 * パースに失敗した場合は空配列を返す（throw しない）。
 *
 * @param data - 拡張値（OCTET STRING の内容）
 */
export function decodeSct(data: Uint8Array): SctEntry[] {
  try {
    return parseSctList(data);
  } catch {
    return [];
  }
}

function parseSctList(data: Uint8Array): SctEntry[] {
  if (data.length < 2) return [];

  // outer list length (2 bytes big-endian)
  const listLen = (data[0] << 8) | data[1];
  if (2 + listLen > data.length) return [];

  const result: SctEntry[] = [];
  let offset = 2;
  const end = 2 + listLen;

  while (offset < end) {
    if (offset + 2 > end) break;

    // 各 SCT の長さ（2 bytes）
    const sctLen = (data[offset] << 8) | data[offset + 1];
    offset += 2;

    if (offset + sctLen > end) break;
    const sctStart = offset;
    offset += sctLen;

    // SCT エントリを解析
    const entry = parseSctEntry(data, sctStart, sctLen);
    if (entry !== null) {
      result.push(entry);
    }
  }

  return result;
}

function parseSctEntry(data: Uint8Array, start: number, len: number): SctEntry | null {
  // 最小: version(1) + logId(32) + timestamp(8) + extLen(2) + sigAlgHash(1) + sigAlgSign(1) + sigLen(2) = 47
  if (len < 47) return null;

  let pos = start;

  // version (1 byte)
  const version = data[pos];
  pos += 1;

  // logId (32 bytes)
  const logIdBytes = data.slice(pos, pos + 32);
  pos += 32;
  const logId = Array.from(logIdBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // timestamp (8 bytes, big-endian milliseconds)
  // BigInt で計算して Number に変換（53bit precision で ms は 2255年まで安全）
  let tsBig = 0n;
  for (let i = 0; i < 8; i++) {
    tsBig = (tsBig << 8n) | BigInt(data[pos + i]);
  }
  pos += 8;
  const timestamp = Number(tsBig);

  return { version, logId, timestamp };
}
