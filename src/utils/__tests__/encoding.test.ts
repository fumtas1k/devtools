import { describe, it, expect } from 'vitest';
import { normalizeNewlines } from '@/utils/encoding';

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
