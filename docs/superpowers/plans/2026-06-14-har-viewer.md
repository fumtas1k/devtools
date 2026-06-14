# HAR ビューア＆サニタイザ（S2-4）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DevTools の HAR ファイルをブラウザ完結で閲覧し、Cookie / Authorization / トークン類を自動 redact した共有用 HAR を出力するツールを追加する（ウォーターフォールは別 PR）。

**Architecture:** `src/utils/har/` に純関数の parse / sanitize ロジックを置き（既存 `secret-scrubber` の `scrubText` を併用）、`src/components/tools/` に React UI（親 `HarViewer` ＋ 一覧 `HarEntryList` ＋ 詳細 `HarEntryDetail`）を実装する。入力は `file-validation` でガードし、出力は `download` ヘルパで再シリアライズする。

**Tech Stack:** TypeScript / React / Astro / Vitest。既存資産: `scrubText`（secret-scrubber）、`validateFile`、`ToggleChips` / `InputField` / `DownloadButton` / `CopyButton` / `FileInputButton` / `ErrorMessage` / `NotificationBanner`。

参照 spec: `docs/superpowers/specs/2026-06-14-har-viewer-design.md`

---

## ファイル構成

| ファイル                                                                                    | 責務                                                |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `src/utils/har/types.ts`                                                                    | HAR 1.2 の必要サブセット型                          |
| `src/utils/har/rules.ts`                                                                    | redact カテゴリ定義・機密ヘッダ/クエリ辞書・既定 ON |
| `src/utils/har/parse.ts`                                                                    | HAR JSON パース＋最小スキーマ検証                   |
| `src/utils/har/sanitize.ts`                                                                 | 構造的 redact ＋ `scrubText` 併用（純関数・非破壊） |
| `src/utils/har/index.ts`                                                                    | re-export                                           |
| `src/utils/har/__tests__/parse.test.ts`                                                     | parse ユニットテスト                                |
| `src/utils/har/__tests__/sanitize.test.ts`                                                  | sanitize 陽性/陰性対照テスト                        |
| `src/components/tools/HarEntryList.tsx`                                                     | エントリ一覧テーブル                                |
| `src/components/tools/HarEntryDetail.tsx`                                                   | 詳細パネル                                          |
| `src/components/tools/HarViewer.tsx`                                                        | 親: 入力・トグル・サマリ・出力                      |
| `src/pages/tools/har-viewer.astro`                                                          | Astro ページ                                        |
| `tests/e2e/visual-regression-pages.ts`                                                      | `/tools/har-viewer` を PAGES に追加                 |
| `src/data/tools.ts`                                                                         | `toolEntries` にエントリ追加                        |
| `README.md` / `SPEC.md` / `docs/decisions.md` / `docs/tools.md` / `docs/tool-candidates.md` | ドキュメント更新                                    |

---

## Task 1: HAR 型定義

**Files:**

- Create: `src/utils/har/types.ts`

- [ ] **Step 1: 型を定義する**

HAR 1.2 仕様（http://www.softwareishard.com/blog/har-12-spec/）の必要サブセットのみ定義する。

```typescript
// src/utils/har/types.ts
/**
 * HAR 1.2 の必要サブセット型。
 * 仕様全体ではなく本ツールが読む/書くフィールドのみを定義する。
 * 未知フィールドは保持する必要があるため、各オブジェクトに index signature を許可する。
 */

export interface HarNameValue {
  name: string;
  value: string;
  [key: string]: unknown;
}

export interface HarCookie {
  name: string;
  value: string;
  [key: string]: unknown;
}

export interface HarPostData {
  mimeType?: string;
  text?: string;
  params?: HarNameValue[];
  [key: string]: unknown;
}

export interface HarRequest {
  method: string;
  url: string;
  httpVersion?: string;
  headers: HarNameValue[];
  queryString: HarNameValue[];
  cookies: HarCookie[];
  postData?: HarPostData;
  headersSize?: number;
  bodySize?: number;
  [key: string]: unknown;
}

export interface HarContent {
  size?: number;
  mimeType?: string;
  text?: string;
  encoding?: string;
  [key: string]: unknown;
}

export interface HarResponse {
  status: number;
  statusText?: string;
  httpVersion?: string;
  headers: HarNameValue[];
  cookies: HarCookie[];
  content: HarContent;
  bodySize?: number;
  [key: string]: unknown;
}

export interface HarEntry {
  startedDateTime?: string;
  time?: number;
  request: HarRequest;
  response: HarResponse;
  [key: string]: unknown;
}

export interface HarLog {
  version?: string;
  entries: HarEntry[];
  [key: string]: unknown;
}

export interface Har {
  log: HarLog;
  [key: string]: unknown;
}
```

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（型のみの追加）

- [ ] **Step 3: コミット**

```bash
git add src/utils/har/types.ts
git commit -m "feat: HAR 1.2 サブセット型を追加"
```

---

## Task 2: redact ルール辞書

**Files:**

- Create: `src/utils/har/rules.ts`

- [ ] **Step 1: ルール辞書を定義する**

redact カテゴリ・機密ヘッダ/クエリ名辞書・既定状態を定義する。`scrubText` の `ScrubCategory` とは別系統（構造的 redact 用）。

```typescript
// src/utils/har/rules.ts
/**
 * HAR 構造的 redact のカテゴリ定義と機密フィールド名辞書。
 * scrubText（自由テキスト走査）とは独立した、フィールド名ベースの確実な redact 用。
 */

export type HarRedactCategory =
  | 'COOKIE' // request/response の cookies[] と Cookie/Set-Cookie ヘッダ
  | 'AUTH_HEADER' // Authorization 等の認証ヘッダ
  | 'QUERY' // 機密クエリパラメータ
  | 'BODY' // postData（params 機密名 + text への scrubText）
  | 'BODY_SCAN'; // レスポンスボディ等への scrubText 適用

export const HAR_REDACT_CATEGORIES: HarRedactCategory[] = [
  'COOKIE',
  'AUTH_HEADER',
  'QUERY',
  'BODY',
  'BODY_SCAN',
];

export const HAR_REDACT_LABEL: Record<HarRedactCategory, string> = {
  COOKIE: 'Cookie',
  AUTH_HEADER: '認証ヘッダ',
  QUERY: '機密クエリ',
  BODY: 'POSTボディ',
  BODY_SCAN: '本文スキャン',
};

export const HAR_REDACT_DEFAULT: Record<HarRedactCategory, boolean> = {
  COOKIE: true,
  AUTH_HEADER: true,
  QUERY: true,
  BODY: true,
  BODY_SCAN: true,
};

export function emptyRedactCounts(): Record<HarRedactCategory, number> {
  return Object.fromEntries(HAR_REDACT_CATEGORIES.map((c) => [c, 0])) as Record<
    HarRedactCategory,
    number
  >;
}

/** Cookie を運ぶヘッダ名（小文字比較）。COOKIE カテゴリで redact する。 */
export const COOKIE_HEADER_NAMES = new Set(['cookie', 'set-cookie']);

/** 認証系ヘッダ名（小文字比較）。AUTH_HEADER カテゴリで redact する。 */
export const AUTH_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
]);

/** 機密クエリ/POST パラメータ名（小文字比較）。QUERY / BODY カテゴリで redact する。 */
export const SENSITIVE_PARAM_NAMES = new Set([
  'token',
  'access_token',
  'id_token',
  'refresh_token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'client_secret',
  'sig',
  'signature',
  'password',
  'passwd',
  'pwd',
  'code',
]);
```

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/utils/har/rules.ts
git commit -m "feat: HAR redact カテゴリと機密フィールド辞書を追加"
```

---

## Task 3: HAR パーサ（TDD）

**Files:**

- Create: `src/utils/har/parse.ts`
- Test: `src/utils/har/__tests__/parse.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// src/utils/har/__tests__/parse.test.ts
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test -- src/utils/har/__tests__/parse.test.ts`
Expected: FAIL（`parseHar` が存在しない）

- [ ] **Step 3: 最小実装**

```typescript
// src/utils/har/parse.ts
import type { Har } from './types';

export type ParseResult = { ok: true; har: Har } | { ok: false; message: string };

/**
 * HAR JSON 文字列をパースし、最小スキーマ（log.entries が配列）を検証する。
 * 純関数。スキーマ全体は検証せず、本ツールが必要とする構造のみ確認する。
 */
export function parseHar(input: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `JSON として解析できません: ${detail}` };
  }

  if (typeof data !== 'object' || data === null || !('log' in data)) {
    return { ok: false, message: 'HAR 形式ではありません（log フィールドがありません）' };
  }

  const log = (data as { log: unknown }).log;
  if (typeof log !== 'object' || log === null || !('entries' in log)) {
    return { ok: false, message: 'HAR 形式ではありません（log.entries がありません）' };
  }

  const entries = (log as { entries: unknown }).entries;
  if (!Array.isArray(entries)) {
    return { ok: false, message: 'HAR 形式ではありません（log.entries が配列ではありません）' };
  }

  return { ok: true, har: data as Har };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- src/utils/har/__tests__/parse.test.ts`
Expected: PASS（5 件）

- [ ] **Step 5: コミット**

```bash
git add src/utils/har/parse.ts src/utils/har/__tests__/parse.test.ts
git commit -m "feat: HAR パーサとスキーマ検証を追加"
```

---

## Task 4: サニタイザ（TDD・陽性/陰性対照必須）

> **test-gates skill 準拠**: redact 検知器のため陽性対照（redact されること）と陰性対照（トグル OFF で素通り）の両方を必須とする。実装前に `Skill` tool で `test-gates` skill を確認すること。

**Files:**

- Create: `src/utils/har/sanitize.ts`
- Test: `src/utils/har/__tests__/sanitize.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// src/utils/har/__tests__/sanitize.test.ts
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
              mimeType: 'application/json',
              text: '{"password":"p@ss","email":"a@b.com"}',
              params: [{ name: 'password', value: 'p@ss' }],
            },
          },
          response: {
            status: 200,
            headers: [{ name: 'Set-Cookie', value: 'sid=anothersecret; HttpOnly' }],
            cookies: [{ name: 'sid', value: 'anothersecret' }],
            content: { mimeType: 'application/json', text: '{"apiKey":"sk-1234567890abcdef"}' },
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
    expect(pd.params![0].value).not.toBe('p@ss');
    expect(pd.text).not.toContain('p@ss');
  });

  it('陽性対照: BODY_SCAN でレスポンスボディの API キーが redact される', () => {
    const { har } = sanitizeHar(makeHar(), ALL_ON);
    expect(har.log.entries[0].response.content.text).not.toContain('sk-1234567890abcdef');
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test -- src/utils/har/__tests__/sanitize.test.ts`
Expected: FAIL（`sanitizeHar` が存在しない）

- [ ] **Step 3: 実装**

```typescript
// src/utils/har/sanitize.ts
/**
 * HAR を構造的に redact し、scrubText で本文の取りこぼしを拾うサニタイザ。
 * 純関数・入力非破壊（structuredClone でコピーしてから処理する）。
 *
 * 一貫トークン化: カテゴリ × 値 → [REDACTED:<CAT>_<n>]。同一値は同一プレースホルダ。
 */
import type { Har, HarNameValue } from './types';
import {
  type HarRedactCategory,
  COOKIE_HEADER_NAMES,
  AUTH_HEADER_NAMES,
  SENSITIVE_PARAM_NAMES,
  emptyRedactCounts,
} from './rules';
import { scrubText } from '@/utils/secret-scrubber/scrub';
import { DEFAULT_ENABLED } from '@/utils/secret-scrubber/rules';

export interface SanitizeResult {
  har: Har;
  counts: Record<HarRedactCategory, number>;
}

/** 一貫トークン発行器。カテゴリ別カウンタと値→トークンの Map を保持する。 */
function makeTokenizer(counts: Record<HarRedactCategory, number>) {
  const map = new Map<string, string>();
  const counter: Partial<Record<HarRedactCategory, number>> = {};
  return (category: HarRedactCategory, value: string): string => {
    const key = `${category}:${value}`;
    let token = map.get(key);
    if (!token) {
      const n = (counter[category] ?? 0) + 1;
      counter[category] = n;
      token = `[REDACTED:${category}_${n}]`;
      map.set(key, token);
    }
    counts[category]++;
    return token;
  };
}

/**
 * `name=value` 形式（Cookie ヘッダ "a=1; b=2" / クエリ文字列）の value 部のみを
 * 指定 names にマッチするとき redact する。COOKIE ヘッダは全 value を redact する。
 */
function redactPairString(
  raw: string,
  pairSep: string,
  redactAll: boolean,
  names: Set<string>,
  category: HarRedactCategory,
  tokenize: (c: HarRedactCategory, v: string) => string
): string {
  return raw
    .split(pairSep)
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      const name = pair.slice(0, eq).trim().toLowerCase();
      const before = pair.slice(0, eq + 1);
      const value = pair.slice(eq + 1);
      if (redactAll || names.has(name)) {
        return before + tokenize(category, value);
      }
      return pair;
    })
    .join(pairSep);
}

/** request.url の basic-auth と機密クエリパラメータを redact する。 */
function redactUrl(
  url: string,
  enabled: Record<HarRedactCategory, boolean>,
  tokenize: (c: HarRedactCategory, v: string) => string
): string {
  let result = url;

  // basic-auth: scheme://user:pass@host → pass を redact（QUERY 扱いで件数計上）
  if (enabled.QUERY) {
    result = result.replace(/(:\/\/[^/@:]+:)([^@]+)(@)/, (_m, pre, pass, post) => {
      return pre + tokenize('QUERY', pass) + post;
    });
  }

  if (enabled.QUERY) {
    const qIndex = result.indexOf('?');
    if (qIndex !== -1) {
      const base = result.slice(0, qIndex + 1);
      const queryPart = result.slice(qIndex + 1);
      const [query, hash = ''] = queryPart.split('#');
      const newQuery = redactPairString(
        query,
        '&',
        false,
        SENSITIVE_PARAM_NAMES,
        'QUERY',
        tokenize
      );
      result = base + newQuery + (hash ? '#' + hash : '');
    }
  }
  return result;
}

function redactHeaders(
  headers: HarNameValue[],
  enabled: Record<HarRedactCategory, boolean>,
  tokenize: (c: HarRedactCategory, v: string) => string
): void {
  for (const h of headers) {
    const lower = h.name.toLowerCase();
    if (enabled.COOKIE && COOKIE_HEADER_NAMES.has(lower)) {
      // Cookie ヘッダは "a=1; b=2" を value だけ redact、Set-Cookie は全体 redact
      if (lower === 'cookie') {
        h.value = redactPairString(h.value, ';', true, COOKIE_HEADER_NAMES, 'COOKIE', tokenize);
      } else {
        h.value = tokenize('COOKIE', h.value);
      }
    } else if (enabled.AUTH_HEADER && AUTH_HEADER_NAMES.has(lower)) {
      h.value = tokenize('AUTH_HEADER', h.value);
    }
  }
}

export function sanitizeHar(
  input: Har,
  enabled: Record<HarRedactCategory, boolean>
): SanitizeResult {
  const har: Har = structuredClone(input);
  const counts = emptyRedactCounts();
  const tokenize = makeTokenizer(counts);

  for (const entry of har.log.entries) {
    const { request, response } = entry;

    // ヘッダ
    if (request.headers) redactHeaders(request.headers, enabled, tokenize);
    if (response.headers) redactHeaders(response.headers, enabled, tokenize);

    // Cookie 配列
    if (enabled.COOKIE) {
      for (const c of request.cookies ?? []) c.value = tokenize('COOKIE', c.value);
      for (const c of response.cookies ?? []) c.value = tokenize('COOKIE', c.value);
    }

    // クエリ（配列 + URL）
    if (enabled.QUERY) {
      for (const q of request.queryString ?? []) {
        if (SENSITIVE_PARAM_NAMES.has(q.name.toLowerCase())) {
          q.value = tokenize('QUERY', q.value);
        }
      }
    }
    request.url = redactUrl(request.url, enabled, tokenize);

    // POST ボディ
    if (enabled.BODY && request.postData) {
      for (const p of request.postData.params ?? []) {
        if (SENSITIVE_PARAM_NAMES.has(p.name.toLowerCase())) {
          p.value = tokenize('BODY', p.value);
        }
      }
      if (typeof request.postData.text === 'string') {
        const r = scrubText(request.postData.text, DEFAULT_ENABLED);
        if (r.findings.length > 0) {
          request.postData.text = r.output;
          counts.BODY += r.findings.length;
        }
      }
    }

    // レスポンスボディスキャン
    if (enabled.BODY_SCAN && typeof response.content?.text === 'string') {
      const r = scrubText(response.content.text, DEFAULT_ENABLED);
      if (r.findings.length > 0) {
        response.content.text = r.output;
        counts.BODY_SCAN += r.findings.length;
      }
    }
  }

  return { har, counts };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- src/utils/har/__tests__/sanitize.test.ts`
Expected: PASS（全ケース）。陰性対照（ALL_OFF）が通ることで「検知能力ゼロで green」でないことが担保される。

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/utils/har/sanitize.ts src/utils/har/__tests__/sanitize.test.ts
git commit -m "feat: HAR サニタイザを追加（構造的 redact + scrubText 併用）"
```

---

## Task 5: index re-export

**Files:**

- Create: `src/utils/har/index.ts`

- [ ] **Step 1: re-export を書く**

```typescript
// src/utils/har/index.ts
export type {
  Har,
  HarLog,
  HarEntry,
  HarRequest,
  HarResponse,
  HarNameValue,
  HarCookie,
  HarPostData,
  HarContent,
} from './types';
export { parseHar } from './parse';
export type { ParseResult } from './parse';
export { sanitizeHar } from './sanitize';
export type { SanitizeResult } from './sanitize';
export {
  type HarRedactCategory,
  HAR_REDACT_CATEGORIES,
  HAR_REDACT_LABEL,
  HAR_REDACT_DEFAULT,
  emptyRedactCounts,
} from './rules';
```

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/utils/har/index.ts
git commit -m "feat: har モジュールの re-export を追加"
```

---

## Task 6: エントリ一覧テーブル

**Files:**

- Create: `src/components/tools/HarEntryList.tsx`

事前確認: `src/components/tools/CidrCalculator.tsx` 等の既存テーブル表現と `.agents/rules/common.md` 7 章のカラー規約（primitive scale 禁止・意味クラス使用）。

- [ ] **Step 1: コンポーネントを書く**

```tsx
// src/components/tools/HarEntryList.tsx
import type { HarEntry } from '@/utils/har';

interface Props {
  entries: HarEntry[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

/** URL からパス + ホストの短縮表示を作る（表示専用、redact 後の URL を受け取る） */
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return url;
  }
}

function formatSize(bytes: number | undefined): string {
  if (bytes == null || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(ms: number | undefined): string {
  if (ms == null) return '-';
  return `${Math.round(ms)} ms`;
}

export function HarEntryList({ entries, selectedIndex, onSelect }: Props) {
  return (
    <div className="overflow-x-auto rounded border border-default">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">HTTP リクエスト一覧</caption>
        <thead>
          <tr className="bg-subtle text-left">
            <th scope="col" className="px-3 py-2 font-medium">
              メソッド
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              URL
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              ステータス
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              サイズ
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              時間
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr
              key={i}
              aria-selected={selectedIndex === i}
              className={selectedIndex === i ? 'bg-active' : undefined}
            >
              <td className="px-3 py-1.5 font-mono">{e.request.method}</td>
              <td className="px-3 py-1.5">
                <button
                  type="button"
                  className="text-left text-primary underline-offset-2 hover:underline"
                  onClick={() => onSelect(i)}
                >
                  {shortUrl(e.request.url)}
                </button>
              </td>
              <td className="px-3 py-1.5 font-mono">{e.response.status}</td>
              <td className="px-3 py-1.5 font-mono">
                {formatSize(e.response.content?.size ?? e.response.bodySize)}
              </td>
              <td className="px-3 py-1.5 font-mono">{formatTime(e.time)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

> 注: `bg-subtle` / `bg-active` / `border-default` / `text-primary` が `global.css` に存在するか実装時に確認する。無ければ既存の近い意味クラス（`secret-scrubber` 等で使われているもの）に合わせる。`hover:underline` は Tailwind 標準 utility なので variant 問題の対象外。

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

- [ ] **Step 3: lint（button type 漏れ検出）**

Run: `npm run lint`
Expected: エラーなし（`type="button"` 付与済み）

- [ ] **Step 4: コミット**

```bash
git add src/components/tools/HarEntryList.tsx
git commit -m "feat: HAR エントリ一覧テーブルを追加"
```

---

## Task 7: 詳細パネル

**Files:**

- Create: `src/components/tools/HarEntryDetail.tsx`

- [ ] **Step 1: コンポーネントを書く**

サニタイズ後のエントリを受け取り、ヘッダ・Cookie・クエリ・ボディをセクション表示する。

```tsx
// src/components/tools/HarEntryDetail.tsx
import type { HarEntry, HarNameValue } from '@/utils/har';

interface Props {
  entry: HarEntry;
}

function NameValueTable({ rows, label }: { rows: HarNameValue[]; label: string }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 mt-3 font-medium">{label}</h4>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="w-1/3 px-2 py-1 font-mono text-muted break-all">{r.name}</td>
              <td className="px-2 py-1 font-mono break-all">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HarEntryDetail({ entry }: Props) {
  const { request, response } = entry;
  return (
    <div className="space-y-4 rounded border border-default p-4">
      <div>
        <h3 className="font-medium">リクエスト</h3>
        <p className="break-all font-mono text-sm">
          {request.method} {request.url}
        </p>
        <NameValueTable rows={request.headers} label="ヘッダ" />
        <NameValueTable rows={request.queryString} label="クエリ文字列" />
        <NameValueTable rows={request.cookies} label="Cookie" />
        {request.postData?.text != null && (
          <div>
            <h4 className="mb-1 mt-3 font-medium">POST ボディ</h4>
            <pre className="overflow-x-auto rounded bg-subtle p-2 text-xs">
              {request.postData.text}
            </pre>
          </div>
        )}
      </div>
      <div>
        <h3 className="font-medium">
          レスポンス（{response.status} {response.statusText ?? ''}）
        </h3>
        <NameValueTable rows={response.headers} label="ヘッダ" />
        <NameValueTable rows={response.cookies} label="Cookie" />
        {response.content?.text != null && (
          <div>
            <h4 className="mb-1 mt-3 font-medium">ボディ</h4>
            <pre className="overflow-x-auto rounded bg-subtle p-2 text-xs">
              {response.content.text}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/components/tools/HarEntryDetail.tsx
git commit -m "feat: HAR エントリ詳細パネルを追加"
```

---

## Task 8: 親コンポーネント（入力・トグル・サマリ・出力）

**Files:**

- Create: `src/components/tools/HarViewer.tsx`

事前確認: `src/components/tools/SecretScrubber.tsx`（ToggleChips 使用例）、`src/components/tools/ClipboardInspector.tsx`（drop イベント）、`src/utils/file-validation.ts`、`src/utils/download.ts`。

- [ ] **Step 1: コンポーネントを書く**

```tsx
// src/components/tools/HarViewer.tsx
import { useState, useMemo, useCallback } from 'react';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { FileInputButton } from '@/components/ui/FileInputButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { CopyButton } from '@/components/ui/CopyButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ClearButton } from '@/components/ui/ClearButton';
import { HarEntryList } from './HarEntryList';
import { HarEntryDetail } from './HarEntryDetail';
import { validateFile } from '@/utils/file-validation';
import { downloadText } from '@/utils/download';
import {
  parseHar,
  sanitizeHar,
  HAR_REDACT_CATEGORIES,
  HAR_REDACT_LABEL,
  HAR_REDACT_DEFAULT,
  type HarRedactCategory,
  type Har,
} from '@/utils/har';

const MAX_BYTES = 25 * 1024 * 1024;

export function HarViewer() {
  const [har, setHar] = useState<Har | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [enabled, setEnabled] = useState<Record<HarRedactCategory, boolean>>({
    ...HAR_REDACT_DEFAULT,
  });

  const handleToggle = useCallback((cat: HarRedactCategory) => {
    setEnabled((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  const loadText = useCallback((text: string) => {
    const result = parseHar(text);
    if (!result.ok) {
      setError(result.message);
      setHar(null);
      setSelectedIndex(null);
      return;
    }
    setError(null);
    setHar(result.har);
    setSelectedIndex(result.har.log.entries.length > 0 ? 0 : null);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      const v = await validateFile(file, {
        maxBytes: MAX_BYTES,
        kind: 'text',
        acceptExtensions: ['.har', '.json'],
      });
      if (!v.ok) {
        setError(v.message);
        return;
      }
      loadText(await v.file.text());
    },
    [loadText]
  );

  // サニタイズ結果（トグル変更で再計算）
  const sanitized = useMemo(() => (har ? sanitizeHar(har, enabled) : null), [har, enabled]);

  const outputJson = useMemo(
    () => (sanitized ? JSON.stringify(sanitized.har, null, 2) : ''),
    [sanitized]
  );

  const totalRedacted = sanitized ? Object.values(sanitized.counts).reduce((a, b) => a + b, 0) : 0;

  const selectedEntry =
    sanitized && selectedIndex != null ? sanitized.har.log.entries[selectedIndex] : null;

  const handleReset = useCallback(() => {
    setHar(null);
    setError(null);
    setSelectedIndex(null);
  }, []);

  return (
    <div className="space-y-6">
      {/* 入力 */}
      <div
        className="rounded border border-dashed border-default p-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
      >
        <p className="mb-3 text-muted">HAR ファイルをドラッグ&ドロップ、または選択</p>
        <FileInputButton
          accept=".har,.json,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        >
          ファイルを選択
        </FileInputButton>
        <p className="caption mt-2 text-muted">ファイルはブラウザ外に送信されません（最大 25MB）</p>
      </div>

      {error && <ErrorMessage message={error} />}

      {sanitized && har && (
        <>
          {/* サマリ */}
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              リクエスト: <strong>{har.log.entries.length}</strong> 件
            </span>
            <span>
              redact: <strong>{totalRedacted}</strong> 件
            </span>
          </div>

          {/* redact トグル */}
          <ToggleChips
            legend="redact 対象"
            options={HAR_REDACT_CATEGORIES.map((cat) => ({
              value: cat,
              label: HAR_REDACT_LABEL[cat],
              count: sanitized.counts[cat],
            }))}
            selected={(c) => enabled[c]}
            onToggle={handleToggle}
          />

          {/* 一覧 */}
          <HarEntryList
            entries={sanitized.har.log.entries}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />

          {/* 詳細 */}
          {selectedEntry && <HarEntryDetail entry={selectedEntry} />}

          {/* 出力 */}
          <div className="flex flex-wrap justify-end gap-2">
            <CopyButton text={outputJson} label="サニタイズ済み HAR をコピー" />
            <DownloadButton
              onClick={() => downloadText(outputJson, 'sanitized.har', 'application/json')}
              label="サニタイズ済み HAR をダウンロード"
            />
            <ClearButton onClick={handleReset} />
          </div>
        </>
      )}
    </div>
  );
}
```

> 注: `ClearButton` / `ErrorMessage` / `CopyButton` の prop は実装時に各コンポーネントの定義で確認する（`SecretScrubber.tsx` が参考）。意味クラス（`border-default` / `text-muted` / `bg-subtle` / `bg-active`）は `global.css` の定義を確認し、無ければ既存ツールで使われている近い名前に合わせる。

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

- [ ] **Step 3: lint**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add src/components/tools/HarViewer.tsx
git commit -m "feat: HAR ビューア親コンポーネントを追加"
```

---

## Task 9: Astro ページ

**Files:**

- Create: `src/pages/tools/har-viewer.astro`

- [ ] **Step 1: ページを書く**

`clipboard-inspector.astro` を踏襲する。

```astro
---
import ToolLayout from '@/layouts/ToolLayout.astro';
import ToolInfoSection from '@/components/ui/ToolInfoSection.astro';
import { HarViewer } from '@/components/tools/HarViewer';
import { tools } from '@/data/tools';

const tool = tools.find((t) => t.slug === 'har-viewer')!;
---

<ToolLayout tool={tool}>
  <HarViewer client:load />

  <ToolInfoSection>
    <p class="tool-info-body">
      ブラウザの DevTools が出力する HAR（HTTP
      Archive）ファイルを読み込み、リクエスト/レスポンスを一覧・詳細表示します。Cookie・Authorization
      ヘッダ・トークン類を自動で redact した共有用 HAR
      を出力できます。ファイルはブラウザ内でのみ処理され、外部に送信されません。
    </p>
    <h3 class="mb-2 mt-4 tool-info-heading">仕組み</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>
        HAR は JSON のため <code class="rounded px-1 font-mono bg-subtle text-sm">JSON.parse</code> でパースし、log.entries
        を一覧化
      </li>
      <li>Cookie / 認証ヘッダ / 機密クエリ / POST ボディをフィールド名ベースで確実に redact</li>
      <li>本文スキャンは secret-scrubber の検出ルールで API キー・JWT・メール等を追加検出</li>
      <li>同一値は同一プレースホルダ（[REDACTED:COOKIE_1] 等）で一貫トークン化</li>
    </ul>
    <h3 class="mb-2 mt-4 tool-info-heading">ユースケース</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>不具合調査の HAR を、認証情報を消してから issue / チャットに共有</li>
      <li>API リクエスト/レスポンスの中身を一覧で素早く確認</li>
    </ul>
    <h3 class="mb-2 mt-4 tool-info-heading">制限事項</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>ウォーターフォール（タイミング可視化）は今後対応予定</li>
      <li>大きな HAR（25MB 超）は読み込めません</li>
      <li>辞書に無い独自ヘッダ名・パラメータ名は本文スキャンが拾える範囲のみ redact されます</li>
    </ul>
  </ToolInfoSection>
</ToolLayout>
```

- [ ] **Step 2: data/tools.ts にエントリ追加**

`src/data/tools.ts` の `toolEntries` 配列末尾（`key-converter` の後）に追加:

```typescript
  {
    slug: 'har-viewer',
    name: 'HARビューア＆サニタイザ',
    description:
      'HARファイルを一覧・詳細表示し、Cookie・認証ヘッダ・トークン類を自動redactした共有用HARを出力します。ファイルはブラウザ外に送信しません',
    category: 'convert',
    yomi: 'えいちえーあーるびゅーあ',
  },
```

- [ ] **Step 3: 型チェック + ビルド確認**

Run: `node_modules/.bin/astro check && npm run build`
Expected: エラーなし、`/tools/har-viewer` が生成される

- [ ] **Step 4: コミット**

```bash
git add src/pages/tools/har-viewer.astro src/data/tools.ts
git commit -m "feat: HARビューアのページとツール登録を追加"
```

---

## Task 10: VRT ページ登録 + meta テスト

**Files:**

- Modify: `tests/e2e/visual-regression-pages.ts`

- [ ] **Step 1: PAGES に追加**

`tests/e2e/visual-regression-pages.ts` の `PAGES` 配列末尾（`/tools/key-converter` の後）に `'/tools/har-viewer',` を追加。

- [ ] **Step 2: meta テストで整合性確認**

Run: `npm run test -- tests/meta/vrt-pages-coverage.test.ts`
Expected: PASS（slug と PAGES が整合）

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/visual-regression-pages.ts
git commit -m "test: HARビューアを VRT 対象ページに登録"
```

---

## Task 11: ドキュメント更新

**Files:**

- Modify: `README.md`, `SPEC.md`, `docs/decisions.md`, `docs/tools.md`, `docs/tool-candidates.md`

- [ ] **Step 1: README ツール一覧に追加**

`README.md` のツール一覧（変換・解析カテゴリ）に HAR ビューアの行を追加する。既存行の書式に合わせる。

- [ ] **Step 2: SPEC.md を更新**

`SPEC.md` の 2.3（依存ライブラリ: 新規追加なし、secret-scrubber 再利用と記載）/ 2.4（ディレクトリ: `src/utils/har/`）/ 4・5 章（ツール一覧）/ 9 章（チェックリスト）に HAR ビューアを追加。

- [ ] **Step 3: docs/tools.md に技術解説を追加**

HAR の仕組み・準拠仕様（HAR 1.2）・redact 方針・制限（ウォーターフォール未対応・25MB 上限）を記載。

- [ ] **Step 4: docs/decisions.md に決定を記録**

- 新規ライブラリを足さず secret-scrubber の `scrubText` を再利用した理由
- 構造的 redact（フィールド名辞書）＋ scrubText 併用にした理由
- ウォーターフォールを v1 から分離した理由（別 issue）

- [ ] **Step 5: docs/tool-candidates.md の S2-4 行を更新**

S2-4 の状態列に `✅ #<PR番号>` を記載（PR 番号確定後）。

- [ ] **Step 6: コミット**

```bash
git add README.md SPEC.md docs/decisions.md docs/tools.md docs/tool-candidates.md
git commit -m "docs: HARビューア追加に伴うドキュメント更新"
```

---

## Task 12: 最終検証

- [ ] **Step 1: ユニットテスト全体**

Run: `npm run test`
Expected: 全 PASS（har の parse/sanitize、vrt-pages-coverage 含む）

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

- [ ] **Step 3: lint + format チェック**

Run: `npm run lint && npm run format:check`
Expected: エラーなし（format 崩れがあれば `npm run format` で整形して再コミット）

- [ ] **Step 4: ビルド**

Run: `npm run build`
Expected: 成功

- [ ] **Step 5: Playwright で目視確認（PC 1280x800 / スマホ 390x844）**

`.agents/rules/ui-conventions.md` 3 章の手順でサンプル HAR を読み込み、一覧・詳細・トグル・出力を両サイズで確認。

- [ ] **Step 6: E2E（preview 経由）**

Run: `npm run test:e2e`
Expected: 既存 + 新規ページの a11y/スモークが PASS（VRT baseline は CI 生成のためローカル diff は許容）

---

## Self-Review（記入済み）

**1. Spec coverage:**

- パース＋スキーマ検証 → Task 3 ✓
- 一覧テーブル → Task 6 ✓
- 詳細パネル → Task 7 ✓
- 構造的 redact + scrubText → Task 4 ✓
- 共有用 HAR 出力（download/copy）→ Task 8 ✓
- redact トグル → Task 2（定義）+ Task 8（UI）✓
- サマリ統計 → Task 8 ✓
- 陽性/陰性対照テスト → Task 4 ✓
- VRT 登録 → Task 10 ✓
- ドキュメント更新 → Task 11 ✓
- ウォーターフォール分離（issue 化）→ PR 作成時に対応（plan 外・実行後手順）

**2. Placeholder scan:** Task 11 のドキュメントは「既存書式に合わせる」と指示。コード本体（Task 1-10）はすべて実コードを記載済み。意味クラス名は実装時に `global.css` で確認する旨を明記（推測で固定しない）。

**3. Type consistency:** `HarRedactCategory` / `sanitizeHar(har, enabled): { har, counts }` / `parseHar(input): { ok, har | message }` / `HAR_REDACT_CATEGORIES` 等は全 Task で一貫。`scrubText(text, DEFAULT_ENABLED)` のシグネチャは既存実装と一致。
