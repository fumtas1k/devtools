# PR-A 検出エンジン強化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HARサニタイザの検出エンジン（secret-scrubber）を強化し、JSONボディの機密漏れ(#685)・URL破壊バグ(#686)・dフラグ fail-open(#690 M-1)・多セグメントJWT残存(#690 L-1)・全角イコール非対応(#690 L-2)を修正する。

**Architecture:** URL認証情報を捉える正規表現を新モジュール `secret-scrubber/url-credential.ts` に共通化し、`scrub.ts` の `CREDENTIAL_URL` ルールと `har/sanitize.ts` の `redactUrl` の二重実装を一本化する。`CREDENTIAL_ASSIGN` 正規表現は引用符をオプション許容して JSON 形式に対応する。マスク範囲解決を `resolveMaskRange` ヘルパーに抽出し、indices 取得不可時は over-mask に倒す fail-safe にする。

**Tech Stack:** TypeScript / Vitest / 既存の `secret-scrubber` ルールパイプライン。

**Spec:** `docs/superpowers/specs/2026-06-14-har-sanitizer-hardening-design.md`

**対象ブランチ:** `claude/wonderful-mccarthy-6llg7s`（既に `origin/develop` 先端起点で作成済み）

---

## 前提・検証済み事実（実装前に把握すること）

以下はすべて実機（node）で確認済み:

- 新 `CREDENTIAL_ASSIGN`（キー名後に引用符オプション + 区切りに全角 `＝` 追加）は JSON `"password":"hunter2"` / `"client_secret"` / `"apiKey"` / `"aws_secret_access_key"`、form `password=...`、`パスワード＝...`、`password: ...` を捕捉し、非機密の `description: ...` は捕捉しない。
- 共有 URL 認証 regex `((?:scheme:)?//[^/\s:@]+:)([^/\s]+)(@host)` は次を正しく処理する:
  - `https://host:8080/redirect?to=https://u:p@evil.com` → 内側 `u:p` の `p` のみ redact、外側 `host:8080` とパスは無傷
  - `https://host:8080/p@th` → 無変更（URL破壊しない）
  - `https://user:pa@ss@host.com/path` → `pa@ss` を完全 redact（断片 `ss` を残さない）
  - `//user:pass@host.com/`（protocol-relative）→ `pass` を redact
  - `https://user:secretpw@host.com/` → `secretpw` を redact
  - `https://api.example.com/v1/users` → 無変更（誤検出なし）
  - `https://user:pw@[::1]:8080/x`（IPv6）→ `pw` を redact、`[::1]:8080` 無傷
- 新 JWT 正規表現 `\beyJ[\w-]+(?:\.[\w-]+){2,}\b` は3セグメント JWT と5セグメント JWE の両方を全体マッチする。
- AWS Secret Key は新 `CREDENTIAL_ASSIGN`（`access[_-]?key` 経由）が代入文脈で捕捉する。Basic 認証 base64 は既存 `CREDENTIAL_AUTH_HEADER` が `Authorization: Basic <b64>` で捕捉する。よって両者に専用ルールは追加しない（DRY）。

## File Structure

- 新規: `src/utils/secret-scrubber/url-credential.ts` — URL basic-auth 認証情報を捉える共有正規表現ビルダー。責務: 「URL のパスワード部を識別する単一の正規表現定義」のみ。
- 変更: `src/utils/secret-scrubber/rules.ts` — `CREDENTIAL_URL` を共有ビルダー利用に置換、`CREDENTIAL_ASSIGN` の引用符許容 + 全角＝、`JWT_TOKEN` の多セグメント化。
- 変更: `src/utils/secret-scrubber/scrub.ts` — マスク範囲解決を `resolveMaskRange` に抽出し fail-safe 化。
- 変更: `src/utils/har/sanitize.ts` — `redactUrl` の basic-auth 置換を共有ビルダー利用に置換。
- テスト: `src/utils/__tests__/secret-scrubber.test.ts`（`@/` エイリアス import）、`src/utils/har/__tests__/sanitize.test.ts`（相対 import）。

## 注意事項

- `har/sanitize.ts` は Web Worker の依存グラフに含まれるため、`@/` エイリアスではなく**相対 import** を使うこと（既存コメント `sanitize.ts:16-18` 参照）。新モジュール import は `../secret-scrubber/url-credential`。
- 各タスクは TDD（失敗するテスト→実装→緑→コミット）。コミットメッセージは Conventional Commits + 日本語。
- コミットは指定ブランチに行う。最後にまとめて push + PR 作成。

---

### Task 1: URL 認証情報の共有正規表現ビルダーを作成

**Files:**
- Create: `src/utils/secret-scrubber/url-credential.ts`
- Test: `src/utils/__tests__/secret-scrubber.test.ts`（末尾に describe 追加）

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/secret-scrubber.test.ts` の末尾に追加:

```ts
import { makeUrlCredentialRegex } from '@/utils/secret-scrubber/url-credential';

describe('makeUrlCredentialRegex', () => {
  function redact(url: string, requireScheme: boolean): string {
    const re = makeUrlCredentialRegex({ flags: 'g', requireScheme });
    return url.replace(re, (_m, pre, _pass, post) => `${pre}[X]${post}`);
  }

  it('正常 basic-auth のパスワードのみ redact しホストを残す', () => {
    expect(redact('https://user:secretpw@host.com/', false)).toBe('https://user:[X]@host.com/');
  });

  it('host:port + 後続 @ を含む URL を破壊せず内側の認証情報のみ redact する', () => {
    expect(redact('https://host:8080/redirect?to=https://u:p@evil.com', false)).toBe(
      'https://host:8080/redirect?to=https://u:[X]@evil.com'
    );
  });

  it('パス内 @ で誤爆しない（host:port/p@th を無変更）', () => {
    expect(redact('https://host:8080/p@th', false)).toBe('https://host:8080/p@th');
  });

  it('パスワード中の @ を含めて完全に redact する（断片を残さない）', () => {
    expect(redact('https://user:pa@ss@host.com/path', false)).toBe(
      'https://user:[X]@host.com/path'
    );
  });

  it('protocol-relative URL (requireScheme:false) のパスワードを redact する', () => {
    expect(redact('//user:pass@host.com/', false)).toBe('//user:[X]@host.com/');
  });

  it('IPv6 ホストでもパスワードのみ redact しホストを残す', () => {
    expect(redact('https://user:pw@[::1]:8080/x', false)).toBe('https://user:[X]@[::1]:8080/x');
  });

  it('認証情報の無い通常 URL では何も変更しない', () => {
    expect(redact('https://api.example.com/v1/users', false)).toBe(
      'https://api.example.com/v1/users'
    );
  });

  it('requireScheme:true では scheme の無い //a:b@c や 3//4:5@6 を誤検出しない', () => {
    expect(redact('3//4:5@6.com', true)).toBe('3//4:5@6.com');
    expect(redact('//user:pass@host.com/', true)).toBe('//user:pass@host.com/');
  });

  it('requireScheme:true では scheme 付き URL のパスワードを redact する', () => {
    expect(redact('https://user:secretpw@host.com/', true)).toBe('https://user:[X]@host.com/');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- secret-scrubber`
Expected: FAIL（`makeUrlCredentialRegex` が見つからない）

- [ ] **Step 3: 最小実装を書く**

`src/utils/secret-scrubber/url-credential.ts` を新規作成:

```ts
/**
 * URL の basic-auth 認証情報（`scheme://user:password@host`）の **パスワード部** を
 * 捉える共有正規表現ビルダー。
 *
 * `secret-scrubber/scrub.ts` の CREDENTIAL_URL ルール（自由テキスト走査）と
 * `har/sanitize.ts` の redactUrl（HAR の URL フィールド）の二重実装を一本化するための
 * 単一の真実源。
 *
 * グループ構成:
 *   1: パスワード手前までの prefix（`scheme://user:`）— 残す
 *   2: パスワード — マスク対象
 *   3: `@host` — 残す（host はブラケット IPv6 `[::1]` にも対応）
 *
 * 設計上のポイント:
 * - user 部は `[^/\s:@]+`（`/` を含まない）。`https://host:8080/...@...` のポート/パスを
 *   ユーザー名やパスワードと誤認して URL を破壊する事故を防ぐ。
 * - password 部は `[^/\s]+`（`@` を許容し、host 直前の最後の `@` まで貪欲）。
 *   `user:pa@ss@host` のような生 `@` 入りパスワードでも断片を残さない。
 * - `requireScheme: true` は自由テキスト走査用。`scheme:` を必須にして
 *   `3//4:5@6` のような非 URL 断片の誤検出を防ぐ。
 * - `requireScheme: false` は HAR の URL フィールド用。protocol-relative
 *   (`//user:pass@host`) に対応する。
 */
const SCHEME = String.raw`[a-z][a-z0-9+.-]*:`;
const HOST = String.raw`(?:\[[^\]\s]+\]|[\w.-]+)`;

export function makeUrlCredentialRegex(opts: { flags: string; requireScheme: boolean }): RegExp {
  const scheme = opts.requireScheme ? SCHEME : `(?:${SCHEME})?`;
  return new RegExp(
    String.raw`(${scheme}\/\/[^/\s:@]+:)([^/\s]+)(@${HOST})`,
    opts.flags
  );
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- secret-scrubber`
Expected: PASS（追加した `makeUrlCredentialRegex` の describe が全て緑）

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add src/utils/secret-scrubber/url-credential.ts src/utils/__tests__/secret-scrubber.test.ts
git commit -m "feat: URL認証情報の共有正規表現ビルダーを追加"
```

---

### Task 2: `CREDENTIAL_URL` ルールを共有ビルダーに一本化（#686）

**Files:**
- Modify: `src/utils/secret-scrubber/rules.ts:202-212`
- Test: `src/utils/__tests__/secret-scrubber.test.ts`

- [ ] **Step 1: 失敗するテスト（multi-@ の陽性対照）を書く**

`src/utils/__tests__/secret-scrubber.test.ts` の URL 認証情報に関する既存 describe の近く（CREDENTIAL カテゴリのブロック内）に追加:

```ts
describe('CREDENTIAL_URL — multi-@ / protocol-relative の陽性対照', () => {
  it('パスワード中の @ を含む URL 認証情報を断片なく redact する', () => {
    const r = scrubText('see https://user:pa@ss@host.com/path for detail', DEFAULT_ENABLED);
    expect(r.output).not.toContain('pa@ss');
    expect(r.output).not.toContain(':pa');
    // ホストは保持される
    expect(r.output).toContain('@host.com/path');
  });

  it('host:port を含む URL を破壊せず内側の認証情報のみ redact する', () => {
    const r = scrubText('https://host:8080/redirect?to=https://u:p@evil.com', DEFAULT_ENABLED);
    expect(r.output).toContain('https://host:8080/redirect?to=https://u:');
    expect(r.output).toContain('@evil.com');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- secret-scrubber`
Expected: 旧 `CREDENTIAL_URL`（`[^@/\s]+`）は `pa@ss` の `@` で停止し断片 `ss` が残るため、1つ目のテストが FAIL。

- [ ] **Step 3: ルールを共有ビルダー利用に置換**

`src/utils/secret-scrubber/rules.ts` の冒頭 import 群（`import { shannonEntropy } from './entropy';` の直後）に追加:

```ts
import { makeUrlCredentialRegex } from './url-credential';
```

`src/utils/secret-scrubber/rules.ts:202-212` の `CREDENTIAL_URL` ルール全体を次に置換:

```ts
  {
    id: 'CREDENTIAL_URL',
    category: 'CREDENTIAL',
    // URL 認証情報: パスワード部（グループ 2）のみマスク。共有ビルダーで sanitize.ts と一本化。
    // 自由テキスト走査では scheme を必須にして非 URL 断片の誤検出を防ぐ（requireScheme: true）。
    pattern: makeUrlCredentialRegex({ flags: 'dgi', requireScheme: true }),
    maskGroup: 2,
    priority: 80,
  },
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- secret-scrubber`
Expected: PASS（multi-@ / host:port の新テスト緑、かつ既存 CREDENTIAL_URL テストも緑のまま）

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add src/utils/secret-scrubber/rules.ts src/utils/__tests__/secret-scrubber.test.ts
git commit -m "fix: URL認証情報ルールを共有ビルダーに一本化しmulti-@断片漏れを解消 (#686)"
```

---

### Task 3: `har/sanitize.ts` の `redactUrl` を共有ビルダーに置換（#686）

**Files:**
- Modify: `src/utils/har/sanitize.ts:81-86`（basic-auth 置換ブロック）
- Modify: `src/utils/har/sanitize.ts` 冒頭 import 群
- Test: `src/utils/har/__tests__/sanitize.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/har/__tests__/sanitize.test.ts` の `describe('sanitizeHar', ...)` 内に追加:

```ts
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
  expect(out.log.entries[0].request.url).not.toContain('secretpw');
  expect(out.log.entries[0].request.url).toContain('@host.com/path');
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
  expect(out.log.entries[0].request.url).toBe('https://host:8080/p@th');
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- har/__tests__/sanitize`
Expected: 旧実装は `host:8080/p@th` を `host:[REDACTED]@th` に破壊するため「退行対照」が FAIL。

- [ ] **Step 3: 共有ビルダーに置換**

`src/utils/har/sanitize.ts` の import 群（`import { scrubText } ...` 付近、相対 import で）に追加:

```ts
import { makeUrlCredentialRegex } from '../secret-scrubber/url-credential';
```

`src/utils/har/sanitize.ts:81-86` の basic-auth ブロック:

```ts
  // basic-auth: scheme://user:pass@host → pass を redact（QUERY 扱いで件数計上）
  if (enabled.QUERY) {
    result = result.replace(/(:\/\/[^/@:]+:)([^@]+)(@)/, (_m, pre, pass, post) => {
      return pre + tokenize('QUERY', pass) + post;
    });
  }
```

を次に置換:

```ts
  // basic-auth: scheme://user:pass@host → pass を redact（QUERY 扱いで件数計上）。
  // 共有ビルダーで scrub.ts の CREDENTIAL_URL と一本化。HAR の URL フィールドは
  // protocol-relative も正当なため requireScheme: false。
  if (enabled.QUERY) {
    result = result.replace(
      makeUrlCredentialRegex({ flags: 'g', requireScheme: false }),
      (_m, pre, pass, post) => pre + tokenize('QUERY', pass) + post
    );
  }
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- har/__tests__/sanitize`
Expected: PASS（新規2テスト緑 + 既存テスト緑）

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add src/utils/har/sanitize.ts src/utils/har/__tests__/sanitize.test.ts
git commit -m "fix: redactUrlのbasic-auth置換を共有ビルダーに置換しURL破壊を解消 (#686)"
```

---

### Task 4: `CREDENTIAL_ASSIGN` を引用符許容 + 全角＝対応に拡張（#685 / #690 L-2）

**Files:**
- Modify: `src/utils/secret-scrubber/rules.ts:193-201`（CREDENTIAL_ASSIGN の pattern）
- Test: `src/utils/__tests__/secret-scrubber.test.ts` と `src/utils/har/__tests__/sanitize.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/secret-scrubber.test.ts` の CREDENTIAL ブロックに追加:

```ts
describe('CREDENTIAL_ASSIGN — JSON / 全角の陽性対照（#685 / #690 L-2）', () => {
  it('JSON の "password":"value" を redact する', () => {
    const r = scrubText('{"username":"alice","password":"hunter2"}', DEFAULT_ENABLED);
    expect(r.output).not.toContain('hunter2');
    expect(r.output).toContain('"username":"alice"'); // 非機密キーは保持
  });

  it('JSON の "client_secret":"value" を redact する', () => {
    const r = scrubText('{"client_secret":"GOCSPX-abcdefABCDEF12"}', DEFAULT_ENABLED);
    expect(r.output).not.toContain('GOCSPX-abcdefABCDEF12');
  });

  it('全角イコール パスワード＝value を redact する', () => {
    const r = scrubText('パスワード＝secret123', DEFAULT_ENABLED);
    expect(r.output).not.toContain('secret123');
  });

  it('退行対照: 非機密の通常文を過剰マスクしない', () => {
    const text = 'description: this is a long sentence value';
    const r = scrubText(text, DEFAULT_ENABLED);
    expect(r.output).toBe(text);
  });

  it('退行対照: form 形式 password=value は引き続き redact する', () => {
    const r = scrubText('password=myP@ssw0rd', DEFAULT_ENABLED);
    expect(r.output).not.toContain('myP@ssw0rd');
  });
});
```

`src/utils/har/__tests__/sanitize.test.ts` の `describe('sanitizeHar', ...)` に追加（HAR の JSON ボディ経路の陽性対照）:

```ts
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
  expect(out.log.entries[0].request.postData!.text).not.toContain('hunter2');
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- secret-scrubber har/__tests__/sanitize`
Expected: 旧 `CREDENTIAL_ASSIGN` は JSON / 全角＝ を拾えず FAIL。

- [ ] **Step 3: 正規表現を拡張**

`src/utils/secret-scrubber/rules.ts:193-201` の `CREDENTIAL_ASSIGN` ルールの `pattern` を次に置換（キー名直後に引用符 `"`/`'` をオプション許容、区切りクラスに全角 `＝` を追加）:

```ts
    pattern:
      /(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|credential|パスワード|シークレット|トークン|秘密鍵|認証キー)(?:["'])?\s*[:=：＝]\s*['"]?([^\s'",;]{6,})/dgi,
```

（`maskGroup: 1` と `priority: 80` は変更しない。コメントの「日本語キー名・全角コロンにも対応」は「日本語キー名・全角コロン/イコール・JSON 形式にも対応」に更新する。）

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- secret-scrubber har/__tests__/sanitize`
Expected: PASS（JSON / 全角 / 退行 すべて緑）

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add src/utils/secret-scrubber/rules.ts src/utils/__tests__/secret-scrubber.test.ts src/utils/har/__tests__/sanitize.test.ts
git commit -m "fix: CREDENTIAL_ASSIGNを引用符許容・全角＝対応にしJSON機密漏れを解消 (#685, #690)"
```

---

### Task 5: `JWT_TOKEN` を多セグメント（JWE）対応にする（#690 L-1）

**Files:**
- Modify: `src/utils/secret-scrubber/rules.ts:224-229`（JWT_TOKEN の pattern）
- Test: `src/utils/__tests__/secret-scrubber.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/secret-scrubber.test.ts` の JWT に関するブロック付近に追加:

```ts
describe('JWT_TOKEN — 多セグメント（JWE）の陽性対照（#690 L-1）', () => {
  it('5セグメント JWE を末尾セグメントを残さず全体 redact する', () => {
    // 裸の JWE（機密キーワードの prefix を付けない）で JWT_TOKEN ルール単体を分離する。
    // `token=<jwe>` 形式だと Task4 拡張後の CREDENTIAL_ASSIGN が先に値全体を捕捉して
    // union マージし、旧 JWT_TOKEN でも PASS してしまい陽性対照にならないため。
    const jwe = 'eyJhbGciOiJSU0Et.QUFB.QkJC.Q0ND.RERE';
    const r = scrubText(jwe, DEFAULT_ENABLED);
    expect(r.output).not.toContain('RERE'); // 末尾の暗号文/タグが残らない
    expect(r.output).not.toContain(jwe);
  });

  it('退行対照: 通常の3セグメント JWT は引き続き redact する', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QTabc';
    const r = scrubText(jwt, DEFAULT_ENABLED);
    expect(r.output).not.toContain(jwt);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- secret-scrubber`
Expected: 旧 `JWT_TOKEN`（3セグメント固定）は JWE の先頭3セグメントしかマッチせず末尾 `RERE` が残るため FAIL。

- [ ] **Step 3: 正規表現を多セグメント化**

`src/utils/secret-scrubber/rules.ts:224-229` の `JWT_TOKEN` ルールの `pattern` を次に置換:

```ts
    // 3セグメント JWT に加え、4〜5セグメントの JWE も末尾まで全体マッチする
    pattern: /\beyJ[\w-]+(?:\.[\w-]+){2,}\b/g,
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- secret-scrubber`
Expected: PASS

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add src/utils/secret-scrubber/rules.ts src/utils/__tests__/secret-scrubber.test.ts
git commit -m "fix: JWT検出を多セグメント化しJWE末尾セグメント残存を解消 (#690)"
```

---

### Task 6: マスク範囲解決を `resolveMaskRange` に抽出し fail-safe 化（#690 M-1）

**Files:**
- Modify: `src/utils/secret-scrubber/scrub.ts:48-95`（`resolveMaskRange` 追加 + maskGroup 分岐の置換）
- Test: `src/utils/__tests__/secret-scrubber.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/secret-scrubber.test.ts` の import に `resolveMaskRange` を追加:

```ts
import { scrubText, resolveMaskRange } from '@/utils/secret-scrubber/scrub';
```

末尾に追加:

```ts
describe('resolveMaskRange — d フラグ fail-safe（#690 M-1）', () => {
  it('indices が取れない場合はマッチ全体を over-mask する（漏えい方向に倒さない）', () => {
    // d フラグ非対応環境を模した、.indices を持たないマッチ
    const fake = Object.assign(['Bearer abc12345', 'abc12345'], {
      index: 7,
    }) as unknown as RegExpExecArray;
    expect(resolveMaskRange(fake, 1)).toEqual({
      value: 'Bearer abc12345',
      start: 7,
      end: 7 + 'Bearer abc12345'.length,
    });
  });

  it('indices があればグループ範囲を使う', () => {
    const re = /authorization\s*:\s*([a-z0-9]+)/dgi;
    const m = re.exec('authorization: abc123')!;
    const r = resolveMaskRange(m, 1);
    expect(r.value).toBe('abc123');
    expect('authorization: abc123'.slice(r.start, r.end)).toBe('abc123');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- secret-scrubber`
Expected: FAIL（`resolveMaskRange` が export されていない）

- [ ] **Step 3: ヘルパー抽出 + fail-safe 化**

`src/utils/secret-scrubber/scrub.ts` の `scrubText` 関数定義の直前（`export function scrubText` の上）に追加:

```ts
/**
 * maskGroup ルールのマスク範囲を解決する。
 * d フラグ（match indices）が取れない環境では、マッチ全体を over-mask する
 * fail-safe に倒す（漏えい方向のフェイルを安全方向へ反転する）。#690 M-1。
 */
export function resolveMaskRange(
  m: RegExpExecArray,
  maskGroup: number
): { value: string; start: number; end: number } {
  const groupRange = m.indices?.[maskGroup];
  if (groupRange && m[maskGroup] != null) {
    return { value: m[maskGroup], start: groupRange[0], end: groupRange[1] };
  }
  return { value: m[0], start: m.index, end: m.index + m[0].length };
}
```

`src/utils/secret-scrubber/scrub.ts:64-76` の maskGroup 分岐:

```ts
      if (rule.maskGroup != null) {
        // グループのみマスク（キー名・URLホストは残す）。
        // 位置は d フラグの indices から取る（indexOf による探索は
        // キー名と値が同一文字列のとき値側を取り違えて漏えいするため不可）
        const groupRange = m.indices?.[rule.maskGroup];
        if (!groupRange) continue;
        maskValue = m[rule.maskGroup];
        [maskStart, maskEnd] = groupRange;
      } else {
        maskValue = m[0];
        maskStart = m.index;
        maskEnd = m.index + m[0].length;
      }
```

を次に置換:

```ts
      if (rule.maskGroup != null) {
        // グループのみマスク（キー名・URLホストは残す）。位置は d フラグの indices から取る。
        // indices が取れない環境では resolveMaskRange がマッチ全体に倒す（fail-safe over-mask）。
        const range = resolveMaskRange(m, rule.maskGroup);
        maskValue = range.value;
        maskStart = range.start;
        maskEnd = range.end;
      } else {
        maskValue = m[0];
        maskStart = m.index;
        maskEnd = m.index + m[0].length;
      }
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- secret-scrubber`
Expected: PASS

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add src/utils/secret-scrubber/scrub.ts src/utils/__tests__/secret-scrubber.test.ts
git commit -m "fix: maskGroupのindices取得不可時をover-maskにfail-safe化 (#690)"
```

---

### Task 7: 全体検証・push・PR 作成

- [ ] **Step 1: ユニットテスト全件**

Run: `npm run test`
Expected: 全 PASS

- [ ] **Step 2: 型チェック全体**

Run: `node_modules/.bin/astro check`
Expected: 0 errors / 0 warnings / 0 hints

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 4: E2E（サニタイザ関連）**

Run: `npm run test:e2e -- secret-scrubber har-viewer`
Expected: PASS（UI 無変更のため挙動不変）。※ E2E が環境都合で流せない場合はその旨を報告し CI に委ねる。

- [ ] **Step 5: push**

```bash
git push -u origin claude/wonderful-mccarthy-6llg7s
```

- [ ] **Step 6: PR 作成**

`--base develop` で PR を作成する（GitHub MCP の `create_pull_request` または `gh pr create --base develop --body-file <tmpdir>/pr_body.md`）。本文は日本語で、対象 issue（#685 / #686 / #690 の M-1・L-1・L-2）と「PR-A: 検出エンジン強化」である旨、検証結果を記載する。Closes は #685 / #686 を記載（#690 は PR-B/PR-C でも一部対応するため Closes せず参照に留める）。

---

## Self-Review（計画作成者によるチェック結果）

- **Spec coverage**: #685=Task4 / #686=Task1-3 / #690 M-1=Task6 / #690 L-1=Task5 / #690 L-2=Task4。AWS Secret・Basic base64 は前提節で既存カバーを明記（DRY のため専用ルール不要）。全項目に対応タスクあり。
- **Placeholder scan**: TODO/TBD なし。全コードブロックに実コードを記載。
- **Type consistency**: `makeUrlCredentialRegex({ flags, requireScheme })` のシグネチャは Task1/2/3 で一致。`resolveMaskRange(m, maskGroup): {value,start,end}` は Task6 の定義・テスト・利用で一致。`CREDENTIAL_URL` の `maskGroup: 2`（3グループ化）と Task1 のグループ構成（1=prefix, 2=password, 3=@host）が一致。
