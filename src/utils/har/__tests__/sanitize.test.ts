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
            content: {
              mimeType: 'application/json',
              text: '{"apiKey":"sk-proj-abcdef1234567890abcdef1234567890ab"}',
            },
          },
        },
      ],
    },
  };
}

const ALL_ON = { ...HAR_REDACT_DEFAULT };
const ALL_OFF = {
  COOKIE: false,
  AUTH_HEADER: false,
  QUERY: false,
  BODY: false,
  BODY_SCAN: false,
  HEADER_SCAN: false,
  PATH_SCAN: false,
};

describe('sanitizeHar', () => {
  it('陽性対照: Cookie 値が redact される', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    const e = har.log.entries[0]!;
    expect(e.request.cookies[0].value).not.toBe('deadbeefcookie');
    expect(e.request.cookies[0].value).toMatch(/REDACTED/);
    const cookieHeader = e.request.headers.find((h) => h.name === 'Cookie');
    expect(cookieHeader?.value).not.toContain('deadbeefcookie');
    const setCookie = e.response.headers.find((h) => h.name === 'Set-Cookie');
    expect(setCookie?.value).not.toContain('anothersecret');
  });

  it('陽性対照: 認証ヘッダ値が redact される', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    const auth = har.log.entries[0]!.request.headers.find((h) => h.name === 'Authorization');
    expect(auth?.value).not.toContain('abc.def.ghi');
  });

  it('陽性対照: 機密クエリ値が redact され URL からも消える', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    const e = har.log.entries[0]!;
    const tokenQ = e.request.queryString.find((q) => q.name === 'token');
    expect(tokenQ?.value).not.toBe('SECRETTOKEN123');
    expect(e.request.url).not.toContain('SECRETTOKEN123');
    // 非機密クエリは保持
    expect(e.request.url).toContain('page=2');
    expect(e.request.queryString.find((q) => q.name === 'page')?.value).toBe('2');
  });

  it('陽性対照: POST ボディの機密 param と本文が redact される', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    const pd = har.log.entries[0]!.request.postData!;
    expect(pd.params![0].value).not.toBe('myP@ssw0rd');
    expect(pd.text).not.toContain('myP@ssw0rd');
  });

  it('陽性対照: BODY_SCAN でレスポンスボディの API キーが redact される', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    expect(har.log.entries[0]!.response.content.text).not.toContain(
      'sk-proj-abcdef1234567890abcdef1234567890ab'
    );
  });

  it('陰性対照: 全カテゴリ OFF なら何も変わらない', () => {
    const original = makeHar();
    const { har, counts } = sanitizeHar(original, ALL_OFF);
    const e = har.log.entries[0]!;
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
    expect(original.log.entries[0]!.request.cookies[0].value).toBe('deadbeefcookie');
    expect(original.log.entries[0]!.request.url).toContain('SECRETTOKEN123');
  });

  it('一貫トークン化: 同一 Cookie 値は同一プレースホルダ', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    const e = har.log.entries[0]!;
    const cookieVal = e.request.cookies[0].value;
    const headerVal = e.request.headers.find((h) => h.name === 'Cookie')!.value;
    // Cookie ヘッダ "session=<redacted>" に同じプレースホルダが含まれる
    expect(headerVal).toContain(cookieVal);
  });

  it('出力が有効な JSON 構造を保つ', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    expect(() => JSON.stringify(har)).not.toThrow();
    expect(har.log.entries[0]!.response.status).toBe(200);
  });

  // ── P1-1: URL を運ぶヘッダ（Referer / Location 等）のトークン漏洩防止 ──
  it('陽性対照: Referer ヘッダ内の URL クエリトークンが redact される', () => {
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://x.com/?token=SUPERSECRET12345',
              headers: [{ name: 'Referer', value: 'https://x.com/page?token=SUPERSECRET12345' }],
              queryString: [{ name: 'token', value: 'SUPERSECRET12345' }],
              cookies: [],
            },
            response: { status: 302, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    const referer = out.log.entries[0]!.request.headers.find((h) => h.name === 'Referer');
    // URL からもヘッダからも同じ秘密値が消えていること（不整合な残存がない）
    expect(out.log.entries[0]!.request.url).not.toContain('SUPERSECRET12345');
    expect(referer?.value).not.toContain('SUPERSECRET12345');
  });

  it('陽性対照: レスポンス Location ヘッダ内の URL トークンが redact される', () => {
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://x.com/login',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: {
              status: 302,
              headers: [{ name: 'Location', value: 'https://x.com/cb?code=AUTHCODE9999' }],
              cookies: [],
              content: {},
            },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    const loc = out.log.entries[0]!.response.headers.find((h) => h.name === 'Location');
    expect(loc?.value).not.toContain('AUTHCODE9999');
  });

  // ── P1-2: base64 レスポンスボディを破壊しない ──
  it('base64 エンコードのレスポンスボディは BODY_SCAN で改変されない（破壊防止）', () => {
    const b64 = 'SGVsbG8gd29ybGQhIEhpZ2hFbnRyb3B5QmFzZTY0Q29udGVudEhlcmU=';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://x.com/img',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: {
              status: 200,
              headers: [],
              cookies: [],
              content: { mimeType: 'application/octet-stream', text: b64, encoding: 'base64' },
            },
          },
        ],
      },
    };
    const { har: out, counts } = sanitizeHar(har, ALL_ON);
    // 本文がそのまま保持され、デコードしても壊れないこと
    expect(out.log.entries[0]!.response.content.text).toBe(b64);
    expect(counts.BODY_SCAN).toBe(0);
  });

  it('陽性対照: URL の basic-auth パスワードを redact する', () => {
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://user:secretpw@host.com/path',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    expect(out.log.entries[0]!.request.url).not.toContain('secretpw');
    expect(out.log.entries[0]!.request.url).toContain('@host.com/path');
  });

  it('退行対照: host:port を含む URL を破壊しない', () => {
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://host:8080/p@th',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    // ポート/パスが壊れず保持される
    expect(out.log.entries[0]!.request.url).toBe('https://host:8080/p@th');
  });

  it('陽性対照: JSON 形式 POST ボディの password が redact される（#685）', () => {
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'POST',
              url: 'https://x.com/login',
              headers: [],
              queryString: [],
              cookies: [],
              postData: {
                mimeType: 'application/json',
                text: '{"username":"alice","password":"hunter2"}',
              },
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    expect(out.log.entries[0]!.request.postData!.text).not.toContain('hunter2');
  });

  it('陽性対照: 拡充した認証ヘッダ名（x-amz-security-token 等）が redact される（#687a）', () => {
    const secret = 'FQoGZXIvYXdzELONGSESSIONTOKEN1234567890';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://x.com/',
              headers: [{ name: 'X-Amz-Security-Token', value: secret }],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    expect(out.log.entries[0]!.request.headers[0].value).not.toContain(secret);
  });

  it('陽性対照: 拡充した機密クエリ名（assertion 等）が構造的に redact される（#689a）', () => {
    const secret = 'SAMLASSERTIONVALUE12345';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: `https://x.com/sso?assertion=${secret}`,
              headers: [],
              queryString: [{ name: 'assertion', value: secret }],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    expect(out.log.entries[0]!.request.queryString[0].value).not.toBe(secret);
  });

  it('陽性対照: URL パスセグメント内のトークンが redact され host は保持される（#687c）', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QTabcDEF';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: `https://api.example.com/reset-password/${jwt}`,
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    const url = out.log.entries[0]!.request.url;
    expect(url).not.toContain(jwt);
    expect(url).toContain('https://api.example.com/'); // host は保持
  });

  it('陽性対照: 辞書外クエリ名の JWT も scrubText で redact される（#689b）', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIyIn0.AbCdEfGhIjKlMnOpQrStUvWx';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: `https://x.com/cb?foo=${jwt}`,
              headers: [],
              queryString: [{ name: 'foo', value: jwt }],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    expect(out.log.entries[0]!.request.url).not.toContain(jwt);
  });

  it('陽性対照: 辞書外ヘッダの値に含まれる JWT が scrubText で redact される（#687b）', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QTabcDEF';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://x.com/',
              headers: [{ name: 'X-Custom-Trace', value: `trace=${jwt}` }],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    expect(out.log.entries[0]!.request.headers[0].value).not.toContain(jwt);
  });

  it('退行対照: 機密を含まない辞書外ヘッダは変更しない', () => {
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://x.com/',
              headers: [{ name: 'Accept-Language', value: 'ja-JP,ja;q=0.9' }],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    expect(out.log.entries[0]!.request.headers[0].value).toBe('ja-JP,ja;q=0.9');
  });

  it('陽性対照: response.redirectURL 内のトークンが redact される（#687d）', () => {
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://x.com/login',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: {
              status: 302,
              headers: [],
              cookies: [],
              content: {},
              redirectURL: 'https://x.com/cb?access_token=SUPERSECRETTOKEN12345&code=AUTH99',
            },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    expect(out.log.entries[0]!.response.redirectURL!).not.toContain('SUPERSECRETTOKEN12345');
  });

  it('退行対照: encoding 欄が無くても mimeType がバイナリ系なら本文スキャンをスキップし破壊しない（#690 M-2）', () => {
    const b64 = 'SGVsbG8gd29ybGRIaWdoRW50cm9weUJhc2U2NENvbnRlbnRBYmNkZWZnaGlqaw==';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://x.com/img.png',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: {
              status: 200,
              headers: [],
              cookies: [],
              content: { mimeType: 'image/png', text: b64 },
            },
          },
        ],
      },
    };
    const { har: out, counts } = sanitizeHar(har, ALL_ON);
    expect(out.log.entries[0]!.response.content.text).toBe(b64);
    expect(counts.BODY_SCAN).toBe(0);
  });

  it('陽性対照: テキスト系 mimeType（application/json）の本文は引き続きスキャンされる', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIzIn0.ZZZZxwRJSMeKKF2QTabcDEF';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://x.com/api',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: {
              status: 200,
              headers: [],
              cookies: [],
              content: { mimeType: 'application/json', text: `{"t":"${jwt}"}` },
            },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    expect(out.log.entries[0]!.response.content.text).not.toContain(jwt);
  });

  // ── P2-3: 壊れた entry でクラッシュしない ──
  it('JSON として妥当だが entry が壊れた HAR でも例外を投げない', () => {
    // { "log": { "entries": [ {} ] } } — request/response 欠落
    const broken = {
      log: { entries: [{}, null, { request: {}, response: {} }] },
    } as unknown as Har;
    expect(() => sanitizeHar(broken, ALL_ON)).not.toThrow();
    const { har } = sanitizeHar(broken, ALL_ON);
    expect(har.log.entries).toHaveLength(3);
  });
});

// ── #695: data: URL 破壊回避 ──
describe('#695: data: URL を破壊しない', () => {
  it('退行対照: request.url が data: URL のとき原文のまま保持される', () => {
    // HIGH_ENTROPY_BASE64 が base64 ペイロードを [REDACTED] に置換してデコード不能にする
    // 破壊クラスを防ぐガード（scrubUrlPath 冒頭の /^data:/i チェック）の退行対照。
    // ガードを外すと base64 部が [REDACTED:...] に置換されて toBe(原文) が fail する。
    const payload =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const dataUrl = `data:image/png;base64,${payload}`;
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: dataUrl,
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const { har: out, counts } = sanitizeHar(har, ALL_ON);
    // ガードが機能すれば URL は原文のまま
    expect(out.log.entries[0]!.request.url).toBe(dataUrl);
    // PATH_SCAN カウントは 0（base64 を誤検出しない）
    expect(counts.PATH_SCAN).toBe(0);
  });

  it('退行対照: response.redirectURL が data: URL のとき原文のまま保持される', () => {
    const dataUrl = 'data:text/html;charset=utf-8,<h1>redirect</h1>';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://x.com/login',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: {
              status: 302,
              headers: [],
              cookies: [],
              content: {},
              redirectURL: dataUrl,
            },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    expect(out.log.entries[0]!.response.redirectURL).toBe(dataUrl);
  });

  it('退行対照: 通常の https:// URL のパストークン redact は従来どおり動作する', () => {
    // data: URL ガードが https:// URL に誤って適用されないことの確認
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QTabcXYZ';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: `https://api.example.com/reset/${jwt}`,
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const { har: out } = sanitizeHar(har, ALL_ON);
    expect(out.log.entries[0]!.request.url).not.toContain(jwt);
    expect(out.log.entries[0]!.request.url).toContain('https://api.example.com/');
  });
});

// ── #690 L-3: makeTokenizer 冪等化（二重計上防止） ──
describe('#690 L-3: makeTokenizer 冪等化（2b）', () => {
  it('冪等性（退行対照）: 2回 sanitizeHar してもカウントが増えない', () => {
    // makeTokenizer の PLACEHOLDER_EXACT_RE ガードが機能すれば、
    // 1 回目にプレースホルダ化された値を 2 回目に再 tokenize しない。
    // ガードを外すと 2 回目にも counts が増加して toEqual(0) が fail する（空回りでない証明）。
    const harInput = makeHar();
    const { har: once } = sanitizeHar(harInput, ALL_ON);
    // 2 回目のサニタイズ
    const { counts: twiceCounts } = sanitizeHar(once, ALL_ON);
    // 構造的 redact（COOKIE / AUTH_HEADER / QUERY）は冪等ガードで 0 になる
    expect(twiceCounts.COOKIE).toBe(0);
    expect(twiceCounts.AUTH_HEADER).toBe(0);
    expect(twiceCounts.QUERY).toBe(0);
  });

  it('陽性対照（冪等化）: 初回サニタイズでは Cookie/Auth 等が正常に redact される', () => {
    // 冪等ガードが初回の redact を妨げていないことを確認（ガード有無どちらでも通る → 初回は正常）
    const { counts } = sanitizeHar(makeHar(), ALL_ON);
    // Cookie と AUTH_HEADER は初回で必ず検出される
    expect(counts.COOKIE).toBeGreaterThan(0);
    expect(counts.AUTH_HEADER).toBeGreaterThan(0);
  });
});

// ── #694: HEADER_SCAN / PATH_SCAN 独立カテゴリ分離の陽性対照 ──
describe('#694: HEADER_SCAN / PATH_SCAN 独立制御', () => {
  // AUTH_HEADER のみ ON: 辞書一致ヘッダ（Authorization）は redact される
  it('AUTH_HEADER のみ ON: Authorization は redact されるが辞書外ヘッダは redact されない', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QTabcDEF';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://x.com/',
              headers: [
                { name: 'Authorization', value: `Bearer ${jwt}` },
                { name: 'X-Custom-Trace', value: `trace=${jwt}` },
              ],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const enabled = { ...ALL_OFF, AUTH_HEADER: true };
    const { har: out, counts } = sanitizeHar(har, enabled);
    const authHeader = out.log.entries[0]!.request.headers.find((h) => h.name === 'Authorization');
    const customHeader = out.log.entries[0]!.request.headers.find(
      (h) => h.name === 'X-Custom-Trace'
    );
    // Authorization（辞書一致）は redact される
    expect(authHeader?.value).not.toContain(jwt);
    expect(counts.AUTH_HEADER).toBeGreaterThan(0);
    // X-Custom-Trace（辞書外）は HEADER_SCAN OFF なので redact されない
    expect(customHeader?.value).toContain(jwt);
    expect(counts.HEADER_SCAN).toBe(0);
  });

  // HEADER_SCAN のみ ON: 辞書外ヘッダの JWT は redact されるが Authorization は redact されない
  it('HEADER_SCAN のみ ON: 辞書外ヘッダの JWT は redact されるが Authorization は redact されない', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QTabcDEF';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'https://x.com/',
              headers: [
                { name: 'Authorization', value: `Bearer ${jwt}` },
                { name: 'X-Custom-Trace', value: `trace=${jwt}` },
              ],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const enabled = { ...ALL_OFF, HEADER_SCAN: true };
    const { har: out, counts } = sanitizeHar(har, enabled);
    const authHeader = out.log.entries[0]!.request.headers.find((h) => h.name === 'Authorization');
    const customHeader = out.log.entries[0]!.request.headers.find(
      (h) => h.name === 'X-Custom-Trace'
    );
    // Authorization は AUTH_HEADER OFF なので（辞書一致でも）redact されない
    expect(authHeader?.value).toContain(jwt);
    expect(counts.AUTH_HEADER).toBe(0);
    // X-Custom-Trace（辞書外）は HEADER_SCAN で redact される
    expect(customHeader?.value).not.toContain(jwt);
    expect(counts.HEADER_SCAN).toBeGreaterThan(0);
  });

  // QUERY のみ ON: 辞書一致クエリ param は redact される。URL パストークンは残る
  it('QUERY のみ ON: 辞書一致クエリは redact されるが URL パストークンは残る', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QTabcDEF';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: `https://x.com/reset/${jwt}?token=SECRET123&page=1`,
              headers: [],
              queryString: [
                { name: 'token', value: 'SECRET123' },
                { name: 'page', value: '1' },
              ],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const enabled = { ...ALL_OFF, QUERY: true };
    const { har: out, counts } = sanitizeHar(har, enabled);
    const url = out.log.entries[0]!.request.url;
    // 辞書一致クエリ（token）は QUERY で redact される
    expect(url).not.toContain('SECRET123');
    expect(counts.QUERY).toBeGreaterThan(0);
    // URL パスセグメントの JWT は PATH_SCAN OFF なので残る
    expect(url).toContain(jwt);
    expect(counts.PATH_SCAN).toBe(0);
  });

  // PATH_SCAN のみ ON: URL パストークンは redact される。辞書一致クエリ param は残る
  it('PATH_SCAN のみ ON: URL パストークンは redact されるが辞書一致クエリ param は残る', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QTabcDEF';
    const secret = 'PLAINTEXT_SECRET';
    const har: Har = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: `https://x.com/reset/${jwt}?token=${secret}&page=1`,
              headers: [],
              queryString: [
                { name: 'token', value: secret },
                { name: 'page', value: '1' },
              ],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    };
    const enabled = { ...ALL_OFF, PATH_SCAN: true };
    const { har: out, counts } = sanitizeHar(har, enabled);
    const url = out.log.entries[0]!.request.url;
    // URL パスの JWT は PATH_SCAN で redact される
    expect(url).not.toContain(jwt);
    expect(counts.PATH_SCAN).toBeGreaterThan(0);
    // queryString 配列は QUERY OFF なので辞書一致 token も残る
    expect(out.log.entries[0]!.request.queryString.find((q) => q.name === 'token')?.value).toBe(
      secret
    );
    expect(counts.QUERY).toBe(0);
  });
});

// ── 進捗コールバック（Web Worker の進捗バー用） ──
describe('sanitizeHar onProgress', () => {
  /** n 件の最小エントリを持つ HAR を生成する。 */
  function makeHarWithEntries(n: number): Har {
    const entries = Array.from({ length: n }, (_, i) => ({
      request: {
        method: 'GET',
        url: `https://example.com/api/${i}`,
        headers: [],
        queryString: [],
        cookies: [],
      },
      response: { status: 200, headers: [], cookies: [], content: {} },
    }));
    return { log: { version: '1.2', entries } } as unknown as Har;
  }

  it('処理済みエントリ数を単調増加で通知し、最終値は総エントリ数に一致する', () => {
    const total = 250;
    const calls: number[] = [];
    sanitizeHar(makeHarWithEntries(total), ALL_ON, (processed) => calls.push(processed));

    // 1 回以上通知される（100 件間隔 + 端数の最終通知）
    expect(calls.length).toBeGreaterThan(0);
    // 単調増加であること
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i]).toBeGreaterThanOrEqual(calls[i - 1]);
    }
    // 最終通知は総数に一致（進捗バーが 100% に到達する保証）
    expect(calls[calls.length - 1]).toBe(total);
    // 通知値が総数を超えない
    expect(Math.max(...calls)).toBeLessThanOrEqual(total);
  });

  it('総数が PROGRESS_INTERVAL(100) の倍数のとき最終通知が重複しない', () => {
    // 旧実装（無条件の最終通知）だと [100, 200, 200] と末尾が重複する。
    // 重複排除後は [100, 200] になる（最終値=総数は保たれる）。
    const calls: number[] = [];
    sanitizeHar(makeHarWithEntries(200), ALL_ON, (processed) => calls.push(processed));
    expect(calls).toEqual([100, 200]);
  });

  it('onProgress を省略しても例外を投げず結果は同一', () => {
    const har = makeHarWithEntries(10);
    const withCb = sanitizeHar(har, ALL_ON, () => {});
    const withoutCb = sanitizeHar(har, ALL_ON);
    expect(withoutCb.har.log.entries).toHaveLength(10);
    expect(withoutCb.counts).toEqual(withCb.counts);
  });

  it('エントリ 0 件でも最終通知が 0 で行われる', () => {
    const calls: number[] = [];
    sanitizeHar(makeHarWithEntries(0), ALL_ON, (processed) => calls.push(processed));
    expect(calls).toEqual([0]);
  });
});
