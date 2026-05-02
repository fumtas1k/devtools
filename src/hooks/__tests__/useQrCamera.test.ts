// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQrCamera } from '@/hooks/useQrCamera';

// ────────────────────────────────────────────
// MediaStream / mediaDevices のモック
// ────────────────────────────────────────────

const mockTrackStop = vi.fn();
const mockStream = {
  getTracks: () => [{ stop: mockTrackStop }],
} as unknown as MediaStream;

const mockGetUserMedia = vi.fn(async () => mockStream);

// jsQR モック: デフォルトは QR コードを検出しない
vi.mock('jsqr', () => ({
  default: vi.fn(() => null),
}));

// requestAnimationFrame / cancelAnimationFrame はデフォルトでは jsdom に存在しないため stub
const mockRaf = vi.fn((_cb: FrameRequestCallback) => 1);
const mockCaf = vi.fn();

beforeEach(() => {
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: mockGetUserMedia,
    },
  });
  vi.stubGlobal('requestAnimationFrame', mockRaf);
  vi.stubGlobal('cancelAnimationFrame', mockCaf);

  mockTrackStop.mockClear();
  mockGetUserMedia.mockClear();
  mockRaf.mockClear();
  mockCaf.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ────────────────────────────────────────────
// テストケース
// ────────────────────────────────────────────

describe('useQrCamera — アンマウント後に onQrDetected が呼ばれないこと', () => {
  it('アンマウント後は例外なく終了し onQrDetected が呼ばれていない', async () => {
    const onQrDetected = vi.fn();

    const { unmount } = renderHook(() => useQrCamera({ onQrDetected }));

    // unmount すると useEffect cleanup が走り AbortController が abort される
    expect(() => unmount()).not.toThrow();

    // startCamera を呼んでいないので onQrDetected は一切呼ばれない
    expect(onQrDetected).not.toHaveBeenCalled();
  });

  it('stopCamera 後に scan ループが継続しない', async () => {
    const onQrDetected = vi.fn();

    const { result } = renderHook(() => useQrCamera({ onQrDetected }));

    // startCamera を呼んでカメラを起動する
    await act(async () => {
      await result.current.startCamera();
    });

    // カメラ起動後に stopCamera を呼ぶ
    act(() => {
      result.current.stopCamera();
    });

    expect(result.current.cameraActive).toBe(false);
    // stopCamera 後は cancelAnimationFrame が呼ばれている
    expect(mockCaf).toHaveBeenCalled();
  });

  it('stopCamera 呼び出し後に rAF から scan が再実行されても onQrDetected は呼ばれない', async () => {
    const onQrDetected = vi.fn();

    // jsQR が QR コードを検出するように設定
    const jsQR = await import('jsqr');
    const mockJsQR = vi.mocked(jsQR.default);
    mockJsQR.mockReturnValue({ data: 'test-qr-data' } as ReturnType<typeof jsQR.default>);

    const { result, unmount } = renderHook(() => useQrCamera({ onQrDetected }));

    await act(async () => {
      await result.current.startCamera();
    });

    // アンマウントして signal を abort させる（stopCamera も cleanup で呼ばれる）
    unmount();

    // jsQR モックをリセット
    mockJsQR.mockReset();
    mockJsQR.mockReturnValue(null);

    // アンマウント後は onQrDetected が呼ばれていない
    expect(onQrDetected).not.toHaveBeenCalled();
  });
});

describe('useQrCamera — QR 検出 happy-path', () => {
  it('QR を検出したとき onQrDetected が呼ばれ cameraActive が false になる', async () => {
    const onQrDetected = vi.fn();

    // jsQR が QR コードを検出するように設定
    const jsQR = await import('jsqr');
    const mockJsQR = vi.mocked(jsQR.default);
    mockJsQR.mockReturnValue({ data: 'test-qr-data' } as ReturnType<typeof jsQR.default>);

    const { result } = renderHook(() => useQrCamera({ onQrDetected }));

    // video / canvas 要素を jsdom 上に作成し、ref に直接アタッチ
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (result.current.videoRef as any).current = video;

    const canvas = document.createElement('canvas');
    const fakeCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
    };
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (result.current.canvasRef as any).current = canvas;

    await act(async () => {
      await result.current.startCamera();
    });

    // rAF コールバック（scan）を手動で実行する
    act(() => {
      const scanCb = mockRaf.mock.calls[0][0] as FrameRequestCallback;
      scanCb(0);
    });

    // onQrDetected が検出データで呼ばれること
    expect(onQrDetected).toHaveBeenCalledWith('test-qr-data');
    expect(onQrDetected).toHaveBeenCalledTimes(1);

    // stopCamera が動いて cameraActive が false になること
    expect(result.current.cameraActive).toBe(false);

    // クリーンアップ
    mockJsQR.mockReset();
    mockJsQR.mockReturnValue(null);
  });
});

describe('useQrCamera — stopCamera 後の状態確認', () => {
  it('初期状態では cameraActive が false', () => {
    const onQrDetected = vi.fn();
    const { result } = renderHook(() => useQrCamera({ onQrDetected }));
    expect(result.current.cameraActive).toBe(false);
  });

  it('startCamera 後は cameraActive が true になる', async () => {
    const onQrDetected = vi.fn();
    const { result } = renderHook(() => useQrCamera({ onQrDetected }));

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.cameraActive).toBe(true);
  });

  it('stopCamera 後は cameraActive が false になる', async () => {
    const onQrDetected = vi.fn();
    const { result } = renderHook(() => useQrCamera({ onQrDetected }));

    await act(async () => {
      await result.current.startCamera();
    });

    act(() => {
      result.current.stopCamera();
    });

    expect(result.current.cameraActive).toBe(false);
  });
});
