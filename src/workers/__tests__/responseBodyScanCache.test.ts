import { afterEach, describe, expect, it, vi } from 'vitest';
import { mayCacheResponseBodies, WorkerResponseBodyScanCache } from '../responseBodyScanCache';
import { sanitizeHar } from '../../utils/har/sanitize';
import { HAR_REDACT_CATEGORIES } from '../../utils/har/rules';
import type { Har } from '../../utils/har/types';
import * as scrub from '../../utils/secret-scrubber/scrub';

const source = {
  log: {
    version: '1.2',
    entries: [
      {
        request: {
          url: 'https://example.test/?token=abc12345',
          headers: [{ name: 'Authorization', value: 'Bearer first' }],
          cookies: [{ name: 'a', value: 'shared' }],
        },
        response: {
          headers: [{ name: 'Set-Cookie', value: 'a=shared' }],
          content: {
            mimeType: 'text/plain',
            text: 'password=abc12345 [REDACTED:CREDENTIAL_1] password=def67890',
          },
        },
      },
      {
        request: {
          url: 'https://example.test/',
          headers: [{ name: 'Authorization', value: 'Bearer second' }],
          cookies: [{ name: 'b', value: 'different' }],
        },
        response: { content: { mimeType: 'text/plain', text: 'password=xyz12345' } },
      },
      {
        response: {
          content: { mimeType: 'text/plain', encoding: 'base64', text: 'password=abc12345' },
        },
      },
      { response: { content: { mimeType: 'image/png', text: 'password=abc12345' } } },
      { response: { content: null } },
      null,
    ],
  },
} as unknown as Har;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const many = (count: number, text: string) =>
  ({
    log: {
      entries: Array.from({ length: count }, () => ({ response: { content: { text } } })),
    },
  }) as unknown as Har;

describe('レスポンス本文の限定再利用', () => {
  it('陰性対照: 原文が予算と件数の境界内なら保存を試みる', () => {
    expect(mayCacheResponseBodies(many(4096, ''))).toBe(true);
    expect(mayCacheResponseBodies(many(1, 'x'.repeat((16 * 1024 * 1024 - 64) / 2)))).toBe(true);
  });
  it('陽性対照: 原文が予算または件数を超えると保存を試みない', () => {
    expect(mayCacheResponseBodies(many(4097, ''))).toBe(false);
    expect(mayCacheResponseBodies(many(1, 'x'.repeat((16 * 1024 * 1024 - 64) / 2 + 1)))).toBe(
      false
    );
  });
  it('全128設定で HAR 全体と全件数を一致させ、構造的トークンの順序も保つ', () => {
    const cache = new WorkerResponseBodyScanCache();
    for (let mask = 0; mask < 128; mask++) {
      const enabled = Object.fromEntries(
        HAR_REDACT_CATEGORIES.map((c, i) => [c, !!(mask & (1 << i))])
      ) as Record<(typeof HAR_REDACT_CATEGORIES)[number], boolean>;
      const expected = sanitizeHar(source, enabled);
      expect(
        sanitizeHar(source, enabled, undefined, enabled.BODY_SCAN ? cache : undefined)
      ).toEqual(expected);
      expect(
        sanitizeHar(source, enabled, undefined, enabled.BODY_SCAN ? cache : undefined)
      ).toEqual(expected);
    }
    cache.clear();
  });

  it('本文の再走査は初回のみ。同じ長さの別入力では必ず走査する', () => {
    const spy = vi.spyOn(scrub, 'scrubText');
    const cache = new WorkerResponseBodyScanCache();
    const enabled = Object.fromEntries(
      HAR_REDACT_CATEGORIES.map((c) => [c, c === 'BODY_SCAN'])
    ) as Record<(typeof HAR_REDACT_CATEGORIES)[number], boolean>;
    sanitizeHar(source, enabled);
    sanitizeHar(source, enabled);
    expect(spy).toHaveBeenCalledTimes(4);
    spy.mockClear();
    sanitizeHar(source, enabled, undefined, cache);
    expect(spy).toHaveBeenCalledTimes(2);
    sanitizeHar(source, enabled, undefined, cache);
    expect(spy).toHaveBeenCalledTimes(2);
    const other = structuredClone(source);
    other.log.entries[1]!.response.content.text = 'password=uvw12345';
    const output = sanitizeHar(other, enabled, undefined, cache);
    expect(spy).toHaveBeenCalledTimes(4);
    expect(output).toEqual(sanitizeHar(other, enabled));
    cache.clear();
  });

  it('文字列と固定 metadata 予算の境界・超過を守り、超過後は世代全体を無効化', () => {
    const cache = new WorkerResponseBodyScanCache(132);
    const identity = {};
    cache.bind(identity);
    cache.set(0, 'ab', 1); // 68 bytes
    cache.set(1, '', 0); // 64 bytes
    expect(cache.get(0)).toEqual({ text: 'ab', count: 1 });
    expect(cache.get(1)).toEqual({ text: '', count: 0 });
    cache.set(2, '', 0);
    expect(cache.get(0)).toBeUndefined();
    cache.set(0, '', 0);
    expect(cache.get(0)).toBeUndefined();
    cache.clear();
    cache.bind(identity);
    cache.set(0, 'abc', 0);
    expect(cache.get(0)).toEqual({ text: 'abc', count: 0 });
    cache.clear();
  });

  it('空文字でも4096件を超えると全破棄する', () => {
    const cache = new WorkerResponseBodyScanCache();
    cache.bind({});
    for (let i = 0; i < 4096; i++) cache.set(i, '', 0);
    expect(cache.get(4095)).toEqual({ text: '', count: 0 });
    cache.set(4096, '', 0);
    expect(cache.get(0)).toBeUndefined();
    cache.clear();
  });

  it('予算超過では次回も本文を走査し、出力と件数は通常処理と一致する', () => {
    const spy = vi.spyOn(scrub, 'scrubText');
    const cache = new WorkerResponseBodyScanCache(65);
    const enabled = Object.fromEntries(
      HAR_REDACT_CATEGORIES.map((c) => [c, c === 'BODY_SCAN'])
    ) as Record<(typeof HAR_REDACT_CATEGORIES)[number], boolean>;
    const first = sanitizeHar(source, enabled, undefined, cache);
    const second = sanitizeHar(source, enabled, undefined, cache);
    expect(spy).toHaveBeenCalledTimes(4);
    expect(second).toEqual(first);
    expect(second).toEqual(sanitizeHar(source, enabled));
    cache.clear();
  });

  it('固定期限は利用で延長せず、timer でも lookup 時にも参照を破棄する', () => {
    vi.useFakeTimers();
    const cache = new WorkerResponseBodyScanCache(1000, 100);
    cache.bind({});
    cache.set(0, 'abc', 1);
    vi.advanceTimersByTime(90);
    expect(cache.get(0)).toBeDefined();
    vi.advanceTimersByTime(10);
    expect(cache.get(0)).toBeUndefined();
    cache.set(0, 'abc', 1);
    vi.spyOn(performance, 'now').mockReturnValue(10000);
    expect(cache.get(0)).toBeUndefined();
    cache.clear();
  });

  it('陽性対照: lookup がなくても timer が期限に破棄する', () => {
    vi.useFakeTimers();
    const cache = new WorkerResponseBodyScanCache(1000, 100);
    cache.bind({});
    const clear = vi.spyOn(cache, 'clear');
    cache.set(0, 'abc', 1);
    vi.advanceTimersByTime(99);
    expect(clear).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(clear).toHaveBeenCalledOnce();
  });
});
