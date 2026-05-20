import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob, downloadPngFromSvgElement, svgContentToPngBlob } from '@/utils/download';

/**
 * downloadBlob のスモークテスト。
 * vitest の environment は node なので DOM API は存在しない。
 * テストごとに必要な API（document, URL.createObjectURL/revokeObjectURL）を
 * vi.stubGlobal でモックし、終了後にリセットする。
 */
describe('downloadBlob', () => {
  let createdAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createdAnchor = { href: '', download: '', click: vi.fn() };
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();

    vi.stubGlobal('document', {
      createElement: vi.fn(() => createdAnchor),
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Blob から ObjectURL を作成して anchor.click() を呼ぶ', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    downloadBlob(blob, 'hello.txt');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(createdAnchor.click).toHaveBeenCalledTimes(1);
  });

  it('anchor.download に渡された filename がセットされる', () => {
    downloadBlob(new Blob(['x']), 'report.csv');
    expect(createdAnchor.download).toBe('report.csv');
  });

  it('anchor.href に ObjectURL がセットされる', () => {
    downloadBlob(new Blob(['x']), 'a.txt');
    expect(createdAnchor.href).toBe('blob:mock-url');
  });

  it('生成した ObjectURL は revokeObjectURL で解放される', () => {
    downloadBlob(new Blob(['x']), 'a.txt');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});

/**
 * downloadPngFromSvgElement の Promise 化 (issue #392) 検証。
 *
 * 旧実装は戻り型 void で img.onerror 発生時に「何もしない」silent failure
 * 経路を持っていた。Promise 化後は失敗を caller に伝播する必要がある。
 *
 * 陽性対照 (reject パス) と陰性対照 (resolve パス) を別 it() に分離。
 * 旧実装 (void) に陽性対照を当てると Promise インターフェイス自体が
 * 存在せず `await` できないため必ず fail する (test-gates 鉄則 1)。
 */
describe('downloadPngFromSvgElement', () => {
  let createdElements: Array<{ tag: string; el: Record<string, unknown> }>;
  let imgInstance: { onload: (() => void) | null; onerror: (() => void) | null; src: string };
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createdElements = [];
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();

    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        if (tag === 'canvas') {
          const el = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({ scale: vi.fn(), drawImage: vi.fn() })),
            toDataURL: vi.fn(() => 'data:image/png;base64,XXX'),
          };
          createdElements.push({ tag, el });
          return el;
        }
        if (tag === 'a') {
          const el = { href: '', download: '', click: vi.fn() };
          createdElements.push({ tag, el });
          return el;
        }
        return {};
      }),
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    // imgInstance は Image の src setter で確定される。
    // テスト本体は src 代入後 (= production code の img.src = url) に
    // imgInstance.onload / onerror を発火させる。
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        _src = '';
        get src() {
          return this._src;
        }
        set src(v: string) {
          this._src = v;
          imgInstance = this;
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // テスト用 SVGSVGElement のスタブ
  const makeSvgStub = () =>
    ({
      getBoundingClientRect: () => ({ width: 100, height: 50 }),
      outerHTML: '<svg width="100" height="50"></svg>',
    }) as unknown as SVGSVGElement;

  it('陰性対照: img.onload が発火すると Promise は resolve し anchor.click() が呼ばれる', async () => {
    const promise = downloadPngFromSvgElement(makeSvgStub(), 'jan-test.png');
    // src setter で imgInstance が確定 → onload を発火
    imgInstance.onload?.();
    await expect(promise).resolves.toBeUndefined();

    const anchor = createdElements.find((e) => e.tag === 'a')!.el as {
      download: string;
      click: ReturnType<typeof vi.fn>;
    };
    expect(anchor.download).toBe('jan-test.png');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('陽性対照: img.onerror が発火すると Promise は "PNG への変換に失敗しました" で reject する', async () => {
    const promise = downloadPngFromSvgElement(makeSvgStub(), 'jan-test.png');
    imgInstance.onerror?.();
    await expect(promise).rejects.toThrow('PNG への変換に失敗しました');
    // 失敗経路でも ObjectURL は確実に解放される
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('陽性対照: Canvas context の imageSmoothingEnabled が false に設定される (バーコード edge anti-alias 抑止)', async () => {
    // fix を revert (imageSmoothingEnabled = false 行を消す) すると context は
    // mock default の true のままで本テストが fail する設計 (test-gates 鉄則 1)。
    let capturedCtx: { imageSmoothingEnabled: boolean; scale: unknown; drawImage: unknown } | null =
      null;
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => {
              capturedCtx = { imageSmoothingEnabled: true, scale: vi.fn(), drawImage: vi.fn() };
              return capturedCtx;
            },
            toDataURL: vi.fn(() => 'data:image/png;base64,XXX'),
          };
        }
        if (tag === 'a') return { href: '', download: '', click: vi.fn() };
        return {};
      }),
    });

    const promise = downloadPngFromSvgElement(makeSvgStub(), 'jan-test.png');
    imgInstance.onload?.();
    await promise;
    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.imageSmoothingEnabled).toBe(false);
  });

  it('陽性対照: img.onload 内で canvas.toDataURL が throw した場合も Promise は reject する', async () => {
    // canvas.toDataURL を throw する stub に差し替える (tainted canvas 等の SecurityError 相当)
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ scale: vi.fn(), drawImage: vi.fn() }),
            toDataURL: () => {
              throw new Error('canvas is tainted');
            },
          };
        }
        if (tag === 'a') return { href: '', download: '', click: vi.fn() };
        return {};
      }),
    });

    const promise = downloadPngFromSvgElement(makeSvgStub(), 'jan-test.png');
    imgInstance.onload?.();
    await expect(promise).rejects.toThrow('canvas is tainted');
    // finally で ObjectURL は解放される
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});

/**
 * svgContentToPngBlob: PNG 変換時の anti-aliasing 抑止 (GS1 DataBar 認識失敗修正)。
 *
 * fix を revert (download.ts:55 付近の `ctx.imageSmoothingEnabled = false` を削る)
 * と本テストが必ず fail する陽性対照 (test-gates 鉄則 1)。
 *
 * 旧実装は ctx.drawImage(img, 0, 0) を smoothing 有効 default のまま呼んでおり、
 * scanner が黒/白二値閾値で bar 幅を取り違える事象を起こしていた。
 */
describe('svgContentToPngBlob', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let imgInstance: { onload: (() => void) | null; onerror: (() => void) | null; src: string };
  let capturedCtx: { imageSmoothingEnabled: boolean; scale: unknown; drawImage: unknown } | null;

  beforeEach(() => {
    capturedCtx = null;
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => {
              capturedCtx = { imageSmoothingEnabled: true, scale: vi.fn(), drawImage: vi.fn() };
              return capturedCtx;
            },
            toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
          };
        }
        return {};
      }),
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        _src = '';
        get src() {
          return this._src;
        }
        set src(v: string) {
          this._src = v;
          imgInstance = this;
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('陽性対照: Canvas context の imageSmoothingEnabled が false に設定される', async () => {
    const svg = '<svg width="100" height="50" viewBox="0 0 100 50"></svg>';
    const promise = svgContentToPngBlob(svg);
    imgInstance.onload?.();
    await promise;
    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.imageSmoothingEnabled).toBe(false);
  });

  it('width/height が無い SVG は reject される (既存契約)', async () => {
    const svg = '<svg viewBox="0 0 100 50"></svg>';
    await expect(svgContentToPngBlob(svg)).rejects.toThrow('width/height');
  });
});
