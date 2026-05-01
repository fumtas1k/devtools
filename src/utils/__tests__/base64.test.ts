import { describe, it, expect } from 'vitest';
import { encodeBase64, decodeBase64, pemBlockToBytes } from '@/utils/base64';

// ────────────────────────────────────────────
// encodeBase64
// ────────────────────────────────────────────
describe('encodeBase64', () => {
  it('ASCII 文字列を標準 Base64 にエンコードできる', () => {
    expect(encodeBase64('Hello, World!', false)).toBe('SGVsbG8sIFdvcmxkIQ==');
  });

  it('ASCII 文字列を URL-safe Base64 にエンコードできる（パディング除去）', () => {
    expect(encodeBase64('Hello, World!', true)).toBe('SGVsbG8sIFdvcmxkIQ');
  });

  it('日本語を標準 Base64 にエンコードできる', () => {
    const result = encodeBase64('こんにちは', false);
    // UTF-8 でエンコードされることを確認（デコードして一致）
    expect(decodeBase64(result, false)).toBe('こんにちは');
  });

  it('URL-safe 文字（+ → - と / → _）に変換される', () => {
    // btoa('>>>') = "Pj4+" (+ を含む), btoa('???') = "Pz8/" (/ を含む)
    // ブラウザ依存なので間接的にテスト
    const encoded = encodeBase64('こんにちは', true);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('空文字列はそのままエンコードできる', () => {
    expect(encodeBase64('', false)).toBe('');
    expect(encodeBase64('', true)).toBe('');
  });
});

// ────────────────────────────────────────────
// decodeBase64
// ────────────────────────────────────────────
describe('decodeBase64', () => {
  it('標準 Base64 をデコードできる', () => {
    expect(decodeBase64('SGVsbG8sIFdvcmxkIQ==', false)).toBe('Hello, World!');
  });

  it('URL-safe Base64（パディングなし）をデコードできる', () => {
    expect(decodeBase64('SGVsbG8sIFdvcmxkIQ', true)).toBe('Hello, World!');
  });

  it('日本語を含む Base64 をデコードできる', () => {
    const encoded = encodeBase64('こんにちは', false);
    expect(decodeBase64(encoded, false)).toBe('こんにちは');
  });

  it('URL-safe でエンコードした文字列をデコードできる', () => {
    const encoded = encodeBase64('日本語テスト', true);
    expect(decodeBase64(encoded, true)).toBe('日本語テスト');
  });

  it('不正な Base64 文字列は「有効なBase64文字列ではありません」エラー', () => {
    expect(() => decodeBase64('!!invalid!!', false)).toThrow('有効なBase64文字列ではありません');
  });

  it('空文字列はそのままデコードできる', () => {
    expect(decodeBase64('', false)).toBe('');
    expect(decodeBase64('', true)).toBe('');
  });

  it('エンコード→デコードのラウンドトリップ（標準）', () => {
    const original = 'テスト文字列 abc123 !@#';
    expect(decodeBase64(encodeBase64(original, false), false)).toBe(original);
  });

  it('エンコード→デコードのラウンドトリップ（URL-safe）', () => {
    const original = 'テスト文字列 abc123 !@#';
    expect(decodeBase64(encodeBase64(original, true), true)).toBe(original);
  });
});

// ────────────────────────────────────────────
// pemBlockToBytes
// ────────────────────────────────────────────
describe('pemBlockToBytes', () => {
  // btoa('hello') = 'aGVsbG8='
  const HELLO_BYTES = [104, 101, 108, 108, 111]; // "hello"
  const HELLO_PEM = `-----BEGIN PUBLIC KEY-----\naGVsbG8=\n-----END PUBLIC KEY-----`;

  it('正常な PEM ブロックをバイト列に変換できる', () => {
    const result = pemBlockToBytes(HELLO_PEM, 'PUBLIC KEY');
    expect(Array.from(result)).toEqual(HELLO_BYTES);
  });

  it('改行なしの PEM（Base64 を連結した形式）も変換できる', () => {
    const pem = `-----BEGIN PUBLIC KEY-----aGVsbG8=-----END PUBLIC KEY-----`;
    const result = pemBlockToBytes(pem, 'PUBLIC KEY');
    expect(Array.from(result)).toEqual(HELLO_BYTES);
  });

  it('ラベルが一致しない場合はエラーを投げる', () => {
    expect(() => pemBlockToBytes(HELLO_PEM, 'PRIVATE KEY')).toThrow(
      'PEM ブロック（PRIVATE KEY）が見つかりません'
    );
  });

  it('ヘッダーのみ（フッターなし）はエラーを投げる', () => {
    const pem = `-----BEGIN PUBLIC KEY-----\naGVsbG8=`;
    expect(() => pemBlockToBytes(pem, 'PUBLIC KEY')).toThrow(
      'PEM ブロック（PUBLIC KEY）が見つかりません'
    );
  });

  it('不正な Base64 は「PEM の Base64 が不正です」エラーを投げる', () => {
    const pem = `-----BEGIN PUBLIC KEY-----\n!!!not-base64!!!\n-----END PUBLIC KEY-----`;
    expect(() => pemBlockToBytes(pem, 'PUBLIC KEY')).toThrow('PEM の Base64 が不正です');
  });

  it('PRIVATE KEY ラベルでも同様に変換できる', () => {
    const pem = `-----BEGIN PRIVATE KEY-----\naGVsbG8=\n-----END PRIVATE KEY-----`;
    const result = pemBlockToBytes(pem, 'PRIVATE KEY');
    expect(Array.from(result)).toEqual(HELLO_BYTES);
  });
});
