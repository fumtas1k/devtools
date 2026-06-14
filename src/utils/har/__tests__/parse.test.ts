import { describe, it, expect } from 'vitest';
import { parseHar } from '../parse';

const VALID_HAR = JSON.stringify({
  log: {
    version: '1.2',
    entries: [
      {
        time: 12.3,
        request: {
          method: 'GET',
          url: 'https://example.com/',
          headers: [],
          queryString: [],
          cookies: [],
        },
        response: { status: 200, headers: [], cookies: [], content: { size: 0 } },
      },
    ],
  },
});

describe('parseHar', () => {
  it('正常な HAR をパースして entries を返す', () => {
    const result = parseHar(VALID_HAR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.har.log.entries).toHaveLength(1);
      expect(result.har.log.entries[0].request.method).toBe('GET');
    }
  });

  it('不正な JSON はエラーを返す', () => {
    const result = parseHar('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/JSON/);
  });

  it('log が無い場合はスキーマエラーを返す', () => {
    const result = parseHar(JSON.stringify({ foo: 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/HAR/);
  });

  it('log.entries が配列でない場合はスキーマエラーを返す', () => {
    const result = parseHar(JSON.stringify({ log: { entries: 'x' } }));
    expect(result.ok).toBe(false);
  });

  it('空 entries は ok（0 件）として扱う', () => {
    const result = parseHar(JSON.stringify({ log: { entries: [] } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.har.log.entries).toHaveLength(0);
  });
});
