// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { detectQrContent, decodeQrFromFile } from '@/utils/qr-reader';

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

describe('decodeQrFromFile — AbortSignal キャンセル', () => {
  it('既にキャンセル済みの signal を渡すと AbortError が reject される', async () => {
    const controller = new AbortController();
    controller.abort();

    // jsdom では URL.createObjectURL が未実装なので stub する
    const origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:stub';
    URL.revokeObjectURL = () => {};

    const file = new File(['dummy'], 'test.png', { type: 'image/png' });
    await expect(
      decodeQrFromFile(file, { maxDim: 1600, signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });

    URL.createObjectURL = origCreateObjectURL;
  });

  it('キャンセルされていない signal を渡した場合は通常処理を試みる（load-error で解決）', async () => {
    const controller = new AbortController();

    // jsdom 環境で Image.onload/onerror を制御するため、
    // Image のコンストラクタを stub して即 onerror を呼ぶ
    const OrigImage = globalThis.Image;
    class FakeImage {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      set src(_: string) {
        // 次のマイクロタスクで onerror を発火させてロードエラーをシミュレート
        Promise.resolve().then(() => this.onerror?.());
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.Image = FakeImage as any;

    URL.createObjectURL = () => 'blob:stub';
    URL.revokeObjectURL = () => {};

    const file = new File(['dummy'], 'test.png', { type: 'image/png' });
    const result = await decodeQrFromFile(file, { maxDim: 1600, signal: controller.signal });
    expect(result).toEqual({ ok: false, reason: 'load-error' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.Image = OrigImage as any;
  });

  it('signal が abort されると処理中の Promise が AbortError で reject される', async () => {
    const controller = new AbortController();

    // Image が src セット後に abort が飛んでくるケースをシミュレート
    const OrigImage = globalThis.Image;
    class SlowImage {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      set src(_: string) {
        // abort を先に呼び、その後 onload を発火させる（onload は abort 後なので無視される）
        controller.abort();
        Promise.resolve().then(() => this.onload?.());
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.Image = SlowImage as any;

    URL.createObjectURL = () => 'blob:stub';
    URL.revokeObjectURL = () => {};

    const file = new File(['dummy'], 'test.png', { type: 'image/png' });
    await expect(
      decodeQrFromFile(file, { maxDim: 1600, signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.Image = OrigImage as any;
  });
});
