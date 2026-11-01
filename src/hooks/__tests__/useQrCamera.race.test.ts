// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQrCamera } from '@/hooks/useQrCamera';

vi.mock('jsqr', () => ({ default: vi.fn(() => null) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function stream() {
  const stop = vi.fn();
  return { value: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
}

const getUserMedia = vi.fn<() => Promise<MediaStream>>();
const raf = vi.fn((_callback: FrameRequestCallback) => 1);

beforeEach(() => {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  getUserMedia.mockReset();
  raf.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe('useQrCamera の開始と停止の競合', () => {
  it('getUserMedia の完了前に停止すると、遅れて取得したトラックを停止する', async () => {
    const pending = deferred<MediaStream>();
    const late = stream();
    getUserMedia.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useQrCamera({ onQrDetected: vi.fn() }));
    let start!: Promise<void>;
    act(() => {
      start = result.current.startCamera();
      result.current.stopCamera();
    });
    await act(async () => {
      pending.resolve(late.value);
      await start;
    });
    expect(late.stop).toHaveBeenCalledOnce();
    expect(result.current.cameraActive).toBe(false);
    expect(raf).not.toHaveBeenCalled();
  });

  it('play 完了前に停止して再開しても、古い play の完了は新しいカメラを変更しない', async () => {
    const old = stream();
    const current = stream();
    const play = deferred<void>();
    getUserMedia.mockResolvedValueOnce(old.value).mockResolvedValueOnce(current.value);
    const { result } = renderHook(() => useQrCamera({ onQrDetected: vi.fn() }));
    const video = document.createElement('video');
    video.play = vi.fn().mockReturnValueOnce(play.promise).mockResolvedValueOnce(undefined);
    Object.assign(result.current.videoRef, { current: video });
    let first!: Promise<void>;
    await act(async () => {
      first = result.current.startCamera();
      await Promise.resolve();
    });
    act(() => result.current.stopCamera());
    await act(async () => {
      await result.current.startCamera();
    });
    await act(async () => {
      play.resolve();
      await first;
    });
    expect(old.stop).toHaveBeenCalledOnce();
    expect(current.stop).not.toHaveBeenCalled();
    expect(result.current.cameraActive).toBe(true);
    expect(raf).toHaveBeenCalledTimes(1);
    act(() => result.current.stopCamera());
    expect(current.stop).toHaveBeenCalledOnce();
  });

  it('停止後の古い getUserMedia の失敗は再開後の状態を汚さない', async () => {
    const pending = deferred<MediaStream>();
    const current = stream();
    getUserMedia.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(current.value);
    const { result } = renderHook(() => useQrCamera({ onQrDetected: vi.fn() }));
    let first!: Promise<void>;
    act(() => {
      first = result.current.startCamera();
      result.current.stopCamera();
    });
    await act(async () => {
      await result.current.startCamera();
    });
    await act(async () => {
      pending.reject(new DOMException('denied', 'NotAllowedError'));
      await first;
    });
    expect(result.current.cameraActive).toBe(true);
    expect(result.current.cameraError).toBe('');
    expect(current.stop).not.toHaveBeenCalled();
  });

  it('play の失敗は取得済みトラックを解放してエラーを表示する', async () => {
    const current = stream();
    getUserMedia.mockResolvedValueOnce(current.value);
    const { result } = renderHook(() => useQrCamera({ onQrDetected: vi.fn() }));
    const video = document.createElement('video');
    video.play = vi.fn().mockRejectedValueOnce(new Error('play failed'));
    Object.assign(result.current.videoRef, { current: video });
    await act(async () => {
      await result.current.startCamera();
    });
    expect(current.stop).toHaveBeenCalledOnce();
    expect(result.current.cameraError).toContain('カメラの起動に失敗');
    expect(result.current.cameraActive).toBe(false);
  });

  it('play 待機中にアンマウントすると取得済みトラックを停止する', async () => {
    const current = stream();
    const play = deferred<void>();
    getUserMedia.mockResolvedValueOnce(current.value);
    const { result, unmount } = renderHook(() => useQrCamera({ onQrDetected: vi.fn() }));
    const video = document.createElement('video');
    video.play = vi.fn().mockReturnValueOnce(play.promise);
    Object.assign(result.current.videoRef, { current: video });
    let start!: Promise<void>;
    await act(async () => {
      start = result.current.startCamera();
      await Promise.resolve();
    });
    unmount();
    expect(current.stop).toHaveBeenCalledOnce();
    await act(async () => {
      play.resolve();
      await start;
    });
    expect(current.stop).toHaveBeenCalledOnce();
    expect(raf).not.toHaveBeenCalled();
  });
});

it('古い scan コールバックは再開したカメラのループに混ざらない', async () => {
  getUserMedia.mockResolvedValueOnce(stream().value).mockResolvedValueOnce(stream().value);
  const { result } = renderHook(() => useQrCamera({ onQrDetected: vi.fn() }));
  const video = document.createElement('video');
  video.play = vi.fn().mockResolvedValue(undefined);
  Object.assign(result.current.videoRef, { current: video });
  Object.assign(result.current.canvasRef, { current: document.createElement('canvas') });
  await act(async () => {
    await result.current.startCamera();
  });
  const oldScan = raf.mock.calls[0][0];
  act(() => result.current.stopCamera());
  await act(async () => {
    await result.current.startCamera();
  });
  act(() => oldScan(0));
  expect(raf).toHaveBeenCalledTimes(2);
  expect(result.current.cameraActive).toBe(true);
});

it('古い play の失敗は再開したストリームやエラーを変更しない', async () => {
  const old = stream();
  const current = stream();
  const play = deferred<void>();
  getUserMedia.mockResolvedValueOnce(old.value).mockResolvedValueOnce(current.value);
  const { result } = renderHook(() => useQrCamera({ onQrDetected: vi.fn() }));
  const video = document.createElement('video');
  video.play = vi.fn().mockReturnValueOnce(play.promise).mockResolvedValueOnce(undefined);
  Object.assign(result.current.videoRef, { current: video });
  let first!: Promise<void>;
  await act(async () => {
    first = result.current.startCamera();
    await Promise.resolve();
  });
  act(() => result.current.stopCamera());
  await act(async () => {
    await result.current.startCamera();
  });
  await act(async () => {
    play.reject(new Error('old play'));
    await first;
  });
  expect(result.current.cameraError).toBe('');
  expect(result.current.cameraActive).toBe(true);
  expect(current.stop).not.toHaveBeenCalled();
  act(() => result.current.stopCamera());
  expect(current.stop).toHaveBeenCalledOnce();
});

it('古い getUserMedia の成功は再開後のストリームを上書きしない', async () => {
  const pending = deferred<MediaStream>();
  const old = stream();
  const current = stream();
  getUserMedia.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(current.value);
  const { result } = renderHook(() => useQrCamera({ onQrDetected: vi.fn() }));
  let first!: Promise<void>;
  act(() => {
    first = result.current.startCamera();
    result.current.stopCamera();
  });
  await act(async () => {
    await result.current.startCamera();
  });
  await act(async () => {
    pending.resolve(old.value);
    await first;
  });
  expect(old.stop).toHaveBeenCalledOnce();
  expect(current.stop).not.toHaveBeenCalled();
  expect(result.current.cameraActive).toBe(true);
  act(() => result.current.stopCamera());
  expect(current.stop).toHaveBeenCalledOnce();
});
