import { describe, it, expect } from 'vitest';
import {
  bytesToBase64Url,
  base64UrlToBytes,
  bufferToBase64Url,
  base64UrlToBuffer,
} from '@/utils/base64url';

// ────────────────────────────────────────────
// bytesToBase64Url / base64UrlToBytes
// ────────────────────────────────────────────
describe('bytesToBase64Url / base64UrlToBytes', () => {
  it('空の Uint8Array は空文字列にエンコードできる', () => {
    expect(bytesToBase64Url(new Uint8Array([]))).toBe('');
    expect(base64UrlToBytes('')).toEqual(new Uint8Array([]));
  });

  it('ASCII バイト列を base64url にエンコードしパディングを除去する', () => {
    // 'Hello' = [0x48, 0x65, 0x6c, 0x6c, 0x6f]
    const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    expect(bytesToBase64Url(bytes)).toBe('SGVsbG8');
  });

  it('+ と / を含むデータを - と _ に置換する', () => {
    // [0xff, 0xff, 0xff] -> "////" (標準) -> "____" (url-safe, パディング除去)
    expect(bytesToBase64Url(new Uint8Array([0xff, 0xff, 0xff]))).toBe('____');
    // [0xfb, 0xff, 0xff] -> "+///" -> "-___"
    expect(bytesToBase64Url(new Uint8Array([0xfb, 0xff, 0xff]))).toBe('-___');
  });

  it('base64url 文字列は - と _ を + と / に正規化してデコードできる', () => {
    expect(base64UrlToBytes('____')).toEqual(new Uint8Array([0xff, 0xff, 0xff]));
    expect(base64UrlToBytes('-___')).toEqual(new Uint8Array([0xfb, 0xff, 0xff]));
  });

  it('パディングが省略されていてもデコードできる（残り 2 / 3 バイト）', () => {
    // 'M' = [0x4d] -> "TQ==" -> base64url: "TQ"
    expect(base64UrlToBytes('TQ')).toEqual(new Uint8Array([0x4d]));
    // 'Ma' = [0x4d, 0x61] -> "TWE=" -> base64url: "TWE"
    expect(base64UrlToBytes('TWE')).toEqual(new Uint8Array([0x4d, 0x61]));
    // 'Man' = [0x4d, 0x61, 0x6e] -> "TWFu"（パディング不要）
    expect(base64UrlToBytes('TWFu')).toEqual(new Uint8Array([0x4d, 0x61, 0x6e]));
  });

  it('全バイト域 0x00-0xff を往復できる', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    const round = base64UrlToBytes(bytesToBase64Url(all));
    expect(round).toEqual(all);
  });

  it('日本語 UTF-8 バイト列を往復できる', () => {
    const utf8 = new TextEncoder().encode('こんにちは、世界');
    const round = base64UrlToBytes(bytesToBase64Url(utf8));
    expect(new TextDecoder().decode(round)).toBe('こんにちは、世界');
  });
});

// ────────────────────────────────────────────
// bufferToBase64Url / base64UrlToBuffer
// ────────────────────────────────────────────
describe('bufferToBase64Url / base64UrlToBuffer', () => {
  it('ArrayBuffer 経由で往復できる', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 0xff, 0xfe]);
    const encoded = bufferToBase64Url(original.buffer);
    const decoded = new Uint8Array(base64UrlToBuffer(encoded));
    expect(decoded).toEqual(original);
  });

  it('空 ArrayBuffer を空文字列に変換する', () => {
    expect(bufferToBase64Url(new ArrayBuffer(0))).toBe('');
    expect(base64UrlToBuffer('').byteLength).toBe(0);
  });
});
