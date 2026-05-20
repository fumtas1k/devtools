import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob, downloadPngFromSvgElement, svgContentToPngBlob } from '@/utils/download';

/**
 * `src/utils/download.ts` の private const `RETINA_SCALE` の mirror。
 * canvas 寸法計算 (canvas.width = SVG.width * RETINA_SCALE) を test 側で再現する際に、
 * `200` / `100` 等の生数値ではなくこの定数を経由することで、将来 RETINA_SCALE を変更
 * した場合の link を明示する (#458 review B 対応)。
 */
const RETINA_SCALE = 2;

// ─────────────────────────────────────────────
// 共通 mock setup (#458 review A 対応)
//
// `downloadPngFromSvgElement` (`toDataURL` 出力) と `svgContentToPngBlob` (`toBlob` 出力)
// で重複していた canvas / Image / URL / anchor の stubGlobal 構築を `setupBrowserMocks()`
// に集約。観測対象 (call log / fillStyle / ctx / image / anchor) を MockHandles で返す。
//
// design 方針:
// - call log / capturedFillStyle / capturedCtx は **常に観測** (test 側で assert する/しないを選択)。
//   overhead は無視できる (vi.fn の wrapper のみ)。
// - 出力 API は `output: 'toBlob' | 'toDataURL'` で切替。`toDataURL` 時は `throwsOnInvoke`
//   で SecurityError 相当を強制可能 (tainted canvas 経路の陽性対照用)。
// - imgInstance / anchors は getter 経由 (closure 安定化、test 内で時間差発火可能)。
// ─────────────────────────────────────────────

type CallLog = { method: string; args: unknown[] };

interface MockedCtx {
  imageSmoothingEnabled: boolean;
  fillStyle: string;
  fillRect: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
}

interface AnchorStub {
  href: string;
  download: string;
  click: ReturnType<typeof vi.fn>;
}

interface ImgInstance {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
}

interface MockHandles {
  callLog: CallLog[];
  capturedCtx: { value: MockedCtx | null };
  getCapturedFillStyle: () => string | undefined;
  getImgInstance: () => ImgInstance | undefined;
  getCreatedAnchors: () => AnchorStub[];
  createObjectURL: ReturnType<typeof vi.fn>;
  revokeObjectURL: ReturnType<typeof vi.fn>;
}

type SetupOptions = { output: 'toBlob' } | { output: 'toDataURL'; throwsOnInvoke?: Error };

function setupBrowserMocks(opts: SetupOptions): MockHandles {
  const callLog: CallLog[] = [];
  let capturedFillStyle: string | undefined;
  const capturedCtx: { value: MockedCtx | null } = { value: null };
  let imgInstance: ImgInstance | undefined;
  const createdAnchors: AnchorStub[] = [];

  const createObjectURL = vi.fn(() => 'blob:mock-url');
  const revokeObjectURL = vi.fn();

  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => {
      if (tag === 'canvas') {
        const ctxStub = {
          imageSmoothingEnabled: true,
          set fillStyle(v: string) {
            capturedFillStyle = v;
            callLog.push({ method: 'set fillStyle', args: [v] });
          },
          get fillStyle() {
            return capturedFillStyle ?? '';
          },
          fillRect: vi.fn((...args: number[]) => callLog.push({ method: 'fillRect', args })),
          scale: vi.fn((...args: number[]) => callLog.push({ method: 'scale', args })),
          drawImage: vi.fn((...args: unknown[]) => callLog.push({ method: 'drawImage', args })),
        } as MockedCtx;
        const canvasEl: Record<string, unknown> = {
          width: 0,
          height: 0,
          getContext: () => {
            capturedCtx.value = ctxStub;
            return ctxStub;
          },
        };
        if (opts.output === 'toBlob') {
          canvasEl.toBlob = (cb: (b: Blob | null) => void) =>
            cb(new Blob(['png'], { type: 'image/png' }));
        } else {
          canvasEl.toDataURL = vi.fn(() => {
            if (opts.throwsOnInvoke) throw opts.throwsOnInvoke;
            return 'data:image/png;base64,XXX';
          });
        }
        return canvasEl;
      }
      if (tag === 'a') {
        const el: AnchorStub = { href: '', download: '', click: vi.fn() };
        createdAnchors.push(el);
        return el;
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
        imgInstance = this as unknown as ImgInstance;
      }
    }
  );

  return {
    callLog,
    capturedCtx,
    getCapturedFillStyle: () => capturedFillStyle,
    getImgInstance: () => imgInstance,
    getCreatedAnchors: () => createdAnchors,
    createObjectURL,
    revokeObjectURL,
  };
}

// テスト用 SVGSVGElement のスタブ (downloadPngFromSvgElement 用)
const makeSvgStub = () =>
  ({
    getBoundingClientRect: () => ({ width: 100, height: 50 }),
    outerHTML: '<svg width="100" height="50"></svg>',
  }) as unknown as SVGSVGElement;

/**
 * downloadBlob のスモークテスト。
 * vitest の environment は node なので DOM API は存在しない。
 * テストごとに必要な API（document, URL.createObjectURL/revokeObjectURL）を
 * vi.stubGlobal でモックし、終了後にリセットする。
 *
 * 注: canvas を使わないため `setupBrowserMocks` は経由せず、anchor のみ stub する。
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
  let m: MockHandles;

  beforeEach(() => {
    m = setupBrowserMocks({ output: 'toDataURL' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('陰性対照: img.onload が発火すると Promise は resolve し anchor.click() が呼ばれる', async () => {
    const promise = downloadPngFromSvgElement(makeSvgStub(), 'jan-test.png');
    // src setter で imgInstance が確定 → onload を発火
    m.getImgInstance()?.onload?.();
    await expect(promise).resolves.toBeUndefined();

    const anchors = m.getCreatedAnchors();
    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toBe('jan-test.png');
    expect(anchors[0].click).toHaveBeenCalledTimes(1);
    expect(m.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('陽性対照: img.onerror が発火すると Promise は "PNG への変換に失敗しました" で reject する', async () => {
    const promise = downloadPngFromSvgElement(makeSvgStub(), 'jan-test.png');
    m.getImgInstance()?.onerror?.();
    await expect(promise).rejects.toThrow('PNG への変換に失敗しました');
    // 失敗経路でも ObjectURL は確実に解放される
    expect(m.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('陽性対照: Canvas context の imageSmoothingEnabled が false に設定される (バーコード edge anti-alias 抑止)', async () => {
    // fix を revert (imageSmoothingEnabled = false 行を消す) すると context は
    // mock default の true のままで本テストが fail する設計 (test-gates 鉄則 1)。
    const promise = downloadPngFromSvgElement(makeSvgStub(), 'jan-test.png');
    m.getImgInstance()?.onload?.();
    await promise;
    expect(m.capturedCtx.value).not.toBeNull();
    expect(m.capturedCtx.value!.imageSmoothingEnabled).toBe(false);
  });

  // ─────────────────────────────────────────────
  // 陽性対照: PNG 背景白塗り (transparent decode 失敗修正)
  //
  // downloadPngFromSvgElement (JAN コード経路) も svgContentToPngBlob と同じく
  // Canvas2D default transparent 背景のまま drawImage していた。fix を revert
  // (`ctx.fillStyle = 'white'` / `ctx.fillRect(...)` を削る) と本テスト 2 件が
  // fail する設計 (call ログから fillRect が消える / fillStyle が undefined のまま)。
  // ─────────────────────────────────────────────
  it('陽性対照: fillStyle が white にセットされて fillRect が canvas 全面で呼ばれる (背景透明 → 白)', async () => {
    const promise = downloadPngFromSvgElement(makeSvgStub(), 'jan-test.png');
    m.getImgInstance()?.onload?.();
    await promise;
    expect(m.getCapturedFillStyle()).toBe('white');
    const fillRectCalls = m.callLog.filter((c) => c.method === 'fillRect');
    expect(fillRectCalls).toHaveLength(1);
    // getBoundingClientRect = { width: 100, height: 50 } → canvas は scale 前 device px 単位
    expect(fillRectCalls[0].args).toEqual([0, 0, 100 * RETINA_SCALE, 50 * RETINA_SCALE]);
  });

  it('陽性対照: 呼び出し順序は fillRect → scale → drawImage (背景 → retina 変換 → bars)', async () => {
    const promise = downloadPngFromSvgElement(makeSvgStub(), 'jan-test.png');
    m.getImgInstance()?.onload?.();
    await promise;
    const fillRectIdx = m.callLog.findIndex((c) => c.method === 'fillRect');
    const scaleIdx = m.callLog.findIndex((c) => c.method === 'scale');
    const drawImageIdx = m.callLog.findIndex((c) => c.method === 'drawImage');
    expect(fillRectIdx).toBeGreaterThanOrEqual(0);
    expect(scaleIdx).toBeGreaterThan(fillRectIdx);
    expect(drawImageIdx).toBeGreaterThan(scaleIdx);
  });

  it('陽性対照: img.onload 内で canvas.toDataURL が throw した場合も Promise は reject する', async () => {
    // canvas.toDataURL を throw する mock に差し替える (tainted canvas 等の SecurityError 相当)
    vi.unstubAllGlobals();
    const m2 = setupBrowserMocks({
      output: 'toDataURL',
      throwsOnInvoke: new Error('canvas is tainted'),
    });
    const promise = downloadPngFromSvgElement(makeSvgStub(), 'jan-test.png');
    m2.getImgInstance()?.onload?.();
    await expect(promise).rejects.toThrow('canvas is tainted');
    // finally で ObjectURL は解放される
    expect(m2.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});

/**
 * svgContentToPngBlob: PNG 変換時の anti-aliasing 抑止 (GS1 DataBar 認識失敗修正) +
 * PNG 背景白塗り (transparent decode 失敗修正)。
 *
 * fix を revert (`imageSmoothingEnabled = false` / `fillStyle = 'white'` /
 * `fillRect(...)` を削る) と各陽性対照テストが必ず fail する設計 (test-gates 鉄則 1)。
 *
 * 旧実装は ctx.drawImage(img, 0, 0) を smoothing 有効 default のまま呼んでおり、
 * scanner が黒/白二値閾値で bar 幅を取り違える事象を起こしていた。さらに Canvas2D
 * default の transparent 背景のまま drawImage していたため、生成 PNG の quiet zone /
 * バー間 pixel が RGBA=0,0,0,0 になり image-based barcode reader (Dynamsoft 等) が
 * transparent を「黒」と解釈して decode 失敗する事象も併発していた。
 */
describe('svgContentToPngBlob', () => {
  let m: MockHandles;

  beforeEach(() => {
    m = setupBrowserMocks({ output: 'toBlob' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('陽性対照: Canvas context の imageSmoothingEnabled が false に設定される', async () => {
    const svg = '<svg width="100" height="50" viewBox="0 0 100 50"></svg>';
    const promise = svgContentToPngBlob(svg);
    m.getImgInstance()?.onload?.();
    await promise;
    expect(m.capturedCtx.value).not.toBeNull();
    expect(m.capturedCtx.value!.imageSmoothingEnabled).toBe(false);
  });

  it('width/height が無い SVG は reject される (既存契約)', async () => {
    const svg = '<svg viewBox="0 0 100 50"></svg>';
    await expect(svgContentToPngBlob(svg)).rejects.toThrow('width/height');
  });

  it('陽性対照: fillStyle が white にセットされる', async () => {
    const svg = '<svg width="100" height="50" viewBox="0 0 100 50"></svg>';
    const promise = svgContentToPngBlob(svg);
    m.getImgInstance()?.onload?.();
    await promise;
    expect(m.getCapturedFillStyle()).toBe('white');
  });

  it('陽性対照: fillRect が canvas 全面 (device px, scale 前) で呼ばれる', async () => {
    const svg = '<svg width="100" height="50" viewBox="0 0 100 50"></svg>';
    const promise = svgContentToPngBlob(svg);
    m.getImgInstance()?.onload?.();
    await promise;
    const fillRectCalls = m.callLog.filter((c) => c.method === 'fillRect');
    expect(fillRectCalls).toHaveLength(1);
    // canvas は scale 前 device px 単位 (SVG width/height × RETINA_SCALE)
    expect(fillRectCalls[0].args).toEqual([0, 0, 100 * RETINA_SCALE, 50 * RETINA_SCALE]);
  });

  it('陽性対照: 呼び出し順序は fillRect → scale → drawImage (背景 → retina 変換 → bars)', async () => {
    const svg = '<svg width="100" height="50" viewBox="0 0 100 50"></svg>';
    const promise = svgContentToPngBlob(svg);
    m.getImgInstance()?.onload?.();
    await promise;
    // fillRect は scale より先 (scale 前 device px 単位での塗り潰しが必須)
    const fillRectIdx = m.callLog.findIndex((c) => c.method === 'fillRect');
    const scaleIdx = m.callLog.findIndex((c) => c.method === 'scale');
    const drawImageIdx = m.callLog.findIndex((c) => c.method === 'drawImage');
    expect(fillRectIdx).toBeGreaterThanOrEqual(0);
    expect(scaleIdx).toBeGreaterThan(fillRectIdx);
    expect(drawImageIdx).toBeGreaterThan(scaleIdx);
  });
});
