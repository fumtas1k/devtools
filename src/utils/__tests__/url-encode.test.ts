import { describe, it, expect } from 'vitest';
import { encodeUrl, decodeUrl, validateDecodeInput } from '../url-encode';

// ────────────────────────────────────────────
// encodeUrl
// ────────────────────────────────────────────
describe('encodeUrl', () => {
  it('空文字は空文字を返す', () => {
    expect(encodeUrl('')).toBe('');
  });

  it('ASCII のみの文字列はそのまま', () => {
    expect(encodeUrl('hello')).toBe('hello');
  });

  it('スペースを %20 にエンコードする', () => {
    expect(encodeUrl('hello world')).toBe('hello%20world');
  });

  it('日本語をエンコードする', () => {
    expect(encodeUrl('テスト')).toBe('%E3%83%86%E3%82%B9%E3%83%88');
  });

  it('URL の特殊文字（: / ? & =）をエンコードする', () => {
    expect(encodeUrl('https://example.com/?q=テスト&lang=ja')).toBe(
      'https%3A%2F%2Fexample.com%2F%3Fq%3D%E3%83%86%E3%82%B9%E3%83%88%26lang%3Dja'
    );
  });

  it("encodeURIComponent で予約されない文字（- _ . ! ~ * ' ( )）はエンコードしない", () => {
    expect(encodeUrl("-_.!~*'()")).toBe("-_.!~*'()");
  });
});

// ────────────────────────────────────────────
// decodeUrl
// ────────────────────────────────────────────
describe('decodeUrl', () => {
  it('空文字は空文字を返す', () => {
    expect(decodeUrl('')).toBe('');
  });

  it('%20 をスペースにデコードする', () => {
    expect(decodeUrl('hello%20world')).toBe('hello world');
  });

  it('日本語をデコードする', () => {
    expect(decodeUrl('%E3%83%86%E3%82%B9%E3%83%88')).toBe('テスト');
  });

  it('encodeUrl → decodeUrl でラウンドトリップする', () => {
    const original = 'https://example.com/検索?q=テスト&lang=ja';
    expect(decodeUrl(encodeUrl(original))).toBe(original);
  });

  it('不正なエンコード文字列は空文字を返す', () => {
    expect(decodeUrl('%GG')).toBe('');
    expect(decodeUrl('%')).toBe('');
  });
});

// ────────────────────────────────────────────
// validateDecodeInput
// ────────────────────────────────────────────
describe('validateDecodeInput', () => {
  it('空文字はエラーなし', () => {
    expect(validateDecodeInput('')).toBe('');
  });

  it('有効なエンコード文字列はエラーなし', () => {
    expect(validateDecodeInput('hello%20world')).toBe('');
    expect(validateDecodeInput('%E3%83%86%E3%82%B9%E3%83%88')).toBe('');
  });

  it('不正なエンコード文字列はエラーメッセージを返す', () => {
    expect(validateDecodeInput('%GG')).toBe('不正なURLエンコード文字列です');
    expect(validateDecodeInput('%')).toBe('不正なURLエンコード文字列です');
  });

  it('エンコードされていない日本語はエラーなし（そのまま通る）', () => {
    expect(validateDecodeInput('テスト')).toBe('');
  });
});
