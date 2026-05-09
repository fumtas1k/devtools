import * as Encoding from 'encoding-japanese';
import type { EncodingCompat } from './types';

/** UTF-8: 全 Unicode 表現可能、常に ok=true */
export function checkUtf8(s: string): EncodingCompat {
  const bytes = new TextEncoder().encode(s).length;
  return { ok: true, bytes, failedCount: 0 };
}

/**
 * UTF-8 BMP only (MySQL utf8mb3 相当)。
 * SMP 文字 (code point >= U+10000) があれば ok=false。
 */
export function checkUtf8Bmp(s: string): EncodingCompat {
  if (s.length === 0) return { ok: true, bytes: 0, failedCount: 0 };

  let failedCount = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x10000) failedCount++;
  }

  if (failedCount === 0) {
    return { ok: true, bytes: new TextEncoder().encode(s).length, failedCount: 0 };
  }
  return { ok: false, bytes: null, failedCount };
}

/** UTF-16: 全 Unicode 表現可能、常に ok=true。BOM なし純データとして s.length * 2 byte */
export function checkUtf16(s: string): EncodingCompat {
  return { ok: true, bytes: s.length * 2, failedCount: 0 };
}

const CHUNK = 8192;

function fromCharCodes(arr: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < arr.length; i += CHUNK) {
    parts.push(String.fromCharCode(...arr.slice(i, i + CHUNK)));
  }
  return parts.join('');
}

/** encoding-japanese の round-trip 判定。不一致文字を 1 code point ずつ収集 */
function roundTripCheck(s: string, to: 'SJIS' | 'EUCJP'): EncodingCompat {
  if (s.length === 0) return { ok: true, bytes: 0, failedCount: 0 };

  const unitArr = Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
  const converted = Encoding.convert(unitArr, { to, from: 'UNICODE', type: 'array' });
  const backUnits = Encoding.convert(converted, { to: 'UNICODE', from: to, type: 'array' });
  const reconstructed = fromCharCodes(backUnits);

  if (reconstructed === s) {
    return { ok: true, bytes: converted.length, failedCount: 0 };
  }

  let failedCount = 0;
  for (const ch of s) {
    const ua = Array.from({ length: ch.length }, (_, i) => ch.charCodeAt(i));
    const ca = Encoding.convert(ua, { to, from: 'UNICODE', type: 'array' });
    const bu = Encoding.convert(ca, { to: 'UNICODE', from: to, type: 'array' });
    const back = fromCharCodes(bu);
    if (back !== ch) failedCount++;
  }

  return { ok: false, bytes: null, failedCount };
}

/** Shift_JIS (CP932 / Windows-31J) 互換性チェック */
export function checkSjis(s: string): EncodingCompat {
  return roundTripCheck(s, 'SJIS');
}

/** EUC-JP 互換性チェック */
export function checkEucJp(s: string): EncodingCompat {
  return roundTripCheck(s, 'EUCJP');
}
