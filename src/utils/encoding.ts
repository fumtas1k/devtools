import * as Encoding from 'encoding-japanese';

export type EncodingName = 'UTF8' | 'SJIS' | 'EUCJP' | 'JIS' | 'UTF16LE' | 'UTF16BE' | 'ASCII';
export type SourceEncoding = EncodingName | 'AUTO';

export interface DetectionResult {
  encoding: EncodingName | 'UNKNOWN';
  hasBom: boolean;
  byteLength: number;
}

export const ENCODING_LABELS: Record<EncodingName | 'UNKNOWN' | 'AUTO', string> = {
  UTF8: 'UTF-8',
  SJIS: 'Shift_JIS (CP932)',
  EUCJP: 'EUC-JP',
  JIS: 'ISO-2022-JP',
  UTF16LE: 'UTF-16 LE',
  UTF16BE: 'UTF-16 BE',
  ASCII: 'ASCII',
  UNKNOWN: '不明',
  AUTO: '自動判定',
};

const MAX_BYTES = 10 * 1024 * 1024;
const CHUNK_SIZE = 8192;

const EJ_NORMALIZE: Record<string, EncodingName> = {
  UTF8: 'UTF8',
  UTF16: 'UTF16LE',
  UTF16BE: 'UTF16BE',
  UTF16LE: 'UTF16LE',
  UNICODE: 'UTF16LE',
  SJIS: 'SJIS',
  EUCJP: 'EUCJP',
  JIS: 'JIS',
  ASCII: 'ASCII',
  BINARY: 'ASCII',
};

function detectBom(bytes: Uint8Array): { encoding: EncodingName | null; bomLength: number } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'UTF8', bomLength: 3 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'UTF16LE', bomLength: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'UTF16BE', bomLength: 2 };
  }
  return { encoding: null, bomLength: 0 };
}

export function detectEncoding(bytes: Uint8Array): DetectionResult {
  if (bytes.length > MAX_BYTES) {
    throw new Error('ファイルが大きすぎます（上限 10 MB）');
  }

  const bom = detectBom(bytes);
  const hasBom = bom.encoding !== null;

  const detected = Encoding.detect(bytes);
  let encoding: EncodingName | 'UNKNOWN';

  if (detected && EJ_NORMALIZE[detected]) {
    encoding = EJ_NORMALIZE[detected];
  } else if (hasBom && bom.encoding) {
    encoding = bom.encoding;
  } else {
    encoding = 'UNKNOWN';
  }

  return { encoding, hasBom, byteLength: bytes.length };
}

export function decodeToText(bytes: Uint8Array, from: EncodingName): string {
  const arr = Array.from(bytes);
  const unicodeArr = Encoding.convert(arr, { to: 'UNICODE', from, type: 'array' });
  const parts: string[] = [];
  for (let i = 0; i < unicodeArr.length; i += CHUNK_SIZE) {
    parts.push(String.fromCharCode(...unicodeArr.slice(i, i + CHUNK_SIZE)));
  }
  return parts.join('');
}

export function convertBytes(
  bytes: Uint8Array,
  from: SourceEncoding,
  to: EncodingName,
  withBom: boolean,
): Uint8Array {
  const arr = Array.from(bytes);

  if (withBom) {
    if (to === 'UTF8') {
      // encoding-japanese は UTF-8 BOM を付与しないため手動でプリペンド
      const result = Encoding.convert(arr, { to, from: from as Encoding.Encoding, type: 'array' });
      return new Uint8Array([0xef, 0xbb, 0xbf, ...result]);
    }
    if (to === 'UTF16LE') {
      // to:'UTF16' + bom:'LE' で FF FE BOM 付き LE 出力
      const result = Encoding.convert(arr, { to: 'UTF16', from: from as Encoding.Encoding, type: 'array', bom: 'LE' });
      return new Uint8Array(result);
    }
    if (to === 'UTF16BE') {
      // to:'UTF16' + bom:'BE' で FE FF BOM 付き BE 出力
      const result = Encoding.convert(arr, { to: 'UTF16', from: from as Encoding.Encoding, type: 'array', bom: 'BE' });
      return new Uint8Array(result);
    }
  }

  const result = Encoding.convert(arr, {
    to,
    from: from as Encoding.Encoding,
    type: 'array',
  });
  return new Uint8Array(result);
}

export function textToUtf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export const BOM_ENCODINGS: ReadonlySet<EncodingName> = new Set(['UTF8', 'UTF16LE', 'UTF16BE']);

export const UTF16_ENCODINGS: ReadonlySet<EncodingName> = new Set(['UTF16LE', 'UTF16BE']);

export type NewlineMode = 'keep' | 'lf' | 'crlf';

export const NEWLINE_OPTIONS: Array<{ value: NewlineMode; label: string }> = [
  { value: 'keep', label: 'そのまま' },
  { value: 'lf', label: 'LF' },
  { value: 'crlf', label: 'CRLF' },
];

// UTF-8 / SJIS / EUC-JP / JIS / ASCII 向けのバイト単位正規化。
// UTF-16 は呼び出し元で除外すること（BOM バイトは 0x0A/0x0D を含まないため分離不要）。
export function normalizeNewlines(bytes: Uint8Array, mode: NewlineMode): Uint8Array {
  if (mode === 'keep' || bytes.length === 0) return bytes;

  const out: number[] = [];
  if (mode === 'lf') {
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) continue; // CR を捨てて次で LF を出力
      out.push(bytes[i]);
    }
  } else {
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x0a && bytes[i - 1] !== 0x0d) out.push(0x0d);
      out.push(bytes[i]);
    }
  }
  return Uint8Array.from(out);
}

// トグルボタン用の短縮ラベル (4文字以内 or ASCII)。検出結果カードの表示には ENCODING_LABELS を使う
export const SOURCE_ENCODINGS_ROW1: Array<{ value: SourceEncoding; label: string }> = [
  { value: 'AUTO', label: '自動判定' },
  { value: 'UTF8', label: 'UTF-8' },
  { value: 'SJIS', label: 'SJIS' },
  { value: 'EUCJP', label: 'EUC-JP' },
];
export const SOURCE_ENCODINGS_ROW2: Array<{ value: SourceEncoding; label: string }> = [
  { value: 'JIS', label: 'JIS' },
  { value: 'UTF16LE', label: 'UTF-16LE' },
  { value: 'UTF16BE', label: 'UTF-16BE' },
];

export const TARGET_ENCODINGS_ROW1: Array<{ value: EncodingName; label: string }> = [
  { value: 'UTF8', label: 'UTF-8' },
  { value: 'SJIS', label: 'SJIS' },
  { value: 'EUCJP', label: 'EUC-JP' },
];
export const TARGET_ENCODINGS_ROW2: Array<{ value: EncodingName; label: string }> = [
  { value: 'JIS', label: 'JIS' },
  { value: 'UTF16LE', label: 'UTF-16LE' },
  { value: 'UTF16BE', label: 'UTF-16BE' },
];
