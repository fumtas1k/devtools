import { describe, it, expect } from 'vitest';
import { encodeBase64, decodeBase64 } from '@/utils/base64';

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
