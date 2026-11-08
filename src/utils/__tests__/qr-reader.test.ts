// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import jsQR from 'jsqr';
import { detectQrContent, decodeQrFromFile } from '@/utils/qr-reader';

vi.mock('jsqr', () => ({ default: vi.fn() }));

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
    try {
      const result = await decodeQrFromFile(file, { maxDim: 1600, signal: controller.signal });
      expect(result).toEqual({ ok: false, reason: 'load-error' });
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      globalThis.Image = OrigImage as any;
    }
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
    try {
      await expect(
        decodeQrFromFile(file, { maxDim: 1600, signal: controller.signal })
      ).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      globalThis.Image = OrigImage as any;
    }
  });

  it('canvas.getContext が null の場合でも load-error として解決し、abort リスナーが残らない', async () => {
    const controller = new AbortController();
    const revokeCount = { count: 0 };

    // canvas.getContext を null 返しにする
    const origCreateElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'canvas') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (el as any).getContext = () => null;
      }
      return el;
    });

    const OrigImage = globalThis.Image;
    class CanvasNullImage {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      width = 100;
      height = 100;
      set src(_: string) {
        Promise.resolve().then(() => this.onload?.());
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.Image = CanvasNullImage as any;

    URL.createObjectURL = () => 'blob:stub';
    URL.revokeObjectURL = () => {
      revokeCount.count += 1;
    };

    const file = new File(['dummy'], 'test.png', { type: 'image/png' });
    try {
      const result = await decodeQrFromFile(file, { maxDim: 1600, signal: controller.signal });

      // load-error として解決すること
      expect(result).toEqual({ ok: false, reason: 'load-error' });
      // onload 内で 1 回だけ revoke されること（abort リスナーによる二重 revoke がないこと）
      expect(revokeCount.count).toBe(1);
    } finally {
      spy.mockRestore();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      globalThis.Image = OrigImage as any;
    }
  });
});

describe('decodeQrFromFile — 小画像の再試行', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.mocked(jsQR).mockReset();
  });

  function setupImage(width: number, height: number) {
    class FakeImage {
      width = width;
      height = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        Promise.resolve().then(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    URL.createObjectURL = vi.fn(() => 'blob:stub');
    URL.revokeObjectURL = vi.fn();
    const drawImage = vi.fn();
    const getImageData = vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }));
    const ctx = { drawImage, getImageData, imageSmoothingEnabled: false };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D
    );
    return { drawImage, getImageData, ctx };
  }

  const file = new File(['image'], 'test.png', { type: 'image/png' });
  const found = { data: 'qr-data' } as NonNullable<ReturnType<typeof jsQR>>;

  it('初回で読めた場合は追加描画・デコードをしない', async () => {
    const { drawImage } = setupImage(160, 80);
    vi.mocked(jsQR).mockReturnValue(found);
    await expect(decodeQrFromFile(file, { maxDim: 1600 })).resolves.toEqual({
      ok: true,
      data: 'qr-data',
    });
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(jsQR).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('小画像の初回失敗後、上限内で縦横比を保ち拡大して一度だけ再試行する', async () => {
    const { drawImage, getImageData, ctx } = setupImage(160, 80);
    vi.mocked(jsQR).mockReturnValueOnce(null).mockReturnValueOnce(found);
    await expect(decodeQrFromFile(file, { maxDim: 400.5 })).resolves.toEqual({
      ok: true,
      data: 'qr-data',
    });
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(drawImage.mock.calls[1].slice(1)).toEqual([0, 0, 400, 200]);
    expect(getImageData.mock.calls[1]).toEqual([0, 0, 400, 200]);
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(jsQR).toHaveBeenCalledTimes(2);
  });

  it.each([
    [160, 80, 160],
    [800, 400, 1600],
  ])('拡大不要の %i×%i 画像は失敗しても再試行しない', async (width, height, maxDim) => {
    const { drawImage } = setupImage(width, height);
    vi.mocked(jsQR).mockReturnValue(null);
    await expect(decodeQrFromFile(file, { maxDim })).resolves.toEqual({
      ok: false,
      reason: 'not-found',
    });
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(jsQR).toHaveBeenCalledTimes(1);
  });

  it('再試行でも失敗した画像は not-found を返す', async () => {
    const { getImageData } = setupImage(160, 160);
    vi.mocked(jsQR).mockReturnValue(null);
    await expect(decodeQrFromFile(file, { maxDim: 1600 })).resolves.toEqual({
      ok: false,
      reason: 'not-found',
    });
    expect(jsQR).toHaveBeenCalledTimes(2);
    expect(getImageData.mock.calls[1]).toEqual([0, 0, 768, 768]);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('再試行中にキャンセルされたら成功結果を返さず AbortError にする', async () => {
    setupImage(160, 160);
    const controller = new AbortController();
    vi.mocked(jsQR)
      .mockReturnValueOnce(null)
      .mockImplementationOnce(() => {
        controller.abort();
        return found;
      });
    await expect(
      decodeQrFromFile(file, { maxDim: 1600, signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(jsQR).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
