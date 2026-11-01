// @vitest-environment jsdom
import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCharCount } from '../useCharCount';
import { count } from '../../utils/char-count';
import * as charCount from '../../utils/char-count';
import { EMPTY_COUNT_RESULT } from '../../utils/char-count/empty';
import type {
  CharCountWorkerRequest,
  CharCountWorkerResponse,
} from '../../workers/charCount.types';

class FakeWorker {
  static instances: FakeWorker[] = [];
  static failPost = false;
  onmessage: ((event: MessageEvent<CharCountWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn((_: CharCountWorkerRequest) => {
    if (FakeWorker.failPost) throw new Error('post failed');
  });
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  reply(response: CharCountWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<CharCountWorkerResponse>);
  }
}

function tick(ms = 100) {
  act(() => vi.advanceTimersByTime(ms));
}

function request(worker: FakeWorker): CharCountWorkerRequest {
  return worker.postMessage.mock.calls[0][0];
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWorker.instances = [];
  FakeWorker.failPost = false;
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useCharCount', () => {
  it('空の結果は count(空文字) と一致する', () => {
    expect(EMPTY_COUNT_RESULT).toEqual(count(''));
    expect(EMPTY_COUNT_RESULT.manuscript.readingMinutes).toBe(1);
  });

  it('入力直後に pending とし、100ms 後に最後の入力だけを送る', () => {
    const { result } = renderHook(() => useCharCount());
    act(() => result.current.setText('a'));
    expect(result.current.isPending).toBe(true);
    tick(50);
    act(() => result.current.setText('ab'));
    tick(99);
    expect(FakeWorker.instances).toHaveLength(0);
    tick(1);
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0];
    const req = request(worker);
    expect(req).toMatchObject({ type: 'count', text: 'ab' });
    const expected = count('ab');
    act(() => worker.reply({ type: 'result', requestId: req.requestId, result: expected }));
    expect(result.current.result).toEqual(expected);
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeFalsy();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('次の debounce 中の古い成功を無視し worker をすぐ停止する', () => {
    const { result } = renderHook(() => useCharCount());
    act(() => result.current.setText('A'));
    tick();
    const old = FakeWorker.instances[0];
    const req = request(old);
    const oldHandler = old.onmessage!;
    act(() => result.current.setText('B'));
    expect(old.terminate).toHaveBeenCalledOnce();
    act(() =>
      oldHandler({
        data: { type: 'result', requestId: req.requestId, result: count('A') },
      } as MessageEvent<CharCountWorkerResponse>)
    );
    expect(result.current.isPending).toBe(true);
    expect(result.current.result).not.toEqual(count('A'));
    tick();
    const current = FakeWorker.instances[1];
    act(() =>
      current.reply({ type: 'result', requestId: request(current).requestId, result: count('B') })
    );
    expect(result.current.result).toEqual(count('B'));
  });

  it('A→B→A でも初回 A と古いエラーは最新結果を上書きしない', () => {
    const { result } = renderHook(() => useCharCount());
    act(() => result.current.setText('A'));
    tick();
    const first = FakeWorker.instances[0];
    const firstReq = request(first);
    const stale = first.onmessage!;
    act(() => result.current.setText('B'));
    tick();
    const second = FakeWorker.instances[1];
    const secondReq = request(second);
    const staleError = second.onmessage!;
    act(() => result.current.setText('A'));
    tick();
    const latest = FakeWorker.instances[2];
    const expected = count('A');
    act(() =>
      latest.reply({ type: 'result', requestId: request(latest).requestId, result: expected })
    );
    act(() => {
      stale({
        data: { type: 'result', requestId: firstReq.requestId, result: count('wrong') },
      } as MessageEvent<CharCountWorkerResponse>);
      staleError({
        data: { type: 'error', requestId: secondReq.requestId, message: '古いエラー' },
      } as MessageEvent<CharCountWorkerResponse>);
    });
    expect(result.current.result).toEqual(expected);
    expect(result.current.error).toBeFalsy();
    expect(result.current.isPending).toBe(false);
  });

  it('Clear は timer と worker を停止して即座に初期状態へ戻す', () => {
    const { result } = renderHook(() => useCharCount());
    act(() => result.current.setText('A'));
    tick();
    const worker = FakeWorker.instances[0];
    const handler = worker.onmessage!;
    const req = request(worker);
    act(() => result.current.reset());
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(result.current.text).toBe('');
    expect(result.current.result).toEqual(EMPTY_COUNT_RESULT);
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeFalsy();
    act(() =>
      handler({
        data: { type: 'result', requestId: req.requestId, result: count('A') },
      } as MessageEvent<CharCountWorkerResponse>)
    );
    expect(result.current.result).toEqual(EMPTY_COUNT_RESULT);
    act(() => result.current.setText('B'));
    act(() => result.current.reset());
    tick();
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('100万文字超の集計中にメインスレッドで count を呼ばない', () => {
    const countSpy = vi.spyOn(charCount, 'count');
    const { result } = renderHook(() => useCharCount());
    const large = 'a'.repeat(1_000_001);
    act(() => result.current.setText(large));
    tick();
    expect(result.current.isPending).toBe(true);
    expect(request(FakeWorker.instances[0]).text).toBe(large);
    expect(countSpy).not.toHaveBeenCalled();
  });

  it('StrictMode の unmount で停止し、保留 timer は起動しない', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result, unmount } = renderHook(() => useCharCount(), { wrapper });
    act(() => result.current.setText('A'));
    tick();
    const worker = FakeWorker.instances[0];
    unmount();
    expect(worker.terminate).toHaveBeenCalledOnce();
    const next = renderHook(() => useCharCount(), { wrapper });
    act(() => next.result.current.setText('B'));
    next.unmount();
    tick();
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it.each(['unsupported', 'constructor', 'post', 'load', 'messageerror', 'response'] as const)(
    '%s 失敗は pending を終了し、次の入力で再試行できる',
    (mode) => {
      if (mode === 'unsupported') vi.stubGlobal('Worker', undefined);
      if (mode === 'constructor')
        vi.stubGlobal(
          'Worker',
          class {
            constructor() {
              throw new Error('failed');
            }
          }
        );
      if (mode === 'post') FakeWorker.failPost = true;
      const { result } = renderHook(() => useCharCount());
      act(() => result.current.setText('A'));
      tick();
      const worker = FakeWorker.instances[0];
      if (mode === 'load') act(() => worker.onerror?.(new ErrorEvent('error')));
      if (mode === 'messageerror')
        act(() => worker.onmessageerror?.(new MessageEvent('messageerror')));
      if (mode === 'response')
        act(() =>
          worker.reply({ type: 'error', requestId: request(worker).requestId, message: '失敗' })
        );
      expect(result.current.isPending).toBe(false);
      expect(result.current.error).toBeTruthy();
      if (worker) expect(worker.terminate).toHaveBeenCalledOnce();
      vi.stubGlobal('Worker', FakeWorker);
      FakeWorker.failPost = false;
      act(() => result.current.setText('B'));
      expect(result.current.isPending).toBe(true);
      tick();
      const next = FakeWorker.instances.at(-1)!;
      act(() =>
        next.reply({ type: 'result', requestId: request(next).requestId, result: count('B') })
      );
      expect(result.current.error).toBeFalsy();
      expect(result.current.result).toEqual(count('B'));
    }
  );
});
