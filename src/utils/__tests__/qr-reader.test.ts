import { describe, it, expect } from 'vitest';
import { detectQrContent } from '@/utils/qr-reader';

describe('detectQrContent', () => {
  describe('HTTP/HTTPS URL', () => {
    it('https:// URLは kind: url として検出する', () => {
      const result = detectQrContent('https://example.com');
      expect(result.kind).toBe('url');
    });

    it('http:// URLは kind: url として検出する', () => {
      const result = detectQrContent('http://example.com');
      expect(result.kind).toBe('url');
    });

    it('URLのホスト名を正しく抽出する', () => {
      const result = detectQrContent('https://example.com/path?query=1');
      expect(result.kind).toBe('url');
      if (result.kind === 'url') {
        expect(result.hostname).toBe('example.com');
      }
    });

    it('raw フィールドに元の文字列をそのまま保持する', () => {
      const input = 'https://example.com/path';
      const result = detectQrContent(input);
      expect(result.raw).toBe(input);
    });

    it('url フィールドに URL オブジェクトを含む', () => {
      const result = detectQrContent('https://example.com');
      expect(result.kind).toBe('url');
      if (result.kind === 'url') {
        expect(result.url).toBeInstanceOf(URL);
      }
    });
  });

  describe('危険スキームは kind: text として扱う', () => {
    it('javascript: スキームは kind: text にする（XSS対策）', () => {
      const result = detectQrContent('javascript:alert(1)');
      expect(result.kind).toBe('text');
    });

    it('data: スキームは kind: text にする', () => {
      const result = detectQrContent('data:text/html,<script>alert(1)</script>');
      expect(result.kind).toBe('text');
    });

    it('file: スキームは kind: text にする', () => {
      const result = detectQrContent('file:///etc/passwd');
      expect(result.kind).toBe('text');
    });
  });

  describe('その他のスキームは kind: text として扱う', () => {
    it('mailto: スキームは kind: text にする', () => {
      const result = detectQrContent('mailto:user@example.com');
      expect(result.kind).toBe('text');
    });

    it('tel: スキームは kind: text にする', () => {
      const result = detectQrContent('tel:+81-90-0000-0000');
      expect(result.kind).toBe('text');
    });
  });

  describe('プレーンテキスト', () => {
    it('プレーンテキストは kind: text にする', () => {
      const result = detectQrContent('Hello World');
      expect(result.kind).toBe('text');
    });

    it('JSON文字列は kind: text にする', () => {
      const result = detectQrContent('{"key":"value"}');
      expect(result.kind).toBe('text');
    });

    it('不正なURL文字列は kind: text にする', () => {
      const result = detectQrContent('https://');
      expect(result.kind).toBe('text');
    });

    it('空文字列は kind: text にする', () => {
      const result = detectQrContent('');
      expect(result.kind).toBe('text');
    });

    it('raw フィールドに元の文字列をそのまま保持する', () => {
      const input = 'just some text';
      const result = detectQrContent(input);
      expect(result.raw).toBe(input);
    });
  });
});
