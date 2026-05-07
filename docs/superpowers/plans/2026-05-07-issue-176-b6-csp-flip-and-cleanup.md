# #176 B 案 PR 6 (CSP flip + cleanup) Implementation Plan

> **⚠️ scope 縮小 (実施結果)**: PR 6 実施中に Astro `<element style="...">` 属性 65 件 / 15 ファイルが未移行で残存していたことが E2E (CSP `style-src 'self'` 違反) で発覚し、本 plan の **Phase A (CSP flip + test 反転 + stripMetaStyleSrc 撤去) と Phase C (decisions.md [067])** は drop して後続 PR に委譲した。実施したのは **Phase B のみ** (`styles.ts` 削除 + migration tracker glob 化)。詳細は spec の post-mortem ヘッダ参照。本 plan は historical record として残す。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `public/_headers` から `style-src 'unsafe-inline'` を撤廃し、A-1 で導入した暫定 strip integration / progressive migration tracker / `styles.ts` を削除して B 案 (`#176` アプローチ B) シリーズを終端する。

**Architecture:** test 側を先に strict 化 → 本体 flip / `stripMetaStyleSrc` 撤去を同 commit にアトミック反映 → cleanup (削除中心) → `docs/decisions.md` [067] に B 案完了記録。VRT の pixel diff は CSS 出力不変のため出ない想定だが、出たら `update-visual-baseline.yml` の `workflow_dispatch` で baseline 更新 commit を同 PR に追加。

**Tech Stack:** Astro 5 / Vite / vitest / Playwright / Cloudflare Pages CSP (`public/_headers`) / Astro `security.csp` auto-hash (`<meta http-equiv="content-security-policy">`).

**Spec:** `docs/superpowers/specs/2026-05-07-issue-176-b6-csp-flip-and-cleanup-design.md`

**Worktree:** `.claude/worktrees/issue-176-b6/`
**Branch:** `feature/issue-176-b6-csp-flip-and-cleanup`
**Base:** `origin/develop` (PR `--base develop` 必須)

---

## File Inventory

| 種別       | パス                                                 | 役割                                                                                     |
| ---------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| modify     | `public/_headers`                                    | CSP の `style-src 'unsafe-inline'` 撤去                                                  |
| modify     | `src/utils/csp.ts`                                   | `PRODUCTION_CSP` を `_headers` と同期 + JSDoc 追記                                       |
| modify     | `astro.config.mjs`                                   | `stripMetaStyleSrc` 関数定義 + integrations 配列呼出 + 未使用 import 削除 / コメント更新 |
| **delete** | `src/utils/styles.ts`                                | 全 import 元消滅済の orphan file 削除                                                    |
| modify     | `src/utils/__tests__/inline-style-migration.test.ts` | `MIGRATED_FILES` array → `glob('src/components/**/*.tsx')` 全件カバー                    |
| modify     | `src/utils/__tests__/headers.test.ts`                | style-src を strict assert に反転 (`'unsafe-inline'` 不在)                               |
| modify     | `src/utils/__tests__/meta-csp.test.ts`               | style-src 不在 assert → strict 形式 (`'self'` + `sha256-`) assert に反転                 |
| modify     | `src/utils/__tests__/astro-config-csp.test.ts`       | `stripMetaStyleSrc` 関連 2 test 削除 + JSDoc 更新                                        |
| modify     | `docs/decisions.md`                                  | 末尾に [067] エントリ追加 (B 案完了記録)                                                 |

---

## 着手前 checklist (Task 0)

### Task 0: 着手前 pre-condition の最終確認

**Files:** (read-only verification, no edits)

- [ ] **Step 1: 現在の worktree が `feature/issue-176-b6-csp-flip-and-cleanup` で清潔か確認**

```bash
cd /Users/fumta/projects/devtools/.claude/worktrees/issue-176-b6
git status
git branch --show-current
```

Expected:

- `On branch feature/issue-176-b6-csp-flip-and-cleanup`
- `nothing to commit, working tree clean` (spec commit `e9b3f87` のみ origin/develop 上に乗っている)

- [ ] **Step 2: 本コード上の inline style が 0 件であること再確認**

```bash
grep -rn --include='*.tsx' 'style={{' src/
```

Expected: **0 行** (テストファイル内の文字列リテラルは `--include='*.tsx'` で対象外)

- [ ] **Step 3: `@/utils/styles` import 元が無いこと再確認**

```bash
grep -rn "from '@/utils/styles'" src/ tests/
grep -rn "@/utils/styles\|utils/styles'" src/ tests/
```

Expected: **0 行**（spec §7.4 の事前条件。1 件でも残れば PR スコープに追加検討）

- [ ] **Step 4: develop に追従しているか確認**

```bash
git fetch origin develop
git rev-parse origin/develop
git merge-base HEAD origin/develop
```

Expected: 上 2 行が一致 (= ベース develop と同期済)

- [ ] **Step 5: PR 5b マージ済 + #262 close 済を再確認**

```bash
gh pr view 286 --json state,mergedAt --jq '{state, mergedAt}'
gh issue view 262 --json state --jq '.state'
```

Expected:

- PR #286: `state: MERGED`, `mergedAt` 非 null
- Issue #262: `state: CLOSED`

- [ ] **Step 6: node_modules 健全性確認**

```bash
ls node_modules/.package-lock.json > /dev/null && echo "ok"
```

Expected: `ok` (SessionStart hook 由来 `npm ci` 完了状態)。fail なら `npm ci` を実行。

---

## Phase A: CSP flip (test → 本体 を同 commit にまとめる)

> spec §Step 1〜2 — test 修正と実体 flip は **同 commit** にまとめる (中間 commit が test red になる bisect ノイズを避ける)。

### Task 1: `headers.test.ts` の style-src を strict assert に反転

**Files:**

- Modify: `src/utils/__tests__/headers.test.ts:89-94`

- [ ] **Step 1: 該当 it block を strict assert に置換**

`src/utils/__tests__/headers.test.ts` の line 89〜94 を以下に置換 (Edit tool 使用):

old (現状の lines 89〜94):

```ts
it("style-src は 'unsafe-inline' を許可（React/Astro のインラインスタイル運用上必要）", () => {
  // 219+ 箇所の React `style={{...}}` と Astro `style="..."` が存在するため許可。
  // 中期的には CSS Modules / nonce 化を検討（docs/decisions.md [054] 参照）。
  expect(csp).toMatch(/style-src[^;]*'self'/);
  expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
});
```

new:

```ts
it("style-src は 'self' のみで 'unsafe-inline' 不在 (#176 B 案完了 / [067])", () => {
  // #176 B 案 (PR 1〜6) で React `style={{...}}` を全て CSS class 化し、
  // 属性ベース inline style を撲滅したため style-src も strict 化された。
  // 'unsafe-inline' を除いた hash 不要の `'self'` のみで配信する。
  // 詳細: docs/decisions.md [067]
  expect(csp).toMatch(/style-src\s+'self'\s*(;|$)/);
  expect(csp).not.toMatch(/style-src[^;]*'unsafe-inline'/);
});
```

ポイント:

- 第 1 expect は `style-src 'self'` 直後に `;` or 文字列終端を要求し、後続 token が混入しないことを構造的に保証 (現行の `[^;]*` ベースは緩く `style-src 'self' 'unsafe-inline'` でもパスする抜けがあった)。
- `script-src` の `'unsafe-inline'` 維持 test (line 79〜87) と完全一致 assert (line 100〜108) は **触らない** ([064] AND 評価設計と PRODUCTION_CSP 同期 test はそのまま)。

- [ ] **Step 2: 単体走査で fail を確認 (build 不要)**

```bash
npx vitest run src/utils/__tests__/headers.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: **FAIL** — `style-src は 'self' のみで 'unsafe-inline' 不在` の it が `_headers` の現状 `style-src 'self' 'unsafe-inline'` に対して fail する (`PRODUCTION_CSP` 完全一致 test も同時に fail する可能性あり、これは Task 2/3 の修正後に green になる)。意図通りなので **commit せず Task 2 へ進む**。

### Task 2: `meta-csp.test.ts` の style-src 不在 assert を strict 形式 assert に反転

**Files:**

- Modify: `src/utils/__tests__/meta-csp.test.ts:13-16` (JSDoc) / `:79-86` (it block)

- [ ] **Step 1: ファイル冒頭 JSDoc (line 13〜16) を更新**

old (line 13〜16):

```ts
 * astro.config.mjs の `stripMetaStyleSrc()` integration で <meta> から style-src は除去
 * している（CSP3 仕様で hash と 'unsafe-inline' が共存するとブラウザが unsafe-inline を
 * 無視するため、style-src の strict 化は B 案 PR で React style="..." 200+ 箇所の段階移行
 * と合わせて行う）。本テストでは style-src の不在も検証する。
```

new:

```ts
 * #176 B 案 (PR 6 / [067]) 完了で stripMetaStyleSrc integration を撤去済。
 * Astro security.csp は build 時に CSS の SHA-256 hash を <meta> CSP に auto 列挙するため、
 * <meta> 側でも style-src は strict layer として機能する。本テストでは
 * style-src の strict 形式 (self + sha256 hash, unsafe-inline 不在) を検証する。
```

- [ ] **Step 2: it block (line 79〜86) を strict 形式 assert に反転**

old:

```ts
it('style-src は meta から除去されている (stripMetaStyleSrc integration)', () => {
  // astro.config.mjs の stripMetaStyleSrc() で <meta> CSP から style-src を除く。
  // CSP3 仕様で hash と 'unsafe-inline' 共存時にブラウザが unsafe-inline を無視するため、
  // style-src は header 側 (`'self' 'unsafe-inline'`) のみで制御する。
  // B 案 (#176 アプローチ B) で React style="..." 200+ 箇所を移行後、
  // この strip integration 自体を削除して meta side でも strict 化する。
  expect(cspContent).not.toMatch(/style-src/);
});
```

new:

```ts
it('style-src は meta に存在し strict 形式 (self + sha256 hash, unsafe-inline 不在)', () => {
  // #176 B 案 (PR 6 / [067]) 完了で stripMetaStyleSrc integration 撤去済。
  // Astro security.csp が CSS file の SHA-256 hash を auto-allowlist するため、
  // <meta> 側でも style-src は strict layer として機能する。
  // header 側 (_headers / PRODUCTION_CSP) の style-src も `'self'` のみで AND 評価成立。
  expect(cspContent).toMatch(/style-src[^;]*'self'/);
  expect(cspContent).toMatch(/style-src[^;]*'sha256-[A-Za-z0-9+/=]+'/);
  expect(cspContent).not.toMatch(/style-src[^;]*'unsafe-inline'/);
});
```

- [ ] **Step 3: 単体走査確認は build 必須なため後段でまとめて行う**

このテストは `dist/*.html` を読むため、`npm run build` 必須。Phase D の build + test で全件確認する。

### Task 3: `astro-config-csp.test.ts` の `stripMetaStyleSrc` 関連 2 test を削除 + JSDoc 更新

**Files:**

- Modify: `src/utils/__tests__/astro-config-csp.test.ts:18` (JSDoc) / `:37-43` (test 1) / `:49-56` (test 2)

- [ ] **Step 1: JSDoc 末尾 (line 17〜18) を更新**

old (line 16〜18):

```ts
 * 参照: docs/decisions.md [064]、メモリ feedback_positive_control_for_gates.md
 *
 * #250 I-3 / PR #249 レビュー M (defensive replace callback 形式) 対応。
```

new:

```ts
 * 参照: docs/decisions.md [064]、メモリ feedback_positive_control_for_gates.md
 *
 * #250 I-3 / PR #249 レビュー M (defensive replace callback 形式) は
 * #176 B 案 PR 6 / [067] で stripMetaStyleSrc 自体を撤去したため対応 test も削除済。
 */
```

- [ ] **Step 2: `stripMetaStyleSrc` integration 存在 assert (line 37〜43) を削除**

old (line 37〜43、前後の空行含む削除):

```ts
it('`stripMetaStyleSrc()` integration が integrations 配列に含まれる', () => {
  // <meta> CSP の style-src は CSP3 の hash + unsafe-inline 共存制約により
  // strip integration で削除する設計。integration 関数自体の定義と
  // integrations 配列での呼び出しの両方を確認。
  expect(ASTRO_CONFIG_CONTENT).toMatch(/function\s+stripMetaStyleSrc\s*\(/);
  expect(ASTRO_CONFIG_CONTENT).toMatch(/stripMetaStyleSrc\s*\(\s*\)/);
});
```

→ 削除 (空行ごと)。直後の `it('vite.build.assetsInlineLimit ...)` が直接続くようにする。

- [ ] **Step 3: `stripMetaStyleSrc` の callback replace test (line 49〜56) を削除**

old (line 49〜56、ファイル末尾の閉じ `});` 直前まで):

```ts
it('stripMetaStyleSrc の full.replace は callback 形式で $ 特殊解釈を回避している (PR #249 review M / #250)', () => {
  // String.prototype.replace(string, string) の semantics で第二引数が string だと
  // $&/$1/$$ などが特殊解釈される。CSP 値に $ が混入した場合の安全網として
  // callback 形式 (() => newAttrs) で渡す実装を維持する。
  // 変数名 (attrs / newAttrs 等) には bind せず、`X.replace(Y, () => Z)` の callback パターンが使われていることだけを assert。
  // 将来 stripMetaStyleSrc 内で変数 rename されてもテストは追従する。
  expect(ASTRO_CONFIG_CONTENT).toMatch(/\.replace\([^,]+,\s*\(\)\s*=>\s*\w+\)/);
});
```

→ 削除。直前の `assetsInlineLimit` test の後に describe block 閉じ `});` だけが残る形にする。

削除後の expected 構造 (4 test):

```ts
describe('astro.config.mjs の CSP 関連設定（#176 A-1 / [064] 陽性対照 / #250 I-3）', () => {
  it('`security` ブロックが存在する', () => { ... });
  it('`security.csp` ブロックが存在する', () => { ... });
  it("`security.csp.algorithm` が 'SHA-256' に設定されている", () => { ... });
  it('`vite.build.assetsInlineLimit` が 0 に設定されている (data:font CSP 違反防止 / [063])', () => { ... });
});
```

### Task 4: `public/_headers` の `style-src 'unsafe-inline'` 撤去

**Files:**

- Modify: `public/_headers:7`

- [ ] **Step 1: line 7 の CSP ヘッダ値内 style-src を反転**

old (line 7):

```
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests
```

new:

```
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests
```

ポイント:

- `style-src 'self' 'unsafe-inline';` → `style-src 'self';` の **1 token 削減のみ**。
- script-src 側の `'unsafe-inline'` は [064] AND 評価設計に基づき **意図的に維持**。
- 冒頭コメント (line 1〜5) はそのまま維持。script-src コメント箇所が flip 後も妥当なため。

### Task 5: `src/utils/csp.ts:PRODUCTION_CSP` を同期 + JSDoc 追記

**Files:**

- Modify: `src/utils/csp.ts:14-19` (JSDoc 末尾追記) / `:24` (style-src 行)

- [ ] **Step 1: line 24 の style-src 行を反転**

old (line 24):

```ts
  "style-src 'self' 'unsafe-inline'; " +
```

new:

```ts
  "style-src 'self'; " +
```

- [ ] **Step 2: JSDoc 末尾 (line 18 と `*/` の間) に B 案完了の説明を追記**

old (line 13〜19、JSDoc 末尾の 2 段落):

```ts
 * #176 A-1 以降、script-src の 'unsafe-inline' は意図的に維持している。Astro
 * `security.csp` が生成する `<meta>` CSP が `script-src 'self' 'sha256-...'` で
 * hash-only の strict layer を提供し、ブラウザの AND 評価で実質的な strictness は
 * meta が支配する。ヘッダ側 (本定数) は AND 評価成立のための permissive 層で、
 * defense-in-depth fallback としても機能する。詳細は `docs/decisions.md` [064]。
 */
export const PRODUCTION_CSP =
```

new:

```ts
 * #176 A-1 以降、script-src の 'unsafe-inline' は意図的に維持している。Astro
 * `security.csp` が生成する `<meta>` CSP が `script-src 'self' 'sha256-...'` で
 * hash-only の strict layer を提供し、ブラウザの AND 評価で実質的な strictness は
 * meta が支配する。ヘッダ側 (本定数) は AND 評価成立のための permissive 層で、
 * defense-in-depth fallback としても機能する。詳細は `docs/decisions.md` [064]。
 *
 * #176 B 案 (PR 6 / [067]) で style-src の 'unsafe-inline' を撤去済。React の
 * `style={{...}}` を全て CSS class 化することで属性ベース inline style を撲滅し、
 * style-src も hash 不要の strict layer (`'self'` のみ) に到達した。
 */
export const PRODUCTION_CSP =
```

### Task 6: `astro.config.mjs` から `stripMetaStyleSrc` を完全撤去 + 未使用 import 削除

**Files:**

- Modify: `astro.config.mjs:1-109` (関数定義削除 + integrations 呼出削除 + import 削除 + コメント更新)

- [ ] **Step 1: 既存 109 行を以下の最終形に置換**

ファイル全体を以下に置換 (Edit tool で `old_string` = ファイル全文、`new_string` = 下記):

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://devtools-d9w.pages.dev',
  integrations: [react(), sitemap()],
  // #176 A-1: Astro built-in CSP で `<meta http-equiv="content-security-policy">` を各ページに注入し、
  // bundled scripts (Astro island loader 等の inline `<script type="module">` 含む) を自動で SHA-256 hash 化。
  // 結果として `public/_headers` の `script-src` から `'unsafe-inline'` を安全に削除できる。
  // dev mode では security.csp は無効（公式仕様）。E2E は preview ベース (#247) で評価する。
  //
  // #176 B 案 (PR 6 / [067]) 完了時点で style-src も auto-hash により strict layer 化。
  // 旧 stripMetaStyleSrc() integration は削除した (style-src も meta strict policy で制御)。
  security: {
    csp: {
      algorithm: 'SHA-256',
    },
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // #246: Vite デフォルト 4KB 未満の asset を data: URI として CSS にインライン化
      // するが、`public/_headers` の CSP は `font-src` を明示しておらず default-src 'self'
      // で data:font が block される（@fontsource/jetbrains-mono の小さな subset font (cyrillic-ext 等)
      // が該当）。inline 化を無効化し dev/preview/prod の挙動を一致させる。
      assetsInlineLimit: 0,
    },
  },
});
```

ポイント:

- 削除した import: `readFileSync` / `writeFileSync` (`node:fs`) / `fileURLToPath` (`node:url`) / `glob` (`node:fs/promises`) — `stripMetaStyleSrc` 内のみで使用。**残すと `astro check` が unused import エラーで fail する**。
- 削除した関数定義: `stripMetaStyleSrc()` 全体 (line 9〜85 相当、60+ 行)。
- 削除した integrations 配列要素: `stripMetaStyleSrc()`。
- 既存コメントブロック (`#176 A-1: Astro built-in CSP ...` 〜 `E2E は preview ベース ...`) は **そのまま維持**。末尾に B 案完了 1 段落 (`#176 B 案 (PR 6 / [067]) ...`) を追記。
- `security.csp` / `vite.build.assetsInlineLimit` は変更なし。

### Task 7: build + test で Phase A の意図通り pass を確認

**Files:** (no edits, validation only)

- [ ] **Step 1: build + vitest を全件実行**

```bash
npm run build && npm run test 2>&1 | tail -50
```

Expected: 全 test green。具体的に以下が pass:

- `headers.test.ts > public/_headers > Content-Security-Policy > style-src は 'self' のみで 'unsafe-inline' 不在` ✅
- `headers.test.ts > ... > src/utils/csp.ts の PRODUCTION_CSP と完全一致する` ✅ (両側同期した結果)
- `meta-csp.test.ts > ... > style-src は meta に存在し strict 形式` ✅ (Astro auto-hash で `<meta>` に style-src が出るため)
- `astro-config-csp.test.ts > ... > assetsInlineLimit が 0` ✅ (削除した 2 test 以外)
- `inline-style-migration.test.ts` は **まだ Task 8 で glob 化していないため現状 array ベースで pass** (PR 1〜5b の 31 件 array は満たされている)

- [ ] **Step 2: 万一 fail がある場合の対処**

`meta-csp.test.ts` の `style-src 'sha256-...'` assert が fail する可能性:

- 原因候補 1: Astro `security.csp` が style-src の auto-hash を **dist の特定ページで生成していない** (Astro の version によっては CSS file が link tag のみで inline `<style>` がないと style hash が出ない)。
- 確認: `grep -h 'http-equiv="content-security-policy"' dist/**/*.html | head -3` で実出力の CSP を見る。

確認実コマンド:

```bash
find dist -name '*.html' -exec grep -h 'http-equiv="content-security-policy"' {} \; | head -3
```

期待される一行例:

```
<meta http-equiv="content-security-policy" content="default-src 'self'; ...; style-src 'self' 'sha256-...'; ...">
```

`'sha256-` が style-src に含まれているなら test pass する。含まれない場合は spec §7.7 の expected 仕様と Astro 実出力の乖離を user に報告 (本 PR の射程を超える)。

- [ ] **Step 3: 全 green 確認後、Phase A 全 7 task を 1 commit にまとめる**

```bash
git add public/_headers src/utils/csp.ts astro.config.mjs \
        src/utils/__tests__/headers.test.ts \
        src/utils/__tests__/meta-csp.test.ts \
        src/utils/__tests__/astro-config-csp.test.ts
git status
```

期待される staged files: 6 ファイル (上記 add した順)。

```bash
git commit -m "$(cat <<'EOF'
refactor(csp): #176 B 案 PR 6 — style-src 'unsafe-inline' 撤廃 + stripMetaStyleSrc 削除

- public/_headers: style-src を 'self' のみに strict 化
- src/utils/csp.ts: PRODUCTION_CSP 同期 + B 案完了 JSDoc 追記
- astro.config.mjs: stripMetaStyleSrc() 関数定義 + integration 呼出 + 未使用 import 削除
- src/utils/__tests__/headers.test.ts: style-src 反転 ('unsafe-inline' 不在を陽性 assert)
- src/utils/__tests__/meta-csp.test.ts: style-src strict 形式 (self + sha256) assert に反転
- src/utils/__tests__/astro-config-csp.test.ts: stripMetaStyleSrc 関連 2 test 削除

Refs: docs/decisions.md [067] (本 PR で追加予定), [064]
EOF
)"
```

期待: hooks (lefthook 等) 通過 + commit 成功。fail したら hook 出力を確認し individual fix。

---

## Phase B: cleanup (`styles.ts` 削除 + migration tracker glob 化)

> spec §Step 3 — `styles.ts` 削除 と `inline-style-migration.test.ts` の glob 化を **同 commit** にまとめる (両者の連動でしか fail しない設計)。

### Task 8: `inline-style-migration.test.ts` を glob ベースに置換

**Files:**

- Modify: `src/utils/__tests__/inline-style-migration.test.ts:1-92` (全文置換)

- [ ] **Step 1: ファイル全文を以下に置換**

old: 既存 92 行 (line 1〜92)

new (全文):

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import path from 'node:path';

/**
 * #176 B 案 完了後の `style={{` / CSSOM 直接 mutation 撲滅の永続的回帰防止網。
 *
 * PR 1〜5b で漸進的に MIGRATED_FILES array を拡張してきたが、PR 6 で B 案完了に
 * 伴い array 管理を撤廃し、`src/components/**\/*.tsx` 全件を glob で自動カバー化。
 * これにより新規追加された .tsx も自動で検出網に含まれ、array 更新忘れによる
 * 偽陰性を撲滅する。
 *
 * 例外 (許容):
 * - `ref.current.style.setProperty('--var', value)` — CSSOM API 経由は許容
 *   regex は `\.style\.X = Y` のみ検出、`.style.setProperty(` は検出しない
 *
 * 参照: docs/decisions.md [067] (B 案完了の記録)
 */

// top-level await: vitest は vite-node 経由で ESM として実行されるため利用可能。
const TARGET_FILES: string[] = [];
for await (const f of glob('src/components/**/*.tsx', { cwd: process.cwd() })) {
  TARGET_FILES.push(f);
}
TARGET_FILES.sort();

describe.skipIf(TARGET_FILES.length === 0)('#176 B 案 inline style 完全撲滅 (回帰防止)', () => {
  it(`src/components/**/*.tsx を ${TARGET_FILES.length} 件カバー`, () => {
    expect(TARGET_FILES.length).toBeGreaterThan(0);
  });

  describe.each(TARGET_FILES)('%s', (file) => {
    const content = readFileSync(path.resolve(process.cwd(), file), 'utf-8');

    it('JSX inline style object (style={{) が残っていない', () => {
      expect(content).not.toMatch(/style=\{\{/);
    });

    it('DOM style 属性代入 (element.style.X = ...) が残っていない', () => {
      const matches = content.match(/\.style\.[a-zA-Z]+\s*=(?!=)/g);
      const violations = (matches ?? []).filter((m) => !m.includes('setProperty'));
      expect(violations).toEqual([]);
    });
  });
});

describe('migration detector の陽性対照', () => {
  it('意図的に style={{ を含む文字列が違反として検出される', () => {
    const malicious = `<div style={{color: 'red'}} />`;
    expect(malicious).toMatch(/style=\{\{/);
  });

  it('意図的に style.X = を含む文字列が違反として検出される', () => {
    const malicious = `el.style.background = 'red';`;
    const matches = malicious.match(/\.style\.[a-zA-Z]+\s*=(?!=)/g);
    const violations = (matches ?? []).filter((m) => !m.includes('setProperty'));
    expect(violations.length).toBeGreaterThan(0);
  });

  it('setProperty は許容パターンとしてスルーされる', () => {
    const allowed = `ref.current.style.setProperty('--var', '1');`;
    const matches = allowed.match(/\.style\.[a-zA-Z]+\s*=(?!=)/g);
    const violations = (matches ?? []).filter((m) => !m.includes('setProperty'));
    expect(violations).toEqual([]);
  });
});
```

ポイント:

- `MIGRATED_FILES` array 削除 → `TARGET_FILES`（glob 結果）に置換。
- `describe.skipIf(TARGET_FILES.length === 0)` を残すが、glob 0 件は **基本ありえない** ため `it('... を ${n} 件カバー')` で件数 > 0 を **明示 assert** 追加 (silent skip 防止、`feedback_positive_control_for_gates.md` の陽性対照原則)。
- 陽性対照 (`migration detector の陽性対照` describe block) は **完全維持** — regex 正確性の self-test は glob 化と独立。
- import に `glob` を追加。

### Task 9: `src/utils/styles.ts` を削除

**Files:**

- Delete: `src/utils/styles.ts`

- [ ] **Step 1: ファイル削除**

```bash
rm src/utils/styles.ts
```

- [ ] **Step 2: 削除確認**

```bash
find src/utils -name styles.ts
grep -rn "@/utils/styles" src/ tests/
grep -rn "from.*utils/styles'" src/ tests/
```

Expected: いずれも **0 行**。

### Task 10: build + test で Phase B の green を確認 → commit

**Files:** (validation + commit)

- [ ] **Step 1: build + test 実行**

```bash
npm run build && npm run test 2>&1 | tail -50
```

Expected:

- `inline-style-migration.test.ts` の glob ベース describe が `src/components/**/*.tsx` の件数分の `style={{` 不在 / `style.X =` 不在 assert を全件 pass
- 陽性対照 3 test も pass
- 他のテストに影響なし

- [ ] **Step 2: `astro check` で型エラー確認**

```bash
npx astro check 2>&1 | tail -20
```

Expected: `Result: 0 errors, 0 warnings`. `styles.ts` 削除に伴う型参照エラーが出ていないことを確認 (事前 grep で 0 件確認済のため出ない想定)。

- [ ] **Step 3: 全 green 確認後、Phase B を 1 commit にまとめる**

```bash
git add src/utils/styles.ts src/utils/__tests__/inline-style-migration.test.ts
git status
```

期待される staged files: 2 ファイル (1 つは削除、1 つは modify)。

```bash
git commit -m "$(cat <<'EOF'
refactor(csp): #176 B 案 PR 6 — styles.ts 削除 + migration tracker glob 化

- src/utils/styles.ts: 削除 (PR 1〜5b で全 import 元が CSS class 参照に置換完了)
- src/utils/__tests__/inline-style-migration.test.ts:
  - MIGRATED_FILES array (31 件) を await glob('src/components/**/*.tsx') に置換し全件カバー化
  - 件数 > 0 を陽性 assert で silent skip 防止
  - 陽性対照 (migration detector の陽性対照) は完全維持
EOF
)"
```

---

## Phase C: docs/decisions.md [067] 追加

### Task 11: `docs/decisions.md` 末尾に [067] エントリを追加

**Files:**

- Modify: `docs/decisions.md` (末尾追記)

- [ ] **Step 1: 既存末尾 ([066] エントリ最後の行) を確認**

```bash
tail -5 docs/decisions.md
```

期待される最終行: B 案 PR 1〜PR 6 の参照を含む文字列 (または `- 後続: B 案 PR 1...`)。

- [ ] **Step 2: 末尾に [067] エントリを追加**

`docs/decisions.md` の末尾に **追記** する (Edit tool で末尾 1 行を含む既存末尾 → 既存末尾 + 新エントリ に置換):

追記する内容 (末尾改行 1 つを挟んで):

```markdown
## [067] 2026-05-07 — `style-src 'unsafe-inline'` 撤廃: B 案完了、React `style={{}}` 全廃で属性ベース inline style 撲滅

**2026-05-07 | ステータス: 採用**

### 背景

[064] で A-1 (`script-src 'unsafe-inline'` 削減) を完了し、`<meta>` CSP を strict layer / `_headers` を permissive defense-in-depth に分離する設計が確立。残課題として `style-src 'unsafe-inline'` の撤廃が [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B として残っていた。

属性ベース inline style (`style="..."`) は CSP3 仕様で hash/nonce 照合の対象外のため、`style-src` strict 化には React の `style={{...}}` を **全廃** する必要があった。部分削減ではセキュリティ goal を達成できない (1 箇所でも残ると `'unsafe-inline'` が消せない)。

ユーザー承認のもと、数ヶ月にわたるコミットで段階的移行を実施した。

### 決断

**B 案を 6 PR に分割して段階移行し、最終 PR ([本 PR]) で `_headers` の `style-src` から `'unsafe-inline'` を削除して strict 化を完成。**

PR シリーズの依存と達成内容:

| PR     | スコープ                                                                                                | PR/Commit                                                       | 達成                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| PR 0   | VRT 基盤導入 (mock 注入版 spec、別 workflow、required check 外す、CI Linux baseline)                    | [#254 (26f566b)](https://github.com/fumtas1k/devtools/pull/254) | VRT で migration の pixel diff を継続監視できる土台を作成                                                                     |
| PR 1   | `@layer components` foundation + ui/\* simple 11 ファイル + `MIGRATED_FILES` tracker 導入               | [#256 (eb5e537)](https://github.com/fumtas1k/devtools/pull/256) | 意味クラス基盤と progressive migration 検証網を確立                                                                           |
| PR 1.5 | ui/\* complex (ResultTable + InputField) — API redesign 含む                                            | [#261 (8e58bd5)](https://github.com/fumtas1k/devtools/pull/261) | 高度な ui/\* 2 件を移行、`setProperty('--var')` パターンで CSS variable 経由制御を確立                                        |
| PR 2   | qr-ticket/\* 移行 + #225 useMemo/abort 同梱                                                             | [#272 (37adb60)](https://github.com/fumtas1k/devtools/pull/272) | 大物 qr-ticket 3 ファイル移行、`.alert-success` / `.alert-error` 等の意味クラス導入                                           |
| PR 3   | JwtDecoder + UuidV7Generator + uuid-v7 E2E CSP gate (#262 partial)                                      | [#275 (1150883)](https://github.com/fumtas1k/devtools/pull/275) | tools/\* 2 件移行、`applyProductionCsp` E2E gate を generator ページに導入                                                    |
| PR 4   | Gs1Databar + EncodingConverter + DummyText + CSSOM hover refactor                                       | [#277 (495f60e)](https://github.com/fumtas1k/devtools/pull/277) | tools/\* 3 件移行、`onMouseEnter`/`onMouseLeave` の CSSOM mutation 9 件を Tailwind `hover:` modifier に集約                   |
| infra  | `withProductionCsp(browser, path, fn)` ラッパで CSP gate boilerplate 集約 (#276)                        | [#278 (73de179)](https://github.com/fumtas1k/devtools/pull/278) | 後続 PR の E2E gate 化コスト削減                                                                                              |
| PR 5a  | ConfigConverter + QrReader + JanCode (大物 3 つ、CSSOM hover 含む) — 31 inline + 2 CSSOM                | [#283 (46abcb5)](https://github.com/fumtas1k/devtools/pull/283) | tools/\* 大物 3 件移行、`.qr-video-preview` / `.hover-bg-subtle` 等の class 拡充                                              |
| PR 5b  | Base64Codec + JsonCsv + JsonXml + QrCode + UlidGenerator + zero-style 登録 + ulid E2E gate (#262 close) | [#286 (d38b956)](https://github.com/fumtas1k/devtools/pull/286) | 残ツール 7 件移行 (うち 2 件 zero-style 登録)、generator ページ全体に CSP gate 完成、`#262` close                             |
| PR 6   | flip + cleanup ([本 entry])                                                                             | TBD (本 PR)                                                     | `_headers` から `'unsafe-inline'` 撤去、`stripMetaStyleSrc` 削除、`styles.ts` 削除、migration tracker glob 化、test strict 化 |

### 実装内訳 (本 PR)

- `public/_headers`: `style-src 'self' 'unsafe-inline'` → `style-src 'self'`
- `src/utils/csp.ts`: `PRODUCTION_CSP` 定数を `_headers` と同期
- `astro.config.mjs`: `stripMetaStyleSrc()` 関数定義 (60 行) と integrations 配列の呼び出しを削除。`security.csp` 設定はそのまま維持し、Astro auto-hash で `<meta>` の style-src も SHA-256 hash で strict layer 化
- `src/utils/styles.ts`: 削除 (PR 1〜5b で全 import 元が CSS class 参照に置換完了)
- `src/utils/__tests__/inline-style-migration.test.ts`: `MIGRATED_FILES` array (31 件) を `await glob('src/components/**/*.tsx')` に置換し、全件カバーと二重管理解消
- `src/utils/__tests__/headers.test.ts`: style-src の `'unsafe-inline'` 不在を陽性 assert に反転
- `src/utils/__tests__/meta-csp.test.ts`: style-src 不在 assert を strict 形式 (self + sha256 hash) assert に反転
- `src/utils/__tests__/astro-config-csp.test.ts`: `stripMetaStyleSrc` 関連 2 test を削除

### セキュリティ効果

- **属性ベース inline style XSS 緩和**: 攻撃者が `dangerouslySetInnerHTML` 等の sink から inline `style="..."` を注入しても CSP `style-src 'self'` で block される。CSP3 仕様で属性 inline style は hash 照合不可のため、本来 strict 化には全廃が必須だった。B 案でこの goal を達成
- **defense-in-depth**: header (`style-src 'self'`) + `<meta>` (`style-src 'self' 'sha256-...'`) の AND 評価で、CSS file の auto-hash も含めた完全な strict layer になる。`<meta>` で strict、header で permissive (の保守的バックアップ) という [064] の役割分担からさらに進化し、両層共に strict 化に到達

### 却下した選択肢

- **`@theme` 切替を本 PR で同時実施**: `.text-primary` 等の Tailwind utility 命名衝突リスクを根本解消する案。本 PR の射程が CSP flip + cleanup に集中しなくなる肥大化を避けるため見送り。`.text-primary` 命名は現状維持し、Tailwind utility 側で衝突が顕在化したら独立 issue で対応する方針
- **flip と cleanup を別 PR**: 9 ファイル / 全削除中心 / decisions.md は判断記録のみで PR としての規模は過大ではない。`docs/decisions.md` [067] の一括記録の意味からも 1 PR 完結が自然
- **`stripMetaStyleSrc` を撤去せず継続**: 本 PR 完了後に Astro security.csp が auto-hash した `<meta>` style-src を strip し続けると、防御側が hash 列挙の strict layer を捨てる無駄が出るため撤去を採用。Astro pipeline 外から CSS が混入する経路は既存設計上ない

### 影響 / 移行

- **CSP の XSS 緩和効果**: header + meta の両層で style-src strict 化が完成し、属性 inline style 経由の XSS 注入経路を CSP で塞いだ。`'unsafe-inline'` の意味的削減目標 (アプローチ B の本来の goal) 達成
- **ローカル開発体験**: dev mode は `security.csp` 無効 (Astro 公式仕様) で従来どおり動作。preview / build は strict CSP で評価される
- **build 出力**: `<meta>` CSP に `style-src 'self' 'sha256-...'` が含まれる (auto-hash)。`stripMetaStyleSrc` 撤去によりビルド step 1 つ減少。ビルド時間わずかに短縮 (誤差レベル)
- **後続作業**: B 案直接 follow-up は本 PR でクローズ。残存する周辺 issue ([#281](https://github.com/fumtas1k/devtools/issues/281) `withProductionCsp` meta-test / [#273](https://github.com/fumtas1k/devtools/issues/273) `AbortSignal.any` 化 / [#271](https://github.com/fumtas1k/devtools/issues/271) ESLint `react/button-has-type` / [#260](https://github.com/fumtas1k/devtools/issues/260) clsx 統一 / [#234](https://github.com/fumtas1k/devtools/issues/234) `applyProductionCsp` 全 spec 横展開) は B 案 follow-up とは独立した issue として継続。`@theme` 切替判断は将来 Tailwind utility 命名衝突顕在化時に独立 issue で扱う

### 関連 PR / issue

- 本 PR (PR 6 / B 案最終): TBD
- 解消する issue: [#176](https://github.com/fumtas1k/devtools/issues/176) (B 案完了)
- B 案構成 PR (依存関係): [#254](https://github.com/fumtas1k/devtools/pull/254) → [#256](https://github.com/fumtas1k/devtools/pull/256) → [#261](https://github.com/fumtas1k/devtools/pull/261) → [#272](https://github.com/fumtas1k/devtools/pull/272) → [#275](https://github.com/fumtas1k/devtools/pull/275) → [#277](https://github.com/fumtas1k/devtools/pull/277) → [#278](https://github.com/fumtas1k/devtools/pull/278) → [#283](https://github.com/fumtas1k/devtools/pull/283) → [#286](https://github.com/fumtas1k/devtools/pull/286) → 本 PR
- 前提依存: [064] (A-1 / `<meta>` strict layer 設計) / [063] (E2E preview 切替) / [061] (CSP 違反 CI 検知ゲート) / [054] (CSP 初導入)
- 同時 close: [#284](https://github.com/fumtas1k/devtools/issues/284) (`min-w-10` 集約検討、PR 6 で類似 pattern 出ず) / [#285](https://github.com/fumtas1k/devtools/issues/285) (カメラボタン utility 集約検討、同上)

---
```

ポイント:

- "TBD (本 PR)" / "本 PR (PR 6 / B 案最終): TBD" は **PR 番号確定後に Task 18 で URL に置換** する。本 task では TBD のまま入れる。
- ファイル末尾の `---` は次エントリ ([068]) との区切り。

- [ ] **Step 2: lint / format check (markdown)**

```bash
# README/decisions.md は prettier 対象外の可能性高、ただし lefthook 等が走ることがある
git diff docs/decisions.md | head -40
```

意図した追記が反映されていることを確認。表ヘッダの整列は元 [066] のスタイルを踏襲している。

- [ ] **Step 3: commit**

```bash
git add docs/decisions.md
git commit -m "$(cat <<'EOF'
docs(decisions): [067] #176 B 案完了の記録追加

PR 1〜6 の依存関係表 + 各 PR 達成内容 + B 案でセキュリティ目標達成の経緯
+ @theme 切替見送り判断 + .text-primary 命名維持判断を記録。
EOF
)"
```

---

## Phase D: ローカル必須ゲート (push 前検証)

### Task 12: build + unit test + 型 check

**Files:** (no edits, validation only)

- [ ] **Step 1: build + vitest 全件**

```bash
npm run build && npm run test 2>&1 | tail -50
```

Expected: 全 test green (Phase A/B 完了後の確認)。

- [ ] **Step 2: `astro check` で型確認**

```bash
npx astro check 2>&1 | tail -20
```

Expected: `0 errors, 0 warnings`.

### Task 13: E2E (preview ベース) 実行

**Files:** (no edits, validation only)

- [ ] **Step 1: E2E 全件実行 — 親 Opus 直接実行 (`feedback_subagent_verification_trust.md` に基づく)**

```bash
npm run test:e2e 2>&1 | tail -80
```

期待される所要時間: 数分。Playwright が build + preview を内部起動し全 spec 実行。

Expected: 全 spec green。特に `applyProductionCsp` 経由の uuid-v7 / ulid generator gate が pass し、CSP `style-src 'self'` 下でも UI が正常動作することを確認。

- [ ] **Step 2: E2E fail 時の対処**

fail spec があれば fail message を抜粋し、cause を分類:

- **CSP block 起源**: 想定外。spec §7 で全 migration 完了確認済のはず → 該当 component を見直し
- **timing / locator 起源**: 既存 flake の可能性。再実行で安定するか確認
- **VRT 関連**: ローカル mac で VRT は走らせない (`feedback_vrt_ci_only.md`)。`npm run test:vrt` 実行禁止

### Task 14: 残存チェック grep (final sanity)

**Files:** (no edits, validation only)

- [ ] **Step 1: 8 種類の残存 0 確認**

```bash
echo "=== 1. inline style 残存 (--include='*.tsx' で限定) ==="
grep -rn --include='*.tsx' 'style={{' src/ || echo "  → 0 件 ✅"

echo "=== 2. styles.ts 残存 ==="
find src/utils -name styles.ts || echo "  → 0 件 ✅"

echo "=== 3. @/utils/styles import ==="
grep -rn "@/utils/styles\|utils/styles'" src/ tests/ || echo "  → 0 件 ✅"

echo "=== 4. stripMetaStyleSrc 残存 ==="
grep -rn 'stripMetaStyleSrc' src/ tests/ astro.config.mjs || echo "  → 0 件 ✅"

echo "=== 5. style-src の 'unsafe-inline' 残存 ==="
grep -E "style-src[^;]*'unsafe-inline'" public/_headers src/utils/csp.ts || echo "  → 0 件 ✅"

echo "=== 6. aria-* 削除行 (PR pre-create check 9.6) ==="
git diff origin/develop..HEAD -- ':(exclude)docs/' | grep -E '^-.*aria-' || echo "  → 削除行なし ✅"

echo "=== 7. base 一致 ==="
[ "$(git rev-parse origin/develop)" = "$(git merge-base HEAD origin/develop)" ] && echo "  → develop と base 一致 ✅" || echo "  → ❌ ベースずれ"

echo "=== 8. スコープ ==="
git diff origin/develop --name-only
```

Expected:

- 項目 1〜5 全て 0 件
- 項目 6 (aria-\* 削除行) 無し
- 項目 7 base 一致
- 項目 8 想定 9 ファイル + spec 1 ファイル + plan 1 ファイル = **11 ファイル**:
  - `astro.config.mjs`
  - `docs/decisions.md`
  - `docs/superpowers/plans/2026-05-07-issue-176-b6-csp-flip-and-cleanup.md`
  - `docs/superpowers/specs/2026-05-07-issue-176-b6-csp-flip-and-cleanup-design.md`
  - `public/_headers`
  - `src/utils/__tests__/astro-config-csp.test.ts`
  - `src/utils/__tests__/headers.test.ts`
  - `src/utils/__tests__/inline-style-migration.test.ts`
  - `src/utils/__tests__/meta-csp.test.ts`
  - `src/utils/csp.ts`
  - `src/utils/styles.ts` (削除)

想定外ファイルが含まれる場合は revert または scope 確認。

---

## Phase E: PR 作成

### Task 15: 進捗 doc (issue-176-b-plan-progress.md) を PR 6 着手中に更新

> 進捗 doc は post-merge で `✅ merged` に更新する設計 (spec §Step 8) だが、本 PR の在中行 (`PR 6 status`) を `🚧 in-progress` などに書き換える chore は **本 PR ではしない** (post-merge chore PR で扱う、`feedback_followup_routing.md`)。

**Files:** (skip — post-merge で別 chore PR にて更新)

- [ ] **Step 1: 確認のみ**

```bash
grep -n "PR 6" docs/projects/issue-176-b-plan-progress.md | head -10
```

進捗 doc に PR 6 行が存在することを確認。本 PR の差分には含めない。

### Task 16: push + PR 作成

**Files:** (push + gh pr create only)

- [ ] **Step 1: push (`-u origin` で upstream 設定)**

```bash
git push -u origin feature/issue-176-b6-csp-flip-and-cleanup
```

Expected: github 上に branch 作成、URL 出力。fail なら network / 認証確認。

- [ ] **Step 2: PR body を `/tmp/claude/pr_body.md` に保存**

`mkdir -p /tmp/claude` 後、以下 body を `/tmp/claude/pr_body.md` に Write tool で保存:

```markdown
## 概要

`#176` B 案 (`style-src 'unsafe-inline'` 撤廃) の **最終 PR**。React `style={{...}}` を全廃し終えた状態で `public/_headers` から `'unsafe-inline'` を撤去し、暫定 strip integration と進捗 tracker を撤去する。

詳細設計: [docs/superpowers/specs/2026-05-07-issue-176-b6-csp-flip-and-cleanup-design.md](docs/superpowers/specs/2026-05-07-issue-176-b6-csp-flip-and-cleanup-design.md)
判断記録: docs/decisions.md [067]

## 変更内容

### CSP flip

- `public/_headers`: `style-src 'self' 'unsafe-inline'` → `style-src 'self'`
- `src/utils/csp.ts:PRODUCTION_CSP` 同期
- `script-src 'unsafe-inline'` は [064] AND 評価設計により意図的に維持

### 暫定 layer 撤去

- `astro.config.mjs`: `stripMetaStyleSrc()` 関数定義 (60 行) と integration 呼出を削除。Astro `security.csp` の auto-hash で `<meta>` 側 style-src も SHA-256 hash strict layer に到達
- 未使用 import (`readFileSync` / `writeFileSync` / `fileURLToPath` / `glob`) を削除

### 進捗 tracker 撤去

- `src/utils/styles.ts`: 削除 (PR 1〜5b で全 import 元が CSS class 参照に置換完了)
- `src/utils/__tests__/inline-style-migration.test.ts`: `MIGRATED_FILES` array (31 件) を `await glob('src/components/**/*.tsx')` に置換し全件カバー化、二重管理解消

### CSP test strict 化

- `headers.test.ts`: style-src の `'unsafe-inline'` 不在を陽性 assert
- `meta-csp.test.ts`: style-src strict 形式 (self + sha256 hash) assert に反転
- `astro-config-csp.test.ts`: `stripMetaStyleSrc` 関連 2 test を削除

### 判断記録

- `docs/decisions.md` [067]: B 案完了の記録 (PR 1〜6 シリーズ依存図 + 各 PR 達成内容 + `@theme` 切替見送り判断 + `.text-primary` 命名維持判断)

### follow-up close

- [#284](https://github.com/fumtas1k/devtools/issues/284) (`min-w-10` 集約検討、PR 6 で類似 pattern 出ず判定)
- [#285](https://github.com/fumtas1k/devtools/issues/285) (カメラボタン utility 集約検討、同上)

## 関連 PR (B 案シリーズ)

- 前提: A-1 [#249](https://github.com/fumtas1k/devtools/pull/249)
- VRT 基盤: [#254](https://github.com/fumtas1k/devtools/pull/254)
- migration: [#256](https://github.com/fumtas1k/devtools/pull/256) → [#261](https://github.com/fumtas1k/devtools/pull/261) → [#272](https://github.com/fumtas1k/devtools/pull/272) → [#275](https://github.com/fumtas1k/devtools/pull/275) → [#277](https://github.com/fumtas1k/devtools/pull/277) → [#283](https://github.com/fumtas1k/devtools/pull/283) → [#286](https://github.com/fumtas1k/devtools/pull/286)
- infra: [#278](https://github.com/fumtas1k/devtools/pull/278)

## 残存 follow-up (B 案 とは独立に継続)

- [#281](https://github.com/fumtas1k/devtools/issues/281) `withProductionCsp` meta-test
- [#273](https://github.com/fumtas1k/devtools/issues/273) `AbortSignal.any` 化
- [#271](https://github.com/fumtas1k/devtools/issues/271) ESLint `react/button-has-type`
- [#260](https://github.com/fumtas1k/devtools/issues/260) clsx 統一一括
- [#234](https://github.com/fumtas1k/devtools/issues/234) `applyProductionCsp` 残 17 spec 横展開
- `@theme` 切替判断 (Tailwind utility 命名衝突顕在化時)

## 検証

- [x] `npm run build && npm run test` (vitest) green
- [x] `npx astro check` green
- [x] `npm run test:e2e` (build + preview) green
- [x] `grep -rn --include='*.tsx' 'style={{' src/` = 0 件
- [ ] CI: VRT (`visual-regression.yml`) green (pixel diff 出たら `update-visual-baseline.yml` を `workflow_dispatch` で trigger し baseline 更新 commit を追加)
- [ ] CI: 全 required check green
```

- [ ] **Step 3: pre-create check (`docs/playbooks/pr-creation.md` 4 点遵守)**

```bash
# 1. base alignment
[ "$(git rev-parse origin/develop)" = "$(git merge-base HEAD origin/develop)" ] && echo "✅ base alignment" || echo "❌ base mismatch"

# 2. scope (Task 14 で確認済)
git diff origin/develop --name-only

# 3. aria-* 削除行 (Task 14 で確認済)

# 4. body file 存在
ls -la /tmp/claude/pr_body.md
```

- [ ] **Step 4: gh pr create (`--base develop` 必須、`--body-file` 必須)**

```bash
gh pr create \
  --base develop \
  --title "refactor(csp): #176 B 案 PR 6 — style-src 'unsafe-inline' 撤廃 + cleanup (B 案完了)" \
  --body-file /tmp/claude/pr_body.md
```

Expected: PR URL 出力 (`https://github.com/fumtas1k/devtools/pull/<NUM>`)。**PR 番号を控える** (Task 17 / Task 18 で使う)。

### Task 17: follow-up issue close + decisions.md TBD 置換

**Files:**

- Modify: `docs/decisions.md` (TBD → 実 URL 置換)

- [ ] **Step 1: PR 番号確定後、`docs/decisions.md` の TBD 2 箇所を置換**

[067] 末尾の以下 2 箇所を実 URL に書き換え (Edit tool 使用、PR 番号 `<N>` は Task 16 で取得):

old:

```
| PR 6   | flip + cleanup ([本 entry])                                                                             | TBD (本 PR)                                                     | ...
```

new:

```
| PR 6   | flip + cleanup ([本 entry])                                                                             | [#<N> (<short-sha>)](https://github.com/fumtas1k/devtools/pull/<N>) | ...
```

old:

```
- 本 PR (PR 6 / B 案最終): TBD
```

new:

```
- 本 PR (PR 6 / B 案最終): [#<N>](https://github.com/fumtas1k/devtools/pull/<N>)
```

`<short-sha>` は Phase A の commit `git log --oneline -1 HEAD~3` で取得 (Phase A commit が 4 つ前あたりなら HEAD~ で適宜調整)。

- [ ] **Step 2: 追加 commit + push**

```bash
git add docs/decisions.md
git commit -m "$(cat <<'EOF'
docs(decisions): [067] PR 6 番号 + commit sha を確定値に更新

PR #<N> の URL に書き換え。
EOF
)"
git push
```

- [ ] **Step 3: follow-up issue close**

```bash
mkdir -p /tmp/claude
cat > /tmp/claude/issue_close_comment.md <<'EOF'
PR #176 B 案 PR 6 (#<N>) 完了時点で、本 issue 起票時に懸念された類似 pattern は出現しなかったため close。

- PR 6 は CSP flip + cleanup PR で新規 class 追加ゼロ
- B 案 (#176) シリーズ全体での新規 class 追加状況は decisions.md [067] の PR 別達成表に集約済

将来の追加実装で再度 pattern が出てきた場合は新規 issue で起票する。
EOF

# `<N>` を sed で実 PR 番号に置換してから close
sed -i.bak "s/<N>/<実 PR 番号>/g" /tmp/claude/issue_close_comment.md && rm /tmp/claude/issue_close_comment.md.bak

gh issue close 284 --comment "$(cat /tmp/claude/issue_close_comment.md)"
gh issue close 285 --comment "$(cat /tmp/claude/issue_close_comment.md)"
```

Expected: issue 284 / 285 の state が CLOSED に。

---

## Phase F: post-CI (CI 結果次第)

### Task 18: CI 結果監視 + VRT 対応

**Files:** (CI watch + conditional baseline update)

- [ ] **Step 1: CI 全 check の watch**

```bash
gh pr checks <PR 番号> --watch
```

Expected: 全 required check green。

- [ ] **Step 2: VRT 結果分岐**

`visual-regression` job の結果を確認:

```bash
gh run list --workflow=visual-regression.yml --branch=feature/issue-176-b6-csp-flip-and-cleanup --limit=1 --json status,conclusion --jq '.[0]'
```

- **`conclusion: success`**: 何もしない、merge 可能。
- **`conclusion: failure` (pixel diff)**: PR comment に baseline diff 詳細が出る。差分が CSP flip 副次効果で説明可能なら baseline 更新を実施 (下記 Step 3)。説明できない rendering 差なら revert / 原因調査。

- [ ] **Step 3: VRT baseline 更新 (pixel diff 出た場合のみ)**

```bash
gh workflow run update-visual-baseline.yml --ref feature/issue-176-b6-csp-flip-and-cleanup
gh run watch
```

Bot が同 branch に baseline 更新 commit を push back する。push 後に `gh pr checks <PR 番号> --watch` で全 green を再確認。

### Task 19: マージ準備完了報告

**Files:** (no edits, report only)

- [ ] **Step 1: 完了 summary を user に報告**

報告内容:

- PR URL
- B 案 (`#176`) 完了の記録
- decisions.md [067] 追加完了
- 残存 follow-up issue リスト
- post-merge chore: 進捗 doc (`docs/projects/issue-176-b-plan-progress.md`) の PR 6 列を `✅ merged` に更新する別 PR を user 主導で実施 (or user に提案)

---

## ロールバック計画

PR 6 単独 revert で B 案前 (PR 5b 終端) の状態に戻る。`styles.ts` と `MIGRATED_FILES` の漸進管理機構は PR 1〜5b の commit に保存されているため revert 可能。ただし B 案完了後の revert はセキュリティ後退となるため、本 PR 後に発見された問題は **個別 fix PR** で対処するのが優先。

---

## Self-Review (writing-plans 完了基準)

**Spec coverage check:**

- spec §7.1 `_headers`: Task 4 ✅
- spec §7.2 `csp.ts`: Task 5 ✅
- spec §7.3 `astro.config.mjs`: Task 6 ✅
- spec §7.4 `styles.ts` 削除: Task 9 ✅
- spec §7.5 migration test glob 化: Task 8 ✅
- spec §7.6 `headers.test.ts`: Task 1 ✅
- spec §7.7 `meta-csp.test.ts`: Task 2 ✅
- spec §7.8 `astro-config-csp.test.ts`: Task 3 ✅
- spec §7.9 decisions.md [067]: Task 11 ✅
- spec §Step 5 ローカル検証: Task 12 / 13 / 14 ✅
- spec §Step 6 PR 作成: Task 16 ✅
- spec §Step 6 follow-up close: Task 17 ✅
- spec §Step 7 VRT 結果対応: Task 18 ✅
- spec §Step 8 進捗 doc 更新: Task 15 で post-merge 別 chore に分離 ✅

**Placeholder scan:** TBD は decisions.md [067] 内に PR 番号確定前の意図的プレースホルダ 2 箇所あり、Task 17 で実 URL に置換する設計。プラン本文には placeholder 無し。

**Type consistency:** `TARGET_FILES` 変数名 (Task 8) / `stripMetaStyleSrc` 関数名 (Task 6) / `PRODUCTION_CSP` 定数名 (Task 5) は spec と完全一致。
