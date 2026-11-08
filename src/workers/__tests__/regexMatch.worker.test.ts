import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RegexMatchWorkerRequest, RegexMatchWorkerResponse } from '../regexMatch.types';

type Scope = {
  postMessage: ReturnType<typeof vi.fn<(message: RegexMatchWorkerResponse) => void>>;
  onmessage: ((event: MessageEvent<RegexMatchWorkerRequest>) => void) | null;
};
let scope: Scope;
beforeEach(async () => {
  vi.resetModules();
  scope = { postMessage: vi.fn(), onmessage: null };
  vi.stubGlobal('self', scope);
  await import('../regexMatch.worker');
});
afterEach(() => vi.unstubAllGlobals());
it('flags と名前付きキャプチャを保って全件返す', () => {
  scope.onmessage!({
    data: { requestId: 1, pattern: '(?<letter>a)', flags: 'gi', text: 'Aa' },
  } as MessageEvent<RegexMatchWorkerRequest>);
  expect(scope.postMessage).toHaveBeenCalledWith({
    type: 'result',
    requestId: 1,
    result: {
      truncated: false,
      matches: [
        { value: 'A', start: 0, end: 1, groups: [{ index: 1, name: 'letter', value: 'A' }] },
        { value: 'a', start: 1, end: 2, groups: [{ index: 1, name: 'letter', value: 'a' }] },
      ],
    },
  });
});
it('Unicode 空マッチと入力上限を保つ', () => {
  scope.onmessage!({
    data: { requestId: 2, pattern: '(?:)', flags: 'gu', text: '😀x', maxLength: 2 },
  } as MessageEvent<RegexMatchWorkerRequest>);
  expect(scope.postMessage).toHaveBeenCalledWith({
    type: 'result',
    requestId: 2,
    result: {
      truncated: true,
      matches: [
        { value: '', start: 0, end: 0, groups: [] },
        { value: '', start: 2, end: 2, groups: [] },
      ],
    },
  });
});
it('不正な正規表現は error を返す', () => {
  scope.onmessage!({
    data: { requestId: 3, pattern: '(', flags: '', text: 'a' },
  } as MessageEvent<RegexMatchWorkerRequest>);
  expect(scope.postMessage).toHaveBeenCalledWith({ type: 'error', requestId: 3 });
});
