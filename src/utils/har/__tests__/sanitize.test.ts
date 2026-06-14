import { describe, it, expect } from 'vitest';
import { sanitizeHar } from '../sanitize';
import { HAR_REDACT_DEFAULT } from '../rules';
import type { Har } from '../types';

function makeHar(): Har {
  return {
    log: {
      version: '1.2',
      entries: [
        {
          request: {
            method: 'POST',
            url: 'https://example.com/api?token=SECRETTOKEN123&page=2',
            headers: [
              { name: 'Authorization', value: 'Bearer abc.def.ghi' },
              { name: 'Cookie', value: 'session=deadbeefcookie' },
              { name: 'Accept', value: 'application/json' },
            ],
            queryString: [
              { name: 'token', value: 'SECRETTOKEN123' },
              { name: 'page', value: '2' },
            ],
            cookies: [{ name: 'session', value: 'deadbeefcookie' }],
            postData: {
              // application/x-www-form-urlencoded 形式。
              // CREDENTIAL_ASSIGN ルール: `password=<6文字以上>` で確実に検出される。
              mimeType: 'application/x-www-form-urlencoded',
              text: 'password=myP@ssw0rd&username=alice',
              params: [{ name: 'password', value: 'myP@ssw0rd' }],
            },
          },
          response: {
            status: 200,
            headers: [{ name: 'Set-Cookie', value: 'sid=anothersecret; HttpOnly' }],
            cookies: [{ name: 'sid', value: 'anothersecret' }],
            // OPENAI_KEY ルール: sk- + 32文字以上で検出される
            content: { mimeType: 'application/json', text: '{"apiKey":"sk-proj-abcdef1234567890abcdef1234567890ab"}' },
          },
        },
      ],
    },
  };
}

const ALL_ON = { ...HAR_REDACT_DEFAULT };
const ALL_OFF = { COOKIE: false, AUTH_HEADER: false, QUERY: false, BODY: false, BODY_SCAN: false };

describe('sanitizeHar', () => {
  it('陽性対照: Cookie 値が redact される', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    const e = har.log.entries[0];
    expect(e.request.cookies[0].value).not.toBe('deadbeefcookie');
    expect(e.request.cookies[0].value).toMatch(/REDACTED/);
    const cookieHeader = e.request.headers.find((h) => h.name === 'Cookie');
    expect(cookieHeader?.value).not.toContain('deadbeefcookie');
    const setCookie = e.response.headers.find((h) => h.name === 'Set-Cookie');
    expect(setCookie?.value).not.toContain('anothersecret');
  });

  it('陽性対照: 認証ヘッダ値が redact される', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    const auth = har.log.entries[0].request.headers.find((h) => h.name === 'Authorization');
    expect(auth?.value).not.toContain('abc.def.ghi');
  });

  it('陽性対照: 機密クエリ値が redact され URL からも消える', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    const e = har.log.entries[0];
    const tokenQ = e.request.queryString.find((q) => q.name === 'token');
    expect(tokenQ?.value).not.toBe('SECRETTOKEN123');
    expect(e.request.url).not.toContain('SECRETTOKEN123');
    // 非機密クエリは保持
    expect(e.request.url).toContain('page=2');
    expect(e.request.queryString.find((q) => q.name === 'page')?.value).toBe('2');
  });

  it('陽性対照: POST ボディの機密 param と本文が redact される', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    const pd = har.log.entries[0].request.postData!;
    expect(pd.params![0].value).not.toBe('myP@ssw0rd');
    expect(pd.text).not.toContain('myP@ssw0rd');
  });

  it('陽性対照: BODY_SCAN でレスポンスボディの API キーが redact される', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    expect(har.log.entries[0].response.content.text).not.toContain(
      'sk-proj-abcdef1234567890abcdef1234567890ab'
    );
  });

  it('陰性対照: 全カテゴリ OFF なら何も変わらない', () => {
    const original = makeHar();
    const { har, counts } = sanitizeHar(original, ALL_OFF);
    const e = har.log.entries[0];
    expect(e.request.cookies[0].value).toBe('deadbeefcookie');
    expect(e.request.headers.find((h) => h.name === 'Authorization')?.value).toBe(
      'Bearer abc.def.ghi'
    );
    expect(e.request.url).toContain('SECRETTOKEN123');
    expect(e.request.postData!.params![0].value).toBe('myP@ssw0rd');
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('入力非破壊: 元オブジェクトを mutate しない', () => {
    const original = makeHar();
    sanitizeHar(original, ALL_ON);
    expect(original.log.entries[0].request.cookies[0].value).toBe('deadbeefcookie');
    expect(original.log.entries[0].request.url).toContain('SECRETTOKEN123');
  });

  it('一貫トークン化: 同一 Cookie 値は同一プレースホルダ', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    const e = har.log.entries[0];
    const cookieVal = e.request.cookies[0].value;
    const headerVal = e.request.headers.find((h) => h.name === 'Cookie')!.value;
    // Cookie ヘッダ "session=<redacted>" に同じプレースホルダが含まれる
    expect(headerVal).toContain(cookieVal);
  });

  it('出力が有効な JSON 構造を保つ', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    expect(() => JSON.stringify(har)).not.toThrow();
    expect(har.log.entries[0].response.status).toBe(200);
  });
});
