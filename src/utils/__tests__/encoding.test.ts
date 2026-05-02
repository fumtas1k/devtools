import { describe, it, expect } from 'vitest';
import {
  normalizeNewlines,
  detectEncoding,
  decodeToText,
  convertBytes,
  textToUtf8Bytes,
} from '@/utils/encoding';

// ────────────────────────────────────────────
// detectEncoding
// ────────────────────────────────────────────
describe('detectEncoding', () => {
  describe('BOM 検出', () => {
    it('UTF-8 BOM (EF BB BF) を検出し hasBom: true を返す', () => {
      // UTF-8 BOM + "A"
      const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x41]);
      const result = detectEncoding(bytes);
      expect(result.hasBom).toBe(true);
      expect(result.encoding).toBe('UTF8');
    });

    it('UTF-16 LE BOM (FF FE) を検出し hasBom: true を返す', () => {
      const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x00]);
      const result = detectEncoding(bytes);
      expect(result.hasBom).toBe(true);
      expect(result.encoding).toBe('UTF16LE');
    });

    it('UTF-16 BE BOM (FE FF) を検出し hasBom: true を返す', () => {
      const bytes = new Uint8Array([0xfe, 0xff, 0x00, 0x41]);
      const result = detectEncoding(bytes);
      // FE FF BOM があるので hasBom は true になる
      expect(result.hasBom).toBe(true);
      // encoding-japanese は FE FF を "UTF16" として検出し内部で UTF16LE にマップする
      // BOM の存在は hasBom で確認すること（実装の挙動に準拠）
      expect(['UTF16LE', 'UTF16BE']).toContain(result.encoding);
    });
  });

  describe('BOM なし入力', () => {
    it('純粋な ASCII バイト列を ASCII と判定する', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      const result = detectEncoding(bytes);
      expect(result.hasBom).toBe(false);
      expect(['ASCII', 'UTF8']).toContain(result.encoding); // ASCII は UTF8 互換
    });

    it('byteLength を正しく返す', () => {
      const bytes = new Uint8Array([0x41, 0x42, 0x43]); // "ABC"
      const result = detectEncoding(bytes);
      expect(result.byteLength).toBe(3);
    });
  });

  describe('サイズ制限', () => {
    it('10MB 超のバイト列に対して例外を throw する', () => {
      const huge = new Uint8Array(10 * 1024 * 1024 + 1);
      expect(() => detectEncoding(huge)).toThrow('大きすぎます');
    });
  });
});

// ────────────────────────────────────────────
// decodeToText
// ────────────────────────────────────────────
describe('decodeToText', () => {
  it('UTF-8 バイト列を文字列に復号する', () => {
    // UTF-8 "Hello"
    const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    const result = decodeToText(bytes, 'UTF8');
    expect(result).toBe('Hello');
  });

  it('UTF-8 で日本語を正しく復号する', () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('あいう');
    const result = decodeToText(bytes, 'UTF8');
    expect(result).toBe('あいう');
  });

  it('ASCII バイト列を UTF8 として復号する', () => {
    const bytes = new Uint8Array([0x41, 0x42, 0x43]); // "ABC"
    const result = decodeToText(bytes, 'ASCII');
    expect(result).toBe('ABC');
  });
});

// ────────────────────────────────────────────
// convertBytes
// ────────────────────────────────────────────
describe('convertBytes', () => {
  describe('BOM なし変換', () => {
    it('ASCII → UTF8 変換が成功する', () => {
      const input = new Uint8Array([0x41, 0x42, 0x43]); // "ABC"
      const result = convertBytes(input, 'ASCII', 'UTF8', false);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([0x41, 0x42, 0x43]);
    });

    it('UTF8 → ASCII 往復変換で元のバイト列と同一になる', () => {
      const input = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      const toUtf8 = convertBytes(input, 'ASCII', 'UTF8', false);
      const back = convertBytes(toUtf8, 'UTF8', 'ASCII', false);
      expect(Array.from(back)).toEqual(Array.from(input));
    });
  });

  describe('BOM 付き変換', () => {
    it('UTF-8 BOM 付き変換で先頭に EF BB BF が付く', () => {
      const input = new Uint8Array([0x41]); // "A"
      const result = convertBytes(input, 'UTF8', 'UTF8', true);
      expect(result[0]).toBe(0xef);
      expect(result[1]).toBe(0xbb);
      expect(result[2]).toBe(0xbf);
    });

    it('UTF-16 LE BOM 付き変換で先頭に FF FE が付く', () => {
      const input = new Uint8Array([0x41]); // "A"
      const result = convertBytes(input, 'UTF8', 'UTF16LE', true);
      expect(result[0]).toBe(0xff);
      expect(result[1]).toBe(0xfe);
    });

    it('UTF-16 BE BOM 付き変換で先頭に FE FF が付く', () => {
      const input = new Uint8Array([0x41]); // "A"
      const result = convertBytes(input, 'UTF8', 'UTF16BE', true);
      expect(result[0]).toBe(0xfe);
      expect(result[1]).toBe(0xff);
    });
  });
});

// ────────────────────────────────────────────
// textToUtf8Bytes
// ────────────────────────────────────────────
describe('textToUtf8Bytes', () => {
  it('ASCII 文字列を UTF-8 バイト列に変換する', () => {
    const result = textToUtf8Bytes('Hello');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it('空文字列は空の Uint8Array を返す', () => {
    const result = textToUtf8Bytes('');
    expect(result.length).toBe(0);
  });

  it('絵文字（サロゲートペア）を正しく UTF-8 バイト列に変換する', () => {
    // U+1F600 (😀) は UTF-8 で 4 バイト: F0 9F 98 80
    const result = textToUtf8Bytes('😀');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(4);
    expect(Array.from(result)).toEqual([0xf0, 0x9f, 0x98, 0x80]);
  });

  it('日本語を正しく UTF-8 バイト列に変換する', () => {
    // "あ" = E3 81 82 (3 バイト)
    const result = textToUtf8Bytes('あ');
    expect(Array.from(result)).toEqual([0xe3, 0x81, 0x82]);
  });
});

// ────────────────────────────────────────────
// normalizeNewlines
// ────────────────────────────────────────────
describe('normalizeNewlines', () => {
  describe('keep モード', () => {
    it('空入力をそのまま返す', () => {
      const input = new Uint8Array([]);
      expect(normalizeNewlines(input, 'keep')).toBe(input);
    });

    it('CRLF を含むバイト列をそのまま返す', () => {
      const input = new Uint8Array([0x41, 0x0d, 0x0a, 0x42]);
      expect(normalizeNewlines(input, 'keep')).toBe(input);
    });
  });

  describe('lf モード（CRLF → LF）', () => {
    it('空入力を空のまま返す', () => {
      const result = normalizeNewlines(new Uint8Array([]), 'lf');
      expect(result.length).toBe(0);
    });

    it('CRLF を LF に変換する', () => {
      const input = new Uint8Array([0x0d, 0x0a]);
      expect(Array.from(normalizeNewlines(input, 'lf'))).toEqual([0x0a]);
    });

    it('単独 LF はそのまま', () => {
      const input = new Uint8Array([0x0a]);
      expect(Array.from(normalizeNewlines(input, 'lf'))).toEqual([0x0a]);
    });

    it('単独 CR（末尾）はそのまま', () => {
      const input = new Uint8Array([0x41, 0x0d]);
      expect(Array.from(normalizeNewlines(input, 'lf'))).toEqual([0x41, 0x0d]);
    });

    it('テキスト中の CRLF を LF に変換する', () => {
      // A\r\nB
      const input = new Uint8Array([0x41, 0x0d, 0x0a, 0x42]);
      expect(Array.from(normalizeNewlines(input, 'lf'))).toEqual([0x41, 0x0a, 0x42]);
    });

    it('複数の CRLF をすべて LF に変換する', () => {
      const input = new Uint8Array([0x0d, 0x0a, 0x0d, 0x0a]);
      expect(Array.from(normalizeNewlines(input, 'lf'))).toEqual([0x0a, 0x0a]);
    });

    it('混在（CRLF + 単独LF + 単独CR）を正しく処理する', () => {
      // \r\n + \n + \r
      const input = new Uint8Array([0x0d, 0x0a, 0x0a, 0x0d]);
      expect(Array.from(normalizeNewlines(input, 'lf'))).toEqual([0x0a, 0x0a, 0x0d]);
    });

    it('末尾の CRLF を LF に変換する', () => {
      const input = new Uint8Array([0x41, 0x0d, 0x0a]);
      expect(Array.from(normalizeNewlines(input, 'lf'))).toEqual([0x41, 0x0a]);
    });

    it('UTF-8 日本語マルチバイト列（0x0D/0x0A を含まない）を破壊しない', () => {
      // UTF-8 "あ" = E3 81 82
      const input = new Uint8Array([0xe3, 0x81, 0x82]);
      expect(Array.from(normalizeNewlines(input, 'lf'))).toEqual([0xe3, 0x81, 0x82]);
    });
  });

  describe('crlf モード（LF → CRLF）', () => {
    it('空入力を空のまま返す', () => {
      const result = normalizeNewlines(new Uint8Array([]), 'crlf');
      expect(result.length).toBe(0);
    });

    it('単独 LF を CRLF に変換する', () => {
      const input = new Uint8Array([0x0a]);
      expect(Array.from(normalizeNewlines(input, 'crlf'))).toEqual([0x0d, 0x0a]);
    });

    it('既存の CRLF は重複変換しない', () => {
      const input = new Uint8Array([0x0d, 0x0a]);
      expect(Array.from(normalizeNewlines(input, 'crlf'))).toEqual([0x0d, 0x0a]);
    });

    it('単独 CR はそのまま', () => {
      const input = new Uint8Array([0x0d]);
      expect(Array.from(normalizeNewlines(input, 'crlf'))).toEqual([0x0d]);
    });

    it('テキスト中の単独 LF を CRLF に変換する', () => {
      // A\nB
      const input = new Uint8Array([0x41, 0x0a, 0x42]);
      expect(Array.from(normalizeNewlines(input, 'crlf'))).toEqual([0x41, 0x0d, 0x0a, 0x42]);
    });

    it('複数の単独 LF をすべて CRLF に変換する', () => {
      const input = new Uint8Array([0x0a, 0x0a]);
      expect(Array.from(normalizeNewlines(input, 'crlf'))).toEqual([0x0d, 0x0a, 0x0d, 0x0a]);
    });

    it('CRLF 直後の LF は単独 LF とみなして変換する', () => {
      // \r\n\n → \r\n\r\n（2つ目の \n は単独扱い）
      const input = new Uint8Array([0x0d, 0x0a, 0x0a]);
      expect(Array.from(normalizeNewlines(input, 'crlf'))).toEqual([0x0d, 0x0a, 0x0d, 0x0a]);
    });

    it('末尾の単独 LF を CRLF に変換する', () => {
      const input = new Uint8Array([0x41, 0x0a]);
      expect(Array.from(normalizeNewlines(input, 'crlf'))).toEqual([0x41, 0x0d, 0x0a]);
    });

    it('先頭の単独 LF を CRLF に変換する', () => {
      const input = new Uint8Array([0x0a, 0x41]);
      expect(Array.from(normalizeNewlines(input, 'crlf'))).toEqual([0x0d, 0x0a, 0x41]);
    });

    it('UTF-8 日本語マルチバイト列（0x0D/0x0A を含まない）を破壊しない', () => {
      // UTF-8 "あ" = E3 81 82
      const input = new Uint8Array([0xe3, 0x81, 0x82]);
      expect(Array.from(normalizeNewlines(input, 'crlf'))).toEqual([0xe3, 0x81, 0x82]);
    });
  });
});
