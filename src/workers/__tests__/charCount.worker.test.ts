import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { count } from '../../utils/char-count';
import fixtures from './charCount.fixtures.json';
import type { CharCountWorkerRequest, CharCountWorkerResponse } from '../charCount.types';

type Scope = {
  postMessage: ReturnType<typeof vi.fn<(message: CharCountWorkerResponse) => void>>;
  onmessage: ((event: MessageEvent<CharCountWorkerRequest>) => void) | null;
};
let scope: Scope;

beforeEach(async () => {
  vi.resetModules();
  scope = { postMessage: vi.fn(), onmessage: null };
  vi.stubGlobal('self', scope);
  await import('../charCount.worker');
});
afterEach(() => vi.unstubAllGlobals());

describe('charCount worker', () => {
  it('ブラウザ検証用の期待値は既存 count と一致する', () => {
    for (const { text, result } of fixtures) expect(count(text)).toEqual(result);
  });
  it.each(['ASCII', '日本語', '𠮷', '👩‍👩‍👧‍👦', 'a\r\nb\nc', 'URL https://example.com/x?q=1'])(
    '既存 count の全結果を返す: %s',
    (text) => {
      scope.onmessage!({
        data: { type: 'count', requestId: 42, text },
      } as MessageEvent<CharCountWorkerRequest>);
      expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({
        type: 'result',
        requestId: 42,
        result: count(text),
      });
    }
  );

  it('例外を同じ requestId の error に変換する', () => {
    scope.onmessage!({
      data: { type: 'count', requestId: 123, text: null },
    } as unknown as MessageEvent<CharCountWorkerRequest>);
    expect(scope.postMessage).toHaveBeenCalledOnce();
    expect(scope.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', requestId: 123, message: expect.any(String) })
    );
  });
});
