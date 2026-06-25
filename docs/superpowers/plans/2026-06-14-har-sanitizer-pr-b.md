# PR-B カバレッジ拡張 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HARサニタイザの走査カバレッジを広げ、辞書外ヘッダ・URLパス・`response.redirectURL`・辞書外クエリ（#687/#689）の機密漏れと、base64 バイナリ本文の破壊回避（#690 M-2）を解消する。

**Architecture:** `secret-scrubber` の ReDoS は PR-C で解消済みのため、`scrubText` の適用箇所を安全に拡張できる。`har/sanitize.ts` に `scrubInto`（scrubText 適用 + counts 加算）ヘルパーを導入し、(1) 辞書外ヘッダ値、(2) URL のパス以降（host は保持）、(3) `redirectURL` に適用する。辞書（`har/rules.ts`）を拡充し、base64 判定を mimeType ベースに拡張する。

**Tech Stack:** TypeScript / Vitest / 既存 `secret-scrubber.scrubText` / `har` redact パイプライン。

**Spec:** `docs/superpowers/specs/2026-06-14-har-sanitizer-hardening-design.md`（PR-B 節）

**対象ブランチ:** `feat/har-sanitizer-coverage`（`origin/develop` 先端 = PR-A + PR-C マージ済み起点で作成済み）

---

## 設計判断（実装前に把握すること）

- **ヘッダ fallback 走査**: `redactHeaders` の if/else 連鎖に最終 `else` を追加し、辞書外ヘッダ値に `scrubText` を適用する。**`enabled.AUTH_HEADER` で gate** し、件数は `counts.AUTH_HEADER` に加算（「認証ヘッダ」トグルの意味的拡張＝ヘッダ値の機密走査）。
- **URL パス走査**: `redactUrl` に、scheme://authority（host・port・basic-auth プレースホルダ）を保持しつつ**パス以降（path?query#fragment）のみ** `scrubText` する処理を追加。**`enabled.QUERY` で gate**、件数は `counts.QUERY`。これにより #687（パス内トークン）と #689b（辞書外クエリ名の JWT/API キー）を同時に解消する。
- **#689 辞書拡充**: `SENSITIVE_PARAM_NAMES` に辞書外名を追加（構造的 redact 用。低エントロピー値も名前一致で確実に redact）。
- **redirectURL**: `HarResponse` 型に `redirectURL?: string` を追加し、response 処理で `redactUrl` を適用（`enabled.QUERY` gate）。
- **base64 skip 拡張（#690 M-2）**: 本文スキャンのスキップ条件を「`encoding === 'base64'` **または** mimeType がバイナリ系」に拡張。`isBinaryMimeType` ヘルパーで判定。
- **過剰マスクの許容**: パス/ヘッダへの scrubText 適用で、URL パスや独自ヘッダ内の IP・メール・高エントロピー文字列も redact されうる。**漏えい方向ではなく安全側**（over-masking）であり、host（authority）は保持するため URL の可読性は維持される。既知の挙動として spec/PR に明記する。
- **counts のスレッド**: scrubText の findings を集計するため、`redactUrl` と `redactHeaders` に `counts` を引数で渡す（既存 `tokenize` は counts を closure で更新するが、scrubText は別途加算が必要）。

## File Structure

- 変更: `src/utils/har/rules.ts` — `AUTH_HEADER_NAMES` / `COOKIE_HEADER_NAMES` / `SENSITIVE_PARAM_NAMES` 拡充。
- 変更: `src/utils/har/types.ts` — `HarResponse` に `redirectURL?: string`。
- 変更: `src/utils/har/sanitize.ts` — `scrubInto` / `isBinaryMimeType` / `scrubUrlPath` ヘルパー追加、`redactUrl`/`redactHeaders` に `counts` をスレッド、response の `redirectURL` 処理と base64 判定拡張。
- テスト: `src/utils/har/__tests__/sanitize.test.ts` — 各カバレッジの陽性対照 + 退行対照。

## 注意事項

- `har/sanitize.ts` は Web Worker 依存グラフのため import は相対パス（`@/` 禁止）。`scrubText`/`DEFAULT_ENABLED` は既存 import を流用。
- `test-gates` 準拠: 各カバレッジに「修正前は漏れていた入力が確実に redact される」陽性対照を併設。
- コミットは Conventional Commits + 日本語。明示パスのみ stage。コミット前に `git config user.email noreply@anthropic.com && git config user.name Claude` を確認。

---

### Task 1: 辞書拡充（#687a / #689a）

**Files:**

- Modify: `src/utils/har/rules.ts`（`COOKIE_HEADER_NAMES` / `AUTH_HEADER_NAMES` / `SENSITIVE_PARAM_NAMES`）
- Test: `src/utils/har/__tests__/sanitize.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/har/__tests__/sanitize.test.ts` の `describe('sanitizeHar', ...)` 内に追加:

```ts
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
  expect(out.log.entries[0].request.headers[0].value).not.toContain(secret);
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
  expect(out.log.entries[0].request.queryString[0].value).not.toBe(secret);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- har/__tests__/sanitize`
Expected: 旧辞書では `x-amz-security-token` / `assertion` が未収載のため FAIL。

- [ ] **Step 3: 辞書を拡充**

`src/utils/har/rules.ts` の各 Set を置換:

```ts
/** Cookie を運ぶヘッダ名（小文字比較）。COOKIE カテゴリで redact する。 */
export const COOKIE_HEADER_NAMES = new Set(['cookie', 'set-cookie', 'cookie2', 'set-cookie2']);
```

```ts
/** 認証系ヘッダ名（小文字比較）。AUTH_HEADER カテゴリで redact する。 */
export const AUTH_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
  'x-amz-security-token',
  'x-amz-credential',
  'x-session-token',
  'x-access-token',
  'x-refresh-token',
  'x-functions-key',
  'www-authenticate',
  'proxy-authenticate',
]);
```

`SENSITIVE_PARAM_NAMES` には既存要素に続けて以下を追加（既存の閉じ括弧前に挿入）:

```ts
  'next',
  'redirect',
  'continue',
  'return_to',
  'assertion',
  'saml_response',
  'jwt',
  'auth',
  'session_state',
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- har/__tests__/sanitize`
Expected: PASS

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add src/utils/har/rules.ts src/utils/har/__tests__/sanitize.test.ts
git commit -m "feat: HAR redact 辞書を拡充（認証ヘッダ・機密クエリ名） (#687, #689)"
```

---

### Task 2: `scrubInto` ヘルパー導入と既存 scrubText 呼び出しの集約（リファクタ・behavior preserving）

**Files:**

- Modify: `src/utils/har/sanitize.ts`

- [ ] **Step 1: `scrubInto` ヘルパーを追加し既存呼び出しを置換**

`src/utils/har/sanitize.ts` の `redactHeaders` 関数定義の直前に追加:

```ts
/**
 * value に scrubText を適用し、findings 件数を counts[category] に加算して
 * redact 済み文字列を返す（findings が無ければ原文を返す）。
 */
function scrubInto(
  value: string,
  counts: Record<HarRedactCategory, number>,
  category: HarRedactCategory
): string {
  const r = scrubText(value, DEFAULT_ENABLED);
  if (r.findings.length > 0) {
    counts[category] += r.findings.length;
    return r.output;
  }
  return value;
}
```

`sanitizeHar` 内の postData.text 処理（現状）:

```ts
if (typeof request.postData.text === 'string') {
  const r = scrubText(request.postData.text, DEFAULT_ENABLED);
  if (r.findings.length > 0) {
    request.postData.text = r.output;
    counts.BODY += r.findings.length;
  }
}
```

を置換:

```ts
if (typeof request.postData.text === 'string') {
  request.postData.text = scrubInto(request.postData.text, counts, 'BODY');
}
```

content.text 処理（現状の `if (enabled.BODY_SCAN && ...) { const r = scrubText(...) ... }` の中身）の scrubText 部分:

```ts
const r = scrubText(content.text, DEFAULT_ENABLED);
if (r.findings.length > 0) {
  content.text = r.output;
  counts.BODY_SCAN += r.findings.length;
}
```

を置換:

```ts
content.text = scrubInto(content.text, counts, 'BODY_SCAN');
```

- [ ] **Step 2: 既存テストが緑のままか確認（behavior preserving）**

Run: `npm run test -- har/__tests__/sanitize`
Expected: 既存テスト全 PASS（挙動不変）

- [ ] **Step 3: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 4: コミット**

```bash
git add src/utils/har/sanitize.ts
git commit -m "refactor: scrubText 適用を scrubInto ヘルパーに集約"
```

---

### Task 3: 辞書外ヘッダ値への scrubText フォールバック（#687b）

**Files:**

- Modify: `src/utils/har/sanitize.ts`（`redactHeaders` に `counts` 引数追加 + 最終 else）
- Test: `src/utils/har/__tests__/sanitize.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
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
  expect(out.log.entries[0].request.headers[0].value).not.toContain(jwt);
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
  expect(out.log.entries[0].request.headers[0].value).toBe('ja-JP,ja;q=0.9');
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- har/__tests__/sanitize`
Expected: 旧実装は辞書外ヘッダを素通しするため陽性対照が FAIL（退行対照は PASS）。

- [ ] **Step 3: `redactHeaders` に counts 引数と最終 else を追加**

`redactHeaders` のシグネチャを変更（`counts` を追加）:

```ts
function redactHeaders(
  headers: HarNameValue[],
  enabled: Record<HarRedactCategory, boolean>,
  counts: Record<HarRedactCategory, number>,
  tokenize: (c: HarRedactCategory, v: string) => string
): void {
```

`redactHeaders` 内の if/else-if 連鎖の末尾（`URL_HEADER_NAMES` の else-if の後）に最終 else を追加:

```ts
    } else if (enabled.AUTH_HEADER) {
      // 辞書外ヘッダ値に含まれる機密（JWT / API キー等）を scrubText で拾う。
      // 認証ヘッダトグルの意味的拡張（ヘッダ値の機密走査）として AUTH_HEADER で計上。
      h.value = scrubInto(h.value, counts, 'AUTH_HEADER');
    }
```

`redactUrl` 内で `redactHeaders` を呼ぶ箇所（URL_HEADER 分岐）は Task 4 で `redactUrl` 自体を変更するため一旦保留。`sanitizeHar` 内の 2 箇所の `redactHeaders(...)` 呼び出しに `counts` を渡す:

```ts
if (Array.isArray(request.headers)) redactHeaders(request.headers, enabled, counts, tokenize);
```

```ts
if (Array.isArray(response.headers)) redactHeaders(response.headers, enabled, counts, tokenize);
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- har/__tests__/sanitize`
Expected: PASS（陽性・退行とも緑、既存テストも緑）

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add src/utils/har/sanitize.ts src/utils/har/__tests__/sanitize.test.ts
git commit -m "feat: 辞書外ヘッダ値に scrubText フォールバックを適用 (#687)"
```

---

### Task 4: URL パス以降への scrubText 適用（#687c / #689b）

**Files:**

- Modify: `src/utils/har/sanitize.ts`（`scrubUrlPath` 追加、`redactUrl` に `counts` 引数 + パス走査、呼び出し側更新）
- Test: `src/utils/har/__tests__/sanitize.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
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
  const url = out.log.entries[0].request.url;
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
  expect(out.log.entries[0].request.url).not.toContain(jwt);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- har/__tests__/sanitize`
Expected: 旧 `redactUrl` はパス・辞書外クエリ名を走査しないため FAIL。

- [ ] **Step 3: `scrubUrlPath` を追加し `redactUrl` に組み込む**

`redactUrl` 関数定義の直前に追加:

```ts
/**
 * URL の scheme://authority（host・port・basic-auth）を保持しつつ、パス以降
 * （path?query#fragment）にのみ scrubText を適用する。host を潰さず URL の
 * 可読性を保ったまま、パス内トークンや辞書外クエリ名の JWT/API キーを redact する。
 */
function scrubUrlPath(url: string, counts: Record<HarRedactCategory, number>): string {
  const schemeMatch = url.match(/^[a-z][a-z0-9+.-]{0,31}:\/\//i);
  let authorityEnd: number;
  if (schemeMatch) {
    const after = schemeMatch[0].length;
    const sepIndex = url.slice(after).search(/[/?#]/);
    authorityEnd = sepIndex === -1 ? url.length : after + sepIndex;
  } else if (url.startsWith('//')) {
    const sepIndex = url.slice(2).search(/[/?#]/);
    authorityEnd = sepIndex === -1 ? url.length : 2 + sepIndex;
  } else {
    // scheme/authority 無しの相対 URL 等は全体を対象にする
    authorityEnd = 0;
  }
  const head = url.slice(0, authorityEnd);
  const tail = url.slice(authorityEnd);
  if (tail === '') return url;
  return head + scrubInto(tail, counts, 'QUERY');
}
```

`redactUrl` のシグネチャに `counts` を追加:

```ts
function redactUrl(
  url: string,
  enabled: Record<HarRedactCategory, boolean>,
  counts: Record<HarRedactCategory, number>,
  tokenize: (c: HarRedactCategory, v: string) => string
): string {
```

`redactUrl` の `return result;` の直前に追加:

```ts
// パス以降（path?query#fragment）に scrubText を適用（host は保持）。
// 構造的クエリ redact（SENSITIVE_PARAM_NAMES）の後に走らせ、placeholder は再マッチしない。
if (enabled.QUERY) {
  result = scrubUrlPath(result, counts);
}
```

`redactUrl` の全呼び出し箇所に `counts` を渡すよう更新:

- `redactHeaders` 内の URL_HEADER 分岐: `h.value = redactUrl(h.value, enabled, counts, tokenize);`
- `sanitizeHar` 内の `request.url`: `request.url = redactUrl(request.url, enabled, counts, tokenize);`

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- har/__tests__/sanitize`
Expected: PASS（#687c / #689b の陽性対照緑、既存の URL/Referer/Location テストも緑）

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add src/utils/har/sanitize.ts src/utils/har/__tests__/sanitize.test.ts
git commit -m "feat: URLパス以降に scrubText を適用しパス内トークン/辞書外クエリを redact (#687, #689)"
```

---

### Task 5: `response.redirectURL` の redact（#687d）

**Files:**

- Modify: `src/utils/har/types.ts`（`HarResponse` に `redirectURL?`）
- Modify: `src/utils/har/sanitize.ts`（response 処理に redirectURL）
- Test: `src/utils/har/__tests__/sanitize.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
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
  const r = out.log.entries[0].response.redirectURL!;
  expect(r).not.toContain('SUPERSECRETTOKEN12345');
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- har/__tests__/sanitize`
Expected: 旧実装は redirectURL を走査しないため FAIL。

- [ ] **Step 3: 型追加と処理追加**

`src/utils/har/types.ts` の `HarResponse` に `redirectURL?: string;` を追加（`content: HarContent;` の直後）:

```ts
export interface HarResponse {
  status: number;
  statusText?: string;
  httpVersion?: string;
  headers: HarNameValue[];
  cookies: HarCookie[];
  content: HarContent;
  redirectURL?: string;
  bodySize?: number;
  [key: string]: unknown;
}
```

`src/utils/har/sanitize.ts` の response 処理（`response.cookies` 処理の後、本文スキャンの前）に追加:

```ts
// リダイレクト先 URL（Location ヘッダと同じく URL を運ぶ独立フィールド）
if (enabled.QUERY && typeof response.redirectURL === 'string' && response.redirectURL) {
  response.redirectURL = redactUrl(response.redirectURL, enabled, counts, tokenize);
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- har/__tests__/sanitize`
Expected: PASS

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add src/utils/har/types.ts src/utils/har/sanitize.ts src/utils/har/__tests__/sanitize.test.ts
git commit -m "feat: response.redirectURL を redact 対象に追加 (#687)"
```

---

### Task 6: base64 バイナリ本文のスキャンスキップ拡張（#690 M-2）

**Files:**

- Modify: `src/utils/har/sanitize.ts`（`isBinaryMimeType` 追加、本文スキャン条件拡張）
- Test: `src/utils/har/__tests__/sanitize.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
it('退行対照: encoding 欄が無くても mimeType がバイナリ系なら本文スキャンをスキップし破壊しない（#690 M-2）', () => {
  // 高エントロピー base64 風文字列だが encoding 欄なし。バイナリ mimeType なのでスキップされるべき。
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
  expect(out.log.entries[0].response.content.text).toBe(b64); // 破壊されない
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
  expect(out.log.entries[0].response.content.text).not.toContain(jwt);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- har/__tests__/sanitize`
Expected: 旧条件（`encoding !== 'base64'` のみ）では image/png + encoding 欄なしがスキャンされ HIGH_ENTROPY が base64 を破壊するため、退行対照が FAIL。

- [ ] **Step 3: `isBinaryMimeType` を追加し条件を拡張**

`src/utils/har/sanitize.ts` の `scrubInto` ヘルパー付近に追加:

```ts
/**
 * 本文走査をスキップすべきバイナリ系 mimeType か判定する。
 * base64 でエンコードされがちで、scrubText（特に HIGH_ENTROPY_BASE64）が
 * 本文を破壊しデコード不能にするのを防ぐ。
 */
function isBinaryMimeType(mimeType: unknown): boolean {
  if (typeof mimeType !== 'string') return false;
  const m = mimeType.toLowerCase().split(';')[0].trim();
  if (
    m.startsWith('image/') ||
    m.startsWith('audio/') ||
    m.startsWith('video/') ||
    m.startsWith('font/')
  ) {
    return true;
  }
  return [
    'application/octet-stream',
    'application/pdf',
    'application/zip',
    'application/gzip',
    'application/x-protobuf',
    'application/wasm',
  ].includes(m);
}
```

本文スキャンの条件（現状 `content.encoding !== 'base64'`）を拡張。該当ブロックを次に置換:

```ts
const content = response.content;
if (
  enabled.BODY_SCAN &&
  content &&
  typeof content === 'object' &&
  typeof content.text === 'string' &&
  content.encoding !== 'base64' &&
  !isBinaryMimeType(content.mimeType)
) {
  content.text = scrubInto(content.text, counts, 'BODY_SCAN');
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- har/__tests__/sanitize`
Expected: PASS（バイナリスキップの退行対照・テキストスキャンの陽性対照とも緑）

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add src/utils/har/sanitize.ts src/utils/har/__tests__/sanitize.test.ts
git commit -m "fix: バイナリmimeTypeの本文はencoding欄が無くてもスキャンをスキップ (#690)"
```

---

### Task 7: ドキュメント更新・全体検証・push・PR 作成

- [ ] **Step 1: tools.md / decisions.md の確認**

`docs/tools.md` の HAR ビューア節に、カバレッジ拡張（辞書外ヘッダ・URLパス・redirectURL・base64 バイナリ skip）の挙動を 1〜2 文追記する（既存 HAR 記述がある場合）。`.agents/rules/common.md` 4 章のドキュメント更新ルールに従う。挙動変更のため `docs/decisions.md` に over-masking（パス/ヘッダの IP・メール redact は安全側）の判断を 1 エントリ追記。

- [ ] **Step 2: ユニットテスト全件**

Run: `npm run test`
Expected: 既知の環境依存（`sw-cache-version` / `codex-git-add-files` 計3件）以外 全 PASS

- [ ] **Step 3: 型チェック・format・Lint**

Run: `node_modules/.bin/astro check` / `npm run format:check` / `npm run lint`
Expected: 0/0/0・クリーン（format:check が落ちたら `npm run format` 後に再コミット）

- [ ] **Step 4: E2E（サニタイザ関連）**

Run: `npm run test:e2e -- har-viewer`
Expected: PASS（UI 不変）。流せない場合は CI に委ねる旨を報告。

- [ ] **Step 5: push**

```bash
git push -u origin feat/har-sanitizer-coverage
```

- [ ] **Step 6: PR 作成**

`--base develop` で PR 作成（GitHub MCP `create_pull_request`）。本文は日本語で、#687 / #689 を Closes、#690 は M-2 を対応（残り L-3 は据置）、3 PR 分割の 3/3 である旨、over-masking の既知挙動、各カバレッジの陽性対照を記載。

---

## Self-Review（計画作成者によるチェック結果）

- **Spec coverage**: #687a/b/c/d = Task1/3/4/5、#689a/b = Task1/4、#690 M-2 = Task6。全項目に対応タスクあり。
- **Placeholder scan**: TODO/TBD なし。全コードブロックに実コード。
- **Type consistency**: `scrubInto(value, counts, category)` は Task2 定義、Task3/4/6 で利用一致。`redactHeaders`/`redactUrl` の `counts` 引数追加は Task2/3/4 で呼び出し側も更新。`scrubUrlPath(url, counts)` は Task4 定義・利用一致。`isBinaryMimeType(mimeType)` は Task6 定義・利用一致。`redirectURL?: string` 型は Task5 で追加し同 Task で利用。
- **依存順序**: Task2（scrubInto / counts スレッド基盤）→ Task3/4（counts を使う）→ Task5（redactUrl を使う）の順。Task3 で redactUrl 呼び出しの counts 追加は Task4 で redactUrl 自体に counts を追加するまで型不整合になるため、**Task3 では sanitizeHar の redactHeaders 呼び出しのみ counts 追加、redactUrl の counts 追加と全呼び出し更新は Task4 でまとめて行う**（Task3 の redactHeaders 内 URL_HEADER 分岐は既存の `redactUrl(h.value, enabled, tokenize)` のままにし、Task4 で `counts` を挿入）。各 Task 完了時に `astro check` 0 errors を確認することで型不整合を検出する。
