import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HarWorkerRequest, HarWorkerResponse } from '../harSanitizer.types';
import { HAR_REDACT_DEFAULT } from '../../utils/har/rules';

type Scope = {
  postMessage: ReturnType<typeof vi.fn<(message: HarWorkerResponse) => void>>;
  onmessage: ((event: MessageEvent<HarWorkerRequest>) => void) | null;
};
let scope: Scope;
let scrub: typeof import('../../utils/secret-scrubber/scrub');
const enabled = {
  ...HAR_REDACT_DEFAULT,
  COOKIE: false,
  AUTH_HEADER: false,
  QUERY: false,
  BODY: false,
  HEADER_SCAN: false,
  PATH_SCAN: false,
};
const text = (value: string) =>
  JSON.stringify({
    log: {
      version: '1.2',
      entries: [{ request: {}, response: { content: { mimeType: 'text/plain', text: value } } }],
    },
  });
const send = (data: HarWorkerRequest) =>
  scope.onmessage!({ data } as MessageEvent<HarWorkerRequest>);

beforeEach(async () => {
  vi.resetModules();
  scope = { postMessage: vi.fn(), onmessage: null };
  vi.stubGlobal('self', scope);
  scrub = await import('../../utils/secret-scrubber/scrub');
  await import('../harSanitizer.worker');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HAR Worker の本文 cache 境界', () => {
  it('切替は再走査せず BODY_SCAN OFF、例外、load、invalid load、reset 後は破棄する', () => {
    const spy = vi.spyOn(scrub, 'scrubText');
    const load = (requestId: number, value = 'password=abc12345') =>
      send({ type: 'load', requestId, text: text(value), enabled });
    const sanitize = (requestId: number, settings = enabled) =>
      send({ type: 'sanitize', requestId, enabled: settings });
    load(1);
    expect(spy).toHaveBeenCalledTimes(1);
    sanitize(2);
    expect(spy).toHaveBeenCalledTimes(1);
    sanitize(3, { ...enabled, BODY_SCAN: false });
    sanitize(4);
    expect(spy).toHaveBeenCalledTimes(2);
    sanitize(5, null as unknown as typeof enabled);
    expect(scope.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'error', requestId: 5 })
    );
    sanitize(6);
    expect(spy).toHaveBeenCalledTimes(3);
    load(7, 'password=xyz12345');
    expect(spy).toHaveBeenCalledTimes(4);
    send({ type: 'load', requestId: 8, text: 'invalid', enabled });
    expect(scope.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'error', requestId: 8 })
    );
    sanitize(9);
    expect(scope.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'error', requestId: 9 })
    );
    load(10);
    expect(spy).toHaveBeenCalledTimes(5);
    send({ type: 'reset' });
    sanitize(11);
    expect(scope.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'error', requestId: 11 })
    );
    load(12);
    expect(spy).toHaveBeenCalledTimes(6);
    send({ type: 'reset' });
  });
});
