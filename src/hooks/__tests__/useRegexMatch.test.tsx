// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useRegexMatch } from '../useRegexMatch';
import type { RegexMatchWorkerRequest, RegexMatchWorkerResponse } from '@/workers/regexMatch.types';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<RegexMatchWorkerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn<(request: RegexMatchWorkerRequest) => void>();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  respond(data: RegexMatchWorkerResponse) {
    this.onmessage?.({ data } as MessageEvent<RegexMatchWorkerResponse>);
  }
}
const result = { matches: [{ value: 'a', start: 0, end: 1, groups: [] }], truncated: false };
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const props = {
  pattern: 'a',
  flags: 'g',
  text: 'aa',
  verdict: 'safe' as string | undefined,
  enabled: true,
  maxLength: undefined as number | undefined,
};
const setup = () =>
  renderHook((p) => useRegexMatch(p.pattern, p.flags, p.text, p.verdict, p.enabled, p.maxLength), {
    initialProps: props,
  });
const worker = () => FakeWorker.instances.at(-1)!;
beforeEach(() => {
  vi.useFakeTimers();
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useRegexMatch', () => {
  it('300ms 後に開始し結果受信で Worker と期限を終了する', () => {
    const { result: state } = setup();
    advance(299);
    expect(FakeWorker.instances).toHaveLength(0);
    advance(1);
    const w = worker();
    expect(w.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: 'a', flags: 'g', text: 'aa' })
    );
    const id = w.postMessage.mock.calls[0][0].requestId;
    act(() => w.respond({ type: 'result', requestId: id, result }));
    expect(state.current.result).toEqual(result);
    expect(w.terminate).toHaveBeenCalledOnce();
    advance(1000);
    expect(state.current.error).toBeNull();
  });
  it('1000ms の期限で終了し、自動再開せず再試行できる', () => {
    const { result: state } = setup();
    advance(300);
    const first = worker();
    advance(999);
    expect(first.terminate).not.toHaveBeenCalled();
    advance(1);
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(state.current.error).toMatch(/制限時間/);
    advance(3000);
    expect(FakeWorker.instances).toHaveLength(1);
    act(() => state.current.retry());
    advance(300);
    expect(FakeWorker.instances).toHaveLength(2);
  });
  it('中断で終了し、自動再開せず再試行できる', () => {
    const { result: state } = setup();
    advance(300);
    const first = worker();
    act(() => state.current.cancel());
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(state.current.error).toMatch(/中断/);
    advance(2000);
    expect(FakeWorker.instances).toHaveLength(1);
    act(() => state.current.retry());
    advance(300);
    expect(FakeWorker.instances).toHaveLength(2);
  });
  it.each([
    ['pattern', { pattern: 'b' }],
    ['flags', { flags: 'i' }],
    ['text', { text: 'bb' }],
    ['verdict', { verdict: 'unknown' }],
    ['validity', { enabled: false }],
    ['limit', { maxLength: 1000 }],
  ])('%s の変更で古い結果を隠し Worker を終了する', (_name, change) => {
    const { result: state, rerender } = setup();
    advance(300);
    const first = worker();
    const stale = first.onmessage!;
    const id = first.postMessage.mock.calls[0][0].requestId;
    rerender({ ...props, ...change });
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(state.current.result).toBeNull();
    act(() =>
      stale({
        data: { type: 'result', requestId: id, result },
      } as unknown as MessageEvent<RegexMatchWorkerResponse>)
    );
    expect(state.current.result).toBeNull();
  });
  it('完成した結果も入力変更の render で隠す', () => {
    const { result: state, rerender } = setup();
    advance(300);
    const w = worker();
    act(() =>
      w.respond({ type: 'result', requestId: w.postMessage.mock.calls[0][0].requestId, result })
    );
    expect(state.current.result).toEqual(result);
    rerender({ ...props, text: 'changed' });
    expect(state.current.result).toBeNull();
  });
  it('debounce 中の中断は Worker を起動せず、再試行できる', () => {
    const { result: state } = setup();
    act(() => state.current.cancel());
    advance(2000);
    expect(FakeWorker.instances).toHaveLength(0);
    act(() => state.current.retry());
    advance(300);
    expect(FakeWorker.instances).toHaveLength(1);
  });
  it('requestId が違う応答を無視し unmount 時に終了する', () => {
    const { result: state, unmount } = setup();
    advance(300);
    const w = worker();
    act(() => w.respond({ type: 'result', requestId: 999, result }));
    expect(state.current.result).toBeNull();
    unmount();
    expect(w.terminate).toHaveBeenCalledOnce();
  });
  it.each(['onerror', 'onmessageerror'] as const)('%s は失敗として終了する', (event) => {
    const { result: state } = setup();
    advance(300);
    const w = worker();
    act(() => w[event]?.());
    expect(w.terminate).toHaveBeenCalledOnce();
    expect(state.current.error).toMatch(/実行できません/);
  });
  it('Worker の error 応答を失敗として終了する', () => {
    const { result: state } = setup();
    advance(300);
    const w = worker();
    act(() => w.respond({ type: 'error', requestId: w.postMessage.mock.calls[0][0].requestId }));
    expect(w.terminate).toHaveBeenCalledOnce();
    expect(state.current.error).toMatch(/実行できません/);
  });
  it('Worker 構築失敗時は同期実行せず失敗を表示する', () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('unavailable');
        }
      }
    );
    const { result: state } = setup();
    advance(300);
    expect(state.current.error).toMatch(/実行できません/);
  });
  it('postMessage 失敗時に Worker を終了する', () => {
    const { result: state } = setup();
    // インスタンス生成直後の送信に失敗する Worker を使う。
    class SendFailure extends FakeWorker {
      postMessage = vi.fn<(request: RegexMatchWorkerRequest) => void>(() => {
        throw new Error('send');
      });
    }
    vi.stubGlobal('Worker', SendFailure);
    advance(300);
    expect(worker().terminate).toHaveBeenCalledOnce();
    expect(state.current.error).toMatch(/実行できません/);
  });
});
