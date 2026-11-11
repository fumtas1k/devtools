// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHarSanitizer } from '../useHarSanitizer';
import { HAR_REDACT_DEFAULT } from '@/utils/har';
import type { HarWorkerRequest, HarWorkerResponse } from '@/workers/harSanitizer.types';

class FakeWorker {
  static instances: FakeWorker[] = [];
  static failPost = false;
  onmessage: ((event: MessageEvent<HarWorkerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((_request: HarWorkerRequest) => {
    if (FakeWorker.failPost) throw new Error('private');
  });
  constructor() {
    FakeWorker.instances.push(this);
  }
  reply(data: HarWorkerResponse) {
    this.onmessage?.({ data } as MessageEvent<HarWorkerResponse>);
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.failPost = false;
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

const result = (requestId: number): HarWorkerResponse => ({
  type: 'result',
  requestId,
  har: { log: { version: '1.2', entries: [] } } as never,
  counts: {} as never,
  entryCount: 0,
});

describe('useHarSanitizer', () => {
  it('段階を表示しキャンセルで Worker と結果を破棄、古い応答を無視し再読込できる', () => {
    const { result: state, unmount } = renderHook(() => useHarSanitizer());
    act(() => state.current.load('first', HAR_REDACT_DEFAULT));
    const first = FakeWorker.instances[0];
    act(() => first.reply({ type: 'progress', requestId: 1, phase: 'sanitize' }));
    expect(state.current.progress).toBe('sanitize');
    act(() => first.reply(result(1)));
    expect(state.current.result).not.toBeNull();
    act(() => state.current.resanitize(HAR_REDACT_DEFAULT));
    expect(state.current.busy).toBe(true);
    act(() => state.current.reset());
    expect(first.terminate).toHaveBeenCalledOnce();
    act(() => first.reply(result(2)));
    expect(state.current.result).toBeNull();
    expect(state.current.busy).toBe(false);
    act(() => state.current.load('second', HAR_REDACT_DEFAULT));
    const second = FakeWorker.instances[1];
    act(() => second.reply(result(4)));
    expect(state.current.result).not.toBeNull();
    unmount();
    expect(second.terminate).toHaveBeenCalledOnce();
  });

  it('連続 load と古い Worker の障害・応答は現在の処理を壊さない', () => {
    const { result: state } = renderHook(() => useHarSanitizer());
    act(() => state.current.load('first', HAR_REDACT_DEFAULT));
    const old = FakeWorker.instances[0];
    act(() => state.current.load('second', HAR_REDACT_DEFAULT));
    expect(old.terminate).toHaveBeenCalledOnce();
    act(() => {
      old.onerror?.();
      old.reply(result(1));
    });
    expect(state.current.busy).toBe(true);
    act(() => FakeWorker.instances[1].reply(result(2)));
    expect(state.current.result).not.toBeNull();
  });

  it.each(['post', 'fatal', 'message', 'response'] as const)(
    '%s エラーは以前の結果を破棄し再読込可能',
    (mode) => {
      const { result: state } = renderHook(() => useHarSanitizer());
      act(() => state.current.load('first', HAR_REDACT_DEFAULT));
      const worker = FakeWorker.instances[0];
      act(() => worker.reply(result(1)));
      if (mode === 'post') FakeWorker.failPost = true;
      act(() => state.current.resanitize(HAR_REDACT_DEFAULT));
      if (mode === 'fatal') act(() => worker.onerror?.());
      if (mode === 'message') act(() => worker.onmessageerror?.());
      if (mode === 'response')
        act(() => worker.reply({ type: 'error', requestId: 2, message: 'error' }));
      expect(state.current.busy).toBe(false);
      expect(state.current.result).toBeNull();
      expect(state.current.error).toBeTruthy();
      expect(worker.terminate).toHaveBeenCalledOnce();
      FakeWorker.failPost = false;
      act(() => state.current.load('again', HAR_REDACT_DEFAULT));
      expect(state.current.busy).toBe(true);
    }
  );
});
