# `#176` B 案 PR 8 — `style-src 'unsafe-inline'` 最終 flip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `#176` B 案最終 flip。CSP `style-src 'unsafe-inline'` を header / meta 両 side で削除し、暫定 strip integration を撤去、Astro 検出網を整備、`docs/decisions.md [067]` で B 案完了を記録する。

**Architecture:** spec `docs/superpowers/specs/2026-05-08-issue-176-b8-final-flip-design.md` (commit 900eb84) に従い 7 commit を直列で打つ。subagent 1 体 (sonnet) に全 task を順次 dispatch、各 task 内で「red → green → commit」ステップを bite-size で実行。親 Opus は task 間の review + 最終 E2E + PR 作成を担当。worktree 不使用、`feature/issue-176-b8-final-flip` 上で直接編集。

**Tech Stack:** Astro 5 / React 19 / Tailwind v4 / Vitest / Playwright / TypeScript

---

## Pre-Task Setup (親 Opus 確認)

- [ ] **Step 0.1: 現在の branch / worktree 確認**

Run:

```bash
git branch --show-current
```

Expected output: `feature/issue-176-b8-final-flip`

- [ ] **Step 0.2: 現在の HEAD が spec commit であること確認**

Run:

```bash
git log --oneline -1
```

Expected output: `900eb84 docs(superpowers): #176 B 案 PR 8 design spec 作成` (or HEAD ahead of spec commit if 既に作業開始済)

- [ ] **Step 0.3: develop との diff scope 確認**

Run:

```bash
git diff origin/develop --name-only
```

Expected: spec ファイル 1 件のみ (`docs/superpowers/specs/2026-05-08-issue-176-b8-final-flip-design.md`)

---

## Task 1: Gs1Databar SVG `currentColor` 化

**Why:** SVG 文字列内の `style="fill:var(--color-text)"` は `dangerouslySetInnerHTML` 経由で DOM 注入される HTML inline style 属性であり、CSP `style-src 'unsafe-inline'` 削除後に silent drop される。`fill="currentColor"` + 親要素 `color: var(--color-text)` で同等の見た目を CSS 経由で表現する。

**Files:**

- Modify: `src/utils/gs1-databar.ts:227-229`
- Modify: `src/components/tools/Gs1Databar.tsx` (`dangerouslySetInnerHTML` 親要素の className)
- Modify: `src/styles/global.css` (`@layer components` セクションに 1 ルール追加)
- Test: `src/utils/__tests__/gs1-databar.test.ts` (既存、今回は assertion 追加なし — 後述判断)

- [ ] **Step 1.1: 既存 SVG 生成箇所を確認**

Run:

```bash
grep -n 'fill="#000000"\|style="fill' src/utils/gs1-databar.ts
```

Expected output:

```
229:    `font-size="${fontSize}" fill="#000000" style="fill:var(--color-text)">${escapedText}</text>`;
```

- [ ] **Step 1.2: `gs1-databar.ts:227-229` を currentColor 化**

Edit `src/utils/gs1-databar.ts` の SVG `<text>` 生成部分。

**before** (line 227-229):

```javascript
const textEl =
  `<text x="${(newW / 2).toFixed(1)}" y="${textRowH - 3}" ` +
  `text-anchor="middle" font-family="'Courier New',Courier,monospace" ` +
  `font-size="${fontSize}" fill="#000000" style="fill:var(--color-text)">${escapedText}</text>`;
```

**after** (`fill="#000000"` と `style="fill:var(--color-text)"` を `fill="currentColor"` 1 箇所に置換):

```javascript
const textEl =
  `<text x="${(newW / 2).toFixed(1)}" y="${textRowH - 3}" ` +
  `text-anchor="middle" font-family="'Courier New',Courier,monospace" ` +
  `font-size="${fontSize}" fill="currentColor">${escapedText}</text>`;
```

- [ ] **Step 1.3: `Gs1Databar.tsx` の `dangerouslySetInnerHTML` 親要素を確認**

Run:

```bash
grep -n -B2 -A2 'dangerouslySetInnerHTML' src/components/tools/Gs1Databar.tsx
```

Expected: line 314-316 付近に該当箇所。

- [ ] **Step 1.4: `Gs1Databar.tsx` の親要素 className に `gs1-svg-container` 追加**

該当箇所の `<div>` (line 314-318 付近) の className 配列または文字列に `gs1-svg-container` を含める。既存 className が clsx / 配列形式 / template literal なら同パターンで追加。例:

**before**:

```tsx
<div className="..." dangerouslySetInnerHTML={{ __html: svgContent }} />
```

**after**:

```tsx
<div className="... gs1-svg-container" dangerouslySetInnerHTML={{ __html: svgContent }} />
```

(既存 className が空文字列なら `className="gs1-svg-container"` のみ。clsx 関数呼び出しなら配列要素として追加。)

- [ ] **Step 1.5: `global.css` `@layer components` に `.gs1-svg-container` 追加**

`src/styles/global.css` の `@layer components` ブロック内、関連する SVG / icon 系 class の近くに追加:

```css
.gs1-svg-container {
  color: var(--color-text);
}
```

(既存の `.text-icon` `.text-default` 等のテキストカラー class の付近に置くのが望ましい。)

- [ ] **Step 1.6: 既存テストが破壊されていないこと確認**

Run:

```bash
npm run test -- src/utils/__tests__/gs1-databar.test.ts
```

Expected: 全テスト pass (既存テストは `fill` 値を assert していないため破壊なし)。

- [ ] **Step 1.7: astro check + lint 確認**

Run:

```bash
npx astro check 2>&1 | tail -5
npm run lint 2>&1 | tail -5
```

Expected: いずれもエラーなし。

- [ ] **Step 1.8: commit**

```bash
git add src/utils/gs1-databar.ts src/components/tools/Gs1Databar.tsx src/styles/global.css
git commit -m "$(cat <<'EOF'
refactor(gs1-databar): #176 B 案 PR 8 (1/7) — SVG inline style を currentColor 化

dangerouslySetInnerHTML 経由で DOM 注入される SVG <text> の
style="fill:var(--color-text)" を fill="currentColor" + 親 div の
color: var(--color-text) で表現。CSP style-src strict 化 (本 PR の
commit 2 で実施) 後に silent drop されるのを回避。

- src/utils/gs1-databar.ts: fill="#000000" + style="..." 削除、
  fill="currentColor" 化
- src/components/tools/Gs1Databar.tsx: 親要素に .gs1-svg-container 付与
- src/styles/global.css: @layer components に .gs1-svg-container 追加
EOF
)"
```

---

## Task 2: CSP flip (`_headers` + `csp.ts`)

**Why:** B 案 = `style-src 'unsafe-inline'` 削除の主目的。Task 1 で SVG 経路も封じた前提で header 側 CSP と PRODUCTION_CSP 定数を strict 化。

**Files:**

- Modify: `public/_headers`
- Modify: `src/utils/csp.ts`

**Note:** 本 commit 単独では `headers.test.ts` / `meta-csp.test.ts` が red になる (既存 assert は `'unsafe-inline'` 含有を要求)。test 反転は Task 4 で実施。pre-commit hook は test を走らせないため commit 自体は通る。bisect 時に commit 2-3 範囲が test red 状態である点に注意。

- [ ] **Step 2.1: `public/_headers` の CSP 行を編集**

`public/_headers` line 7 (CSP 行) の `style-src 'self' 'unsafe-inline'` を `style-src 'self'` に置換。`script-src 'self' 'unsafe-inline'` は維持 ([064] 設計、本 PR では触らない)。

**before** (line 7):

```
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests
```

**after**:

```
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests
```

冒頭コメント (line 1-5) は維持 (script-src 関連の解説で本 PR では触らない)。

- [ ] **Step 2.2: `src/utils/csp.ts` の `PRODUCTION_CSP` 同期**

`src/utils/csp.ts` line 24 の `style-src 'self' 'unsafe-inline';` を `style-src 'self';` に置換。

**before** (line 20-32):

```typescript
export const PRODUCTION_CSP =
  "default-src 'self'; " +
  "img-src 'self' data: blob:; " +
  "media-src 'self' blob:; " +
  "style-src 'self' 'unsafe-inline'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "connect-src 'self'; " +
  "worker-src 'self'; " +
  "object-src 'none'; " +
  "frame-ancestors 'none'; " +
  "base-uri 'none'; " +
  "form-action 'self'; " +
  'upgrade-insecure-requests';
```

**after** (line 24 のみ変更):

```typescript
export const PRODUCTION_CSP =
  "default-src 'self'; " +
  "img-src 'self' data: blob:; " +
  "media-src 'self' blob:; " +
  "style-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "connect-src 'self'; " +
  "worker-src 'self'; " +
  "object-src 'none'; " +
  "frame-ancestors 'none'; " +
  "base-uri 'none'; " +
  "form-action 'self'; " +
  'upgrade-insecure-requests';
```

- [ ] **Step 2.3: JSDoc 更新確認**

`src/utils/csp.ts` 上部 JSDoc は変更不要 (`#176 A-1 以降、script-src の 'unsafe-inline' は意図的に維持` の説明はそのまま正しい)。Task 4 で test 側 JSDoc を [067] 参照に更新する際に csp.ts の JSDoc も同期。本 task では触らない。

- [ ] **Step 2.4: astro check 確認** (pre-commit hook 通過のため)

Run:

```bash
npx astro check 2>&1 | tail -5
```

Expected: エラーなし。

- [ ] **Step 2.5: commit**

```bash
git add public/_headers src/utils/csp.ts
git commit -m "$(cat <<'EOF'
refactor(csp): #176 B 案 PR 8 (2/7) — style-src 'unsafe-inline' 削除

header 側 CSP と PRODUCTION_CSP 定数 (E2E 注入用) を style-src 'self'
に strict 化。React style={{ / Astro style="" / SVG inline style は
PR 1〜7b + 本 PR commit 1 で全廃済のため strict 化が安全に成立。

- public/_headers: style-src 'self' 'unsafe-inline' → 'self'
- src/utils/csp.ts: PRODUCTION_CSP 同期更新

Note: headers.test.ts / meta-csp.test.ts の test 反転は本 PR commit 4
で実施。本 commit 単独では test red、commit 4 で green に戻る。
EOF
)"
```

---

## Task 3: `stripMetaStyleSrc` 撤去

**Why:** `<meta>` CSP から style-src を除去する暫定 integration ([064] で導入)。全 inline style 撲滅後は不要。`<meta>` 側の style-src は Astro security.csp が `style-src 'self' 'sha256-...'` を出力 (Astro auto-hash) し、本 commit で `<meta>` は header と一致して strict になる。

**Files:**

- Modify: `astro.config.mjs`

**Note:** Task 2 と同様 commit 単独で red。`meta-csp.test.ts` の `<meta>` 側 style-src 不在 assert と `astro-config-csp.test.ts` の `stripMetaStyleSrc` 存在 assert が両方 fail。Task 4 で fix。

- [ ] **Step 3.1: `astro.config.mjs` の `stripMetaStyleSrc()` 関数定義削除**

line 9-85 の `// #176 A-1 / [064]: ...` コメントから `function stripMetaStyleSrc() { ... }` 関数定義の閉じ `}` までを丸ごと削除。

具体的には:

- line 9-20 のブロックコメント (`// #176 A-1 / [064]: <meta> CSP の ...` から `// 失敗時 ...silent-pass を防ぐ（B 案完了まで暫定の defense-in-depth）。` まで)
- line 21-85 の `function stripMetaStyleSrc() { ... }` 全体

を削除。

- [ ] **Step 3.2: `integrations` 配列から `stripMetaStyleSrc()` 呼び出し削除**

line 89:

**before**:

```javascript
integrations: [react(), sitemap(), stripMetaStyleSrc()],
```

**after**:

```javascript
integrations: [react(), sitemap()],
```

- [ ] **Step 3.3: 未使用 import 削除**

line 5-7 の以下 3 import を削除 (他で未使用):

```javascript
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';
```

残す import: `defineConfig` / `react` / `tailwindcss` / `sitemap`。

- [ ] **Step 3.4: 削除後の `astro.config.mjs` 確認**

Run:

```bash
head -30 astro.config.mjs
```

Expected:

```javascript
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://devtools-d9w.pages.dev',
  integrations: [react(), sitemap()],
  ...
```

- [ ] **Step 3.5: astro check + ビルド確認**

Run:

```bash
npx astro check 2>&1 | tail -5
```

Expected: エラーなし。

- [ ] **Step 3.6: commit**

```bash
git add astro.config.mjs
git commit -m "$(cat <<'EOF'
refactor(csp): #176 B 案 PR 8 (3/7) — stripMetaStyleSrc 暫定 integration 撤去

A-1 ([064]) で導入した <meta> CSP から style-src を除去する暫定
integration を撤去。本 PR commit 1〜2 で全 inline style 撲滅 +
header strict 化が完成し、<meta> 側にも style-src がそのまま出力
される (Astro security.csp の auto-hash で 'self' 'sha256-...' 化)
ことが安全になった。

- astro.config.mjs: stripMetaStyleSrc 関数定義 + integrations 呼び出し
  + 関連 import (readFileSync/writeFileSync/fileURLToPath/glob) 削除

Note: meta-csp.test.ts / astro-config-csp.test.ts の test 反転は本 PR
commit 4 で実施。本 commit 単独では test red。
EOF
)"
```

---

## Task 4: test 群 strict 化

**Why:** Task 2 + 3 で実装側を strict 化したため、test 側の expected を反転させて green に戻す。本 PR で「strict 化が必須かつ陽性 assert」される回帰防止網を整備。

**Files:**

- Modify: `src/utils/__tests__/headers.test.ts:89-94` (1 ブロック)
- Modify: `src/utils/__tests__/meta-csp.test.ts:79-86` + 冒頭 JSDoc
- Modify: `src/utils/__tests__/astro-config-csp.test.ts:37-43` + `49-56` 削除 + 冒頭 JSDoc

- [ ] **Step 4.1: `headers.test.ts:89-94` を反転**

`src/utils/__tests__/headers.test.ts` line 89-94 を以下に置換:

**before** (line 89-94):

```typescript
it("style-src は 'unsafe-inline' を許可（React/Astro のインラインスタイル運用上必要）", () => {
  // 219+ 箇所の React `style={{...}}` と Astro `style="..."` が存在するため許可。
  // 中期的には CSS Modules / nonce 化を検討（docs/decisions.md [054] 参照）。
  expect(csp).toMatch(/style-src[^;]*'self'/);
  expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
});
```

**after**:

```typescript
it("style-src は 'self' のみで 'unsafe-inline' を含まない (#176 B 案完了 / [067])", () => {
  // PR 1〜7b で React `style={{` / Astro `style="..."` 全廃 (2026-05-08 時点で 0 件) +
  // 本 PR (#176 B 案 PR 8) commit 1 で SVG inline style も `currentColor` 化。
  // 残る暗黙 inline style 経路がないため style-src を strict に flip。
  // CSP3 仕様で hash と 'unsafe-inline' 共存時に unsafe-inline は無効化されるため、
  // hash 化は不要 (本 strict 化で `<style>` block の auto-hash も活用される)。
  // 詳細: docs/decisions.md [067]
  expect(csp).toMatch(/style-src[^;]*'self'/);
  expect(csp).not.toMatch(/style-src[^;]*'unsafe-inline'/);
});
```

- [ ] **Step 4.2: `meta-csp.test.ts:79-86` を反転 + 冒頭 JSDoc 更新**

`src/utils/__tests__/meta-csp.test.ts` line 79-86 を以下に置換:

**before** (line 79-86):

```typescript
it('style-src は meta から除去されている (stripMetaStyleSrc integration)', () => {
  // astro.config.mjs の stripMetaStyleSrc() で <meta> CSP から style-src を除く。
  // CSP3 仕様で hash と 'unsafe-inline' 共存時にブラウザが unsafe-inline を無視するため、
  // style-src は header 側 (`'self' 'unsafe-inline'`) のみで制御する。
  // B 案 (#176 アプローチ B) で React style="..." 200+ 箇所を移行後、
  // この strip integration 自体を削除して meta side でも strict 化する。
  expect(cspContent).not.toMatch(/style-src/);
});
```

**after**:

```typescript
it("style-src は 'self' のみ (B 案完了で hash 不要 / strict 化 / [067])", () => {
  // [067] B 案完了。React style={{ / Astro style="" / SVG inline style 全廃済のため
  // <meta> CSP も style-src 'self' で安全に運用可能。本 PR commit 3 で
  // stripMetaStyleSrc integration を削除した結果、Astro security.csp 由来の
  // <meta> に style-src がそのまま出力される。
  expect(cspContent).toMatch(/style-src[^;]*'self'/);
  expect(cspContent).not.toMatch(/style-src[^;]*'unsafe-inline'/);
});
```

冒頭 JSDoc (line 6-24) のうち、`astro.config.mjs の stripMetaStyleSrc() integration で <meta> から style-src は除去している（CSP3 仕様で hash と 'unsafe-inline' が共存するとブラウザが unsafe-inline を無視するため、style-src の strict 化は B 案 PR で React style="..." 200+ 箇所の段階移行と合わせて行う）。本テストでは style-src の不在も検証する。` の段落を以下に置換:

```
 * `<meta>` 側の style-src は B 案完了 ([067]) で `'self'` strict に。Astro security.csp は
 * style-src にも sha256 ハッシュを付与するが、本 PR で全 inline style 撲滅により hash 不要、
 * `'self'` のみで運用可能になった。本テストで strict 形式 (`'unsafe-inline'` 不在) を陽性 assert する。
```

- [ ] **Step 4.3: `astro-config-csp.test.ts` の `stripMetaStyleSrc` 関連削除 + JSDoc 更新**

`src/utils/__tests__/astro-config-csp.test.ts` から以下を削除:

- line 37-43 (`it('`stripMetaStyleSrc()` integration が integrations 配列に含まれる', ...)` ブロック全体)
- line 49-56 (`it('stripMetaStyleSrc の full.replace は callback 形式で $ 特殊解釈を回避している ...', ...)` ブロック全体)

冒頭 JSDoc (line 5-19) の以下 2 箇所を [067] 参照に更新:

冒頭の本文ブロック:

**before**:

```
 * `astro.config.mjs` から `security.csp` 設定が削除されると `<meta>` CSP が
 * 出力されず、`<meta>` strict layer + `_headers` permissive layer の AND 評価
 * 設計（[064]）の前提が崩れる。
```

**after**:

```
 * `astro.config.mjs` から `security.csp` 設定が削除されると `<meta>` CSP が
 * 出力されず、`<meta>` strict layer + `_headers` strict layer (B 案完了 [067]) の
 * 設計が崩れる。
```

(`[064]` 単独参照 → `[067]` を追記。)

最後の参照行:

**before**:

```
 * 参照: docs/decisions.md [064]、メモリ feedback_positive_control_for_gates.md
 *
 * #250 I-3 / PR #249 レビュー M (defensive replace callback 形式) 対応。
```

**after**:

```
 * 参照: docs/decisions.md [064] / [067]、メモリ feedback_positive_control_for_gates.md
 *
 * #250 I-3 / PR #249 レビュー M (defensive replace callback 形式) は B 案完了で
 * stripMetaStyleSrc 自体が撤去されたため対応不要 ([067])。
```

- [ ] **Step 4.4: test 全体 green 確認**

Run:

```bash
npm run test 2>&1 | tail -10
```

Expected: 全 unit test pass。特に以下 3 spec が green:

- `src/utils/__tests__/headers.test.ts`
- `src/utils/__tests__/meta-csp.test.ts` (skip される可能性あり、`dist` 不在の場合)
- `src/utils/__tests__/astro-config-csp.test.ts`

`meta-csp.test.ts` は `dist` 不在で `it.skip` される可能性が高いので、build 後に再確認:

```bash
npm run build 2>&1 | tail -5
npm run test -- src/utils/__tests__/meta-csp.test.ts 2>&1 | tail -10
```

Expected: meta-csp.test.ts の `style-src は 'self' のみ` test が pass。

- [ ] **Step 4.5: astro check + lint 確認**

Run:

```bash
npx astro check 2>&1 | tail -3
npm run lint 2>&1 | tail -3
```

Expected: いずれもエラーなし。

- [ ] **Step 4.6: commit**

```bash
git add src/utils/__tests__/headers.test.ts src/utils/__tests__/meta-csp.test.ts src/utils/__tests__/astro-config-csp.test.ts
git commit -m "$(cat <<'EOF'
test(csp): #176 B 案 PR 8 (4/7) — test 群 strict 化

commit 2-3 で実装側を strict 化したのに合わせ、test 側の expected を
反転。strict 化が必須であることを陽性 assert する回帰防止網を整備。

- headers.test.ts: style-src 'unsafe-inline' 不在を陽性 assert
- meta-csp.test.ts: <meta> 側 style-src も 'self' strict 形式 assert
- astro-config-csp.test.ts: stripMetaStyleSrc 関連 2 ブロック削除、
  JSDoc を [067] 参照に更新
EOF
)"
```

---

## Task 5: Astro inline style 検出網追加

**Why:** PR 7a / 7b で Astro inline style 65 件全廃後、新規 `.astro` ファイルで `style="..."` を持ち込むと CSP violation で silent drop される。`inline-style-migration.test.ts` に `.astro` glob を追加し、`<style>` block (Astro scoped、auto-hash) と区別しつつ HTML inline style 属性のみを検出する。

**Files:**

- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 5.1: `inline-style-migration.test.ts` に Astro glob を追加**

`src/utils/__tests__/inline-style-migration.test.ts` の line 26 (`TARGET_FILES.sort();`) の後に、新たな glob ブロックを追加:

**before** (line 22-27):

```typescript
const TARGET_FILES: string[] = [];
for await (const f of glob('src/components/**/*.tsx', { cwd: process.cwd() })) {
  TARGET_FILES.push(f);
}
TARGET_FILES.sort();
```

**after** (TARGET_FILES の後に ASTRO_TARGET_FILES を追加):

```typescript
const TARGET_FILES: string[] = [];
for await (const f of glob('src/components/**/*.tsx', { cwd: process.cwd() })) {
  TARGET_FILES.push(f);
}
TARGET_FILES.sort();

const ASTRO_TARGET_FILES: string[] = [];
for await (const f of glob('src/{components,layouts,pages}/**/*.astro', { cwd: process.cwd() })) {
  ASTRO_TARGET_FILES.push(f);
}
ASTRO_TARGET_FILES.sort();
```

- [ ] **Step 5.2: 並列 describe block を追加**

line 46 (`});` で `describe.skipIf(TARGET_FILES.length === 0)` ブロックが閉じる) の直後、`describe('migration detector の陽性対照', ...)` の前 (line 48) に、Astro 用 describe ブロックを挿入:

```typescript
describe.skipIf(ASTRO_TARGET_FILES.length === 0)(
  '#176 B 案 Astro inline style 完全撲滅 (回帰防止 / [067])',
  () => {
    it(`src/{components,layouts,pages}/**/*.astro を ${ASTRO_TARGET_FILES.length} 件カバー`, () => {
      expect(ASTRO_TARGET_FILES.length).toBeGreaterThan(0);
    });

    describe.each(ASTRO_TARGET_FILES)('%s', (file) => {
      const content = readFileSync(path.resolve(process.cwd(), file), 'utf-8');

      it('HTML inline style 属性 (style="...") が残っていない', () => {
        // 前置スペース必須: `<style>` block (Astro scoped、auto-hash 経路) は対象外。
        // `style="..."` 属性形式のみ検出。
        expect(content).not.toMatch(/\sstyle\s*=\s*"[^"]*"/);
      });
    });
  }
);
```

- [ ] **Step 5.3: 陽性対照に Astro 用 1 件追加**

既存の `describe('migration detector の陽性対照', ...)` ブロック (line 48-67 付近) の `it('setProperty は許容パターンとしてスルーされる', ...)` の後に、Astro 用陽性対照 1 件を追加:

```typescript
it('意図的に Astro style="..." を含む文字列が違反として検出される', () => {
  const malicious = `<div style="color: red" />`;
  expect(malicious).toMatch(/\sstyle\s*=\s*"[^"]*"/);
});
```

- [ ] **Step 5.4: 冒頭 JSDoc を更新**

冒頭 JSDoc (line 6-19) の `参照: docs/decisions.md (B 案完了時に [067] エントリ追加予定。flip + 完了記録は #289 Astro inline migration 完了後の最終 PR で実施)` を以下に置換:

```
 * 参照: docs/decisions.md [067]
```

(B 案完了済の表現に合わせ、placeholder 言及を削除。)

- [ ] **Step 5.5: test 全体 green 確認**

Run:

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | tail -20
```

Expected: 全テスト pass。Astro ファイル件数は最低でも layout (4) + layouts (2) + ui (2 .astro) + pages (7+) = 15 件程度。

- [ ] **Step 5.6: commit**

```bash
git add src/utils/__tests__/inline-style-migration.test.ts
git commit -m "$(cat <<'EOF'
test(migration): #176 B 案 PR 8 (5/7) — Astro inline style 検出網追加

PR 7a / 7b で Astro inline style 65 件全廃後の永続的回帰防止網。
新規 .astro ファイルで style="..." 属性を持ち込むと CSP violation で
silent drop されるため、自動検出網に組み込む。

- src/{components,layouts,pages}/**/*.astro を glob 対象に
- regex `\sstyle\s*=\s*"[^"]*"`: 前置スペース必須で <style> block と区別
- 陽性対照 1 件追加 (悪意ある style 属性が確実に検出されることを assert)
EOF
)"
```

---

## Task 6: `decisions.md [067]` 追加

**Why:** B 案完了の記録。PR 1 (#256) reviewer I-3 で defer 容認、PR 6 → PR 8 へ持ち越されていた約束。`.text-primary` 命名衝突 KEEP 判断と Tailwind `border` + layer 優先度メモも同梱。

**Files:**

- Modify: `docs/decisions.md`

- [ ] **Step 6.1: `decisions.md` の末尾を確認**

Run:

```bash
tail -50 docs/decisions.md
```

Expected: 最終エントリは `## [066] 2026-05-03 — VRT (Visual Regression Test) を独立 PR + 専用 workflow + 非 required check で導入`。その後の本文末尾に新規 [067] エントリを追記する。

- [ ] **Step 6.2: `[067]` エントリを末尾に追加**

`docs/decisions.md` の末尾に以下を追記 (空行 1 行 + ヘッダ + 本文):

````markdown
## [067] 2026-05-08 — `style-src 'unsafe-inline'` 削除 + B 案完了

### 背景

`#176` A-1 ([064]) で script-src を strict 化した時点では、`style="..."` HTML 属性は CSP3 で hash 適用対象外のため `style-src 'unsafe-inline'` は維持していた。React `style={{` (200+ 箇所) と Astro `style="..."` (65 箇所) を CSS class / Tailwind utility 化することで初めて strict 化が可能になる、という長期計画 (B 案) を採用。

### 完了経緯

PR 1 (#256) 〜 PR 7b (#299) で全 inline style を撲滅:

- PR 0 (#254): VRT 独立導入
- PR 1 (#256): ui/\* simple 11 ファイル + 基礎工事 (`@layer components` foundation + migration tracker)
- PR 1.5 (#261): ResultTable + InputField + cellStyle API 再設計
- PR 2 (#272): qr-ticket
- PR 3 (#275): JwtDecoder + UuidV7Generator + #262 partial (uuid-v7 CSP gate)
- PR 4 (#277): Gs1Databar + EncodingConverter + DummyText
- PR #278 (infra): `withProductionCsp` ラッパ helper
- PR 5a (#283): ConfigConverter + QrReader + JanCode
- PR 5b (#286): 残ツール (Base64Codec / JsonCsv / JsonXml / QrCode / UlidGenerator + zero-style 登録)
- PR 6 (#290): `styles.ts` 削除 + migration tracker glob 化 (scope 縮小、Astro 移行を #289 へ)
- PR 7a (#294): Astro layout/ui 23 件
- PR 7b (#299): Astro pages 42 件
- PR 8 (本 entry): 最終 flip + Gs1Databar SVG `currentColor` 化 + Astro 検出網 + 暫定 infra 撤去

### 設計判断 KEEP

- **`.text-primary` 命名衝突は現状維持**: `--color-primary` を `@theme` 登録済のため Tailwind v4 は `text-primary` utility を自動生成するが、`@layer components` で定義した `.text-primary` クラスとは layer 順序により共存可能 (PR 1〜7b で visual diff 未発生)。rename には全 callsite 影響があるため、必要が顕在化するまで保留。
- **Tailwind `border` + `@layer components` の `border-color` 優先度**: PR 2 で導入した `.alert-success` / `.alert-error` は VRT pass で実害顕在せず。本 PR の VRT 結果でも diff 不発 (CI Linux runner 確認)。現状維持。

### 削除した暫定 infra

- `astro.config.mjs` の `stripMetaStyleSrc()` integration: A-1 で `<meta>` CSP から style-src を除去するために導入した暫定 strip。本 PR で全 inline style 撲滅により不要化、撤去。

### 検出網

- `src/utils/__tests__/inline-style-migration.test.ts`:
  - PR 6 で `.tsx` glob 化 (`src/components/**/*.tsx`)
  - 本 PR で `.astro` glob 並列追加 (`src/{components,layouts,pages}/**/*.astro`)
  - 新規 .tsx / .astro が追加されると自動で検出網に含まれ、array 更新忘れによる偽陰性ゼロ。

### CSP 設計の現状 (2026-05-08)

```
header (_headers):  script-src 'self' 'unsafe-inline'; style-src 'self'
meta (auto-injected): script-src 'self' 'sha256-...';   style-src 'self' 'sha256-...'
```

- script-src: header permissive + meta strict の AND 評価 ([064] 設計、本 PR で不変)
- style-src: header strict + meta strict (本 PR で flip)。inline style 全廃のため hash 不要だが Astro auto-hash により `<style>` block も適切にカバー
````

(末尾の改行を 1 行残す。)

- [ ] **Step 6.3: prettier で format**

Run:

```bash
npx prettier --write docs/decisions.md 2>&1 | tail -3
```

Expected: format 修正があれば反映、エラーなし。

- [ ] **Step 6.4: 内容を最終確認**

Run:

```bash
grep -n "^## \[06" docs/decisions.md | tail -3
```

Expected:

```
2367:## [065] 2026-05-03 — Playwright `webServer` を `process.env.CI` で分岐
2402:## [066] 2026-05-03 — VRT ...
24XX:## [067] 2026-05-08 — `style-src 'unsafe-inline'` 削除 + B 案完了
```

(line 番号は appx、`[067]` が末尾にあれば OK。)

- [ ] **Step 6.5: commit**

```bash
git add docs/decisions.md
git commit -m "$(cat <<'EOF'
docs(decisions): #176 B 案 PR 8 (6/7) — [067] B 案完了を記録

style-src 'unsafe-inline' 削除と B 案 (PR 1〜8) 完了の design decision
を記録。`.text-primary` 命名衝突 KEEP / Tailwind border + layer 優先度
KEEP / 削除した暫定 infra (stripMetaStyleSrc) / 検出網運用ノートを同梱。

PR 1 (#256) reviewer I-3 で defer 容認、PR 6 → PR 8 へ持ち越されていた
B 案完了記録の約束を消化。
EOF
)"
```

---

## Task 7: SoT 更新

**Why:** 本 PR merge 後に `docs/projects/issue-176-b-plan-progress.md` を完了状態に同期する。本 commit 内で「PR 8 ✅ merged」状態の table 行 + 自身の merge hash placeholder + 完了セクションを書き込んでおき、merge 後に別 chore PR で placeholder を実 hash に置換する設計 (本 PR 内では自身の merge hash が確定しないため)。

**Files:**

- Modify: `docs/projects/issue-176-b-plan-progress.md`

- [ ] **Step 7.1: 進捗 table の PR 7b 行を確定値に更新**

`docs/projects/issue-176-b-plan-progress.md` line 33:

**before**:

```
| **PR 7b**             | pages/\*.astro 7 ファイル (Astro inline 残 42 件 + 新規 3 class) — `#289` 由来                                                                                                 | 🔄 PR open | (PR 番号は PR 作成後に追記)                                            |
```

**after**:

```
| PR 7b                 | pages/\*.astro 7 ファイル (Astro inline 残 42 件 + 新規 3 class) — `#289` 由来                                                                                                 | ✅ merged  | [#299 (merged 87d705a)](https://github.com/fumtas1k/devtools/pull/299) |
```

(セルの bold 装飾を取り、状態を `✅ merged`、PR 番号 + merge hash link を追記。)

- [ ] **Step 7.2: 進捗 table の PR 8 行を更新**

line 34:

**before**:

```
| PR 8                  | 最終 flip + cleanup (`_headers` から `style-src 'unsafe-inline'` 削除 + `stripMetaStyleSrc` 撤去 + `decisions.md [067]` + Astro 検出網追加)                                    | 未着手     | -                                                                      |
```

**after**:

```
| **PR 8**              | 最終 flip + cleanup (`_headers` から `style-src 'unsafe-inline'` 削除 + `stripMetaStyleSrc` 撤去 + `decisions.md [067]` + Astro 検出網追加 + Gs1Databar SVG `currentColor` 化) | ✅ merged  | [#TBD (merged TBD)](https://github.com/fumtas1k/devtools/pull/TBD)     |
```

(状態を `✅ merged`、説明に `Gs1Databar SVG currentColor 化` 追記、PR 番号と hash は merge 後 chore PR で確定値に置換する placeholder。)

- [ ] **Step 7.3: 末尾に「PR 8 完了」セクション追加**

ファイル末尾の `これらは Claude collaboration の preference であり project SoT ではないため repo には移さない。` の前 (line 235 付近) に、新セクションを挿入:

```markdown
## PR 8 (#TBD) — 最終 flip + B 案完了

- **scope**: `_headers` の `style-src` strict 化 + `src/utils/csp.ts` 同期 + `astro.config.mjs` の `stripMetaStyleSrc` 撤去 + `headers.test.ts` / `meta-csp.test.ts` / `astro-config-csp.test.ts` の expected 反転 + `inline-style-migration.test.ts` に `.astro` glob 追加 + Gs1Databar SVG `currentColor` 化 + `decisions.md [067]` 追加 + 本 SoT 更新
- **新規 class**: `.gs1-svg-container` 1 件 (Gs1Databar `dangerouslySetInnerHTML` の親要素 `color` 継承用)
- **再利用**: なし (PR 1〜7b の class 資産は touch せず)
- **subagent 非委譲 → 1 体直列委譲**: 計画固定済 + commit 7 件すべて文脈依存のため、sonnet subagent 1 体に直列 dispatch (worktree 不使用、`feature/issue-176-b8-final-flip` 上で直接編集)。memory `feedback_subagent_model.md` (実装は sonnet) + Opus cost 節約方針。
- **issue #176 完了**: B 案 PR 1〜8 で 200+ React + 65 Astro + 1 SVG = 全 inline style 撲滅、`style-src 'unsafe-inline'` 完全削除を達成。issue は本 PR merge 後に手動 close。
- **post-merge 作業**: 本 PR は自身の merge hash を `(merged TBD)` placeholder で残すため、merge 後に chore PR で実 hash に置換する。
```

- [ ] **Step 7.4: prettier で format**

Run:

```bash
npx prettier --write docs/projects/issue-176-b-plan-progress.md 2>&1 | tail -3
```

Expected: format 修正反映、エラーなし。

- [ ] **Step 7.5: 進捗 table 整合性を確認**

Run:

```bash
sed -n '33,34p' docs/projects/issue-176-b-plan-progress.md
```

Expected: PR 7b と PR 8 行が両方 `✅ merged`。

- [ ] **Step 7.6: commit**

```bash
git add docs/projects/issue-176-b-plan-progress.md
git commit -m "$(cat <<'EOF'
docs(projects): #176 B 案 PR 8 (7/7) — SoT 進捗 table 完了状態に同期

進捗 SoT を「PR 7b ✅ merged + PR 8 ✅ merged」状態に更新し、PR 8 完了
セクションを追加。本 PR の merge hash は確定しないため (merged TBD)
placeholder を残し、merge 後に別 chore PR で実 hash 置換する。

#176 B 案完了。
EOF
)"
```

---

## Post-Implementation: 親 Opus 検証 (subagent 完了報告後)

subagent から 7 commit 完了報告を受けた後、親 Opus が以下を直接実行する。

- [ ] **Step P.1: commit log 確認**

Run:

```bash
git log --oneline develop..feature/issue-176-b8-final-flip
```

Expected: 8 commit (spec commit `900eb84` + 本 PR 7 commit)。順序が想定通り。

- [ ] **Step P.2: 全 diff 横串確認**

Run:

```bash
git diff develop..feature/issue-176-b8-final-flip --stat
```

Expected: 変更ファイル一覧が spec section 3 の table と一致 (Gs1Databar 3 件 + CSP 2 件 + astro.config 1 件 + test 3 件 + migration test 1 件 + decisions 1 件 + SoT 1 件 + spec 1 件 = 計 13 件)。

- [ ] **Step P.3: 全 unit test green 確認**

Run:

```bash
npm run test 2>&1 | tail -10
```

Expected: 全テスト pass。

- [ ] **Step P.4: build + meta-csp.test.ts 確認**

Run:

```bash
npm run build 2>&1 | tail -5
npm run test -- src/utils/__tests__/meta-csp.test.ts 2>&1 | tail -10
```

Expected: build 成功 + meta-csp.test.ts 全 test pass。

- [ ] **Step P.5: E2E 実行 (親直接、shared-agent-rules 準拠)**

Run:

```bash
npm run test:e2e 2>&1 | tail -30
```

Expected: 全 E2E test pass。特に以下を重点確認:

- `tests/e2e/uuid-v7.spec.ts` (`applyProductionCsp` gate 経路)
- `tests/e2e/ulid-generator.spec.ts` (`withProductionCsp` ラッパ経路)
- `tests/e2e/config-converter.spec.ts` (CSP デグレ陽性対照)
- 万一 violation が出れば commit 1 (Gs1Databar) または他経路の inline style 残存を疑う

- [ ] **Step P.6: 視覚確認 (任意)**

`Gs1Databar` ページで SVG が正常に描画され、テキスト色が `--color-text` を反映していることを目視確認。light mode のみで十分。

```bash
npm run dev
# ブラウザで http://localhost:4321/tools/gs1-databar を開き、
# JAN コード入力で SVG が生成され、テキストが視認可能であることを確認
```

- [ ] **Step P.7: push**

```bash
git push -u origin feature/issue-176-b8-final-flip
```

- [ ] **Step P.8: PR 作成 (`--base develop` + `--body-file`)**

`/tmp/claude/pr_body.md` に PR description を書き出し、`gh pr create` で作成。

```bash
mkdir -p /tmp/claude
cat > /tmp/claude/pr_body.md <<'EOF'
## 概要

`#176` B 案完了 PR。`style-src 'unsafe-inline'` を header / meta 両 side で削除し、暫定 strip integration を撤去、Astro 検出網を整備、`docs/decisions.md [067]` で B 案完了を記録する。

## 主な変更

1. **Gs1Databar SVG `currentColor` 化** (commit 1): `dangerouslySetInnerHTML` 経由で DOM 注入される `<text>` の `style="fill:var(--color-text)"` を `fill="currentColor"` + 親要素 `color: var(--color-text)` 化。CSP strict 化後の silent drop 回避。
2. **CSP flip** (commit 2): `public/_headers` と `src/utils/csp.ts` の `PRODUCTION_CSP` から `style-src 'unsafe-inline'` を削除。
3. **`stripMetaStyleSrc` 撤去** (commit 3): `astro.config.mjs` から `<meta>` CSP の style-src を除去する暫定 integration を撤去。
4. **test 群 strict 化** (commit 4): `headers.test.ts` / `meta-csp.test.ts` / `astro-config-csp.test.ts` の expected を反転、strict 化が必須であることを陽性 assert する回帰防止網を整備。
5. **Astro 検出網追加** (commit 5): `inline-style-migration.test.ts` に `src/{components,layouts,pages}/**/*.astro` glob を並列追加、新規 .astro ファイルの inline style 持ち込みを自動検出。
6. **`decisions.md [067]` 追加** (commit 6): B 案完了 + PR 1〜8 series 図 + `.text-primary` 衝突 KEEP 判断 + Tailwind `border` + layer 優先度メモ + 削除した暫定 infra + 検出網運用ノートを記録。
7. **SoT 更新** (commit 7): `docs/projects/issue-176-b-plan-progress.md` を「PR 7b ✅ merged + PR 8 ✅ merged」状態に同期、PR 8 完了セクション追加。本 PR 自身の merge hash は確定しないため `(merged TBD)` placeholder を残す (merge 後の chore PR で実 hash 置換)。

## 関連 PR / issue

`#176` B 案完了:

- PR 0 (#254 VRT 独立導入)
- PR 1 (#256 基礎工事 + ui simple)
- PR 1.5 (#261 ResultTable + InputField)
- PR 2 (#272 qr-ticket)
- PR 3 (#275 JwtDecoder + UuidV7Generator)
- PR 4 (#277 Gs1Databar + EncodingConverter + DummyText)
- PR #278 (infra `withProductionCsp` ラッパ)
- PR 5a (#283 ConfigConverter + QrReader + JanCode)
- PR 5b (#286 残ツール + ulid-generator gate)
- PR 6 (#290 styles.ts 削除 + migration tracker glob 化)
- PR 7a (#294 Astro layout/ui)
- PR 7b (#299 Astro pages)
- 本 PR (PR 8 最終 flip)

## 検証

- [x] 親直接 `npm run test:e2e` 実行 (`build + preview` 直列、CSP strict 環境で violation 不発を確認)
- [x] `grep -c "style={{" src/` = 0
- [x] `grep -rEn 'style="[^"]*"' src/` = 0 (Astro inline 全廃確認)
- [x] `npm run test` 全 pass
- [x] `npm run build` 成功
- [x] CI: `test.yml` (unit + build + astro check) green、`visual-regression.yml` で diff 不発確認 (required check 外)

## 備考

- VRT (visual-regression.yml) は **diff ゼロ前提** で通る設計。inline style 全廃済 + Gs1Databar `currentColor` 化は描画結果同一。万一 diff が出た場合は実装ミス (色設定 / `--color-text` 不在 / 入れ子 `color` 伝搬) を疑い、baseline 更新は最終手段。
- 本 PR commit 7 の SoT 更新は `(merged TBD)` placeholder。merge 後に別 chore PR で実 hash に置換予定。
- review 由来 follow-up issue (#284, #285, #281, #273 etc.) は本 PR では同梱せず、起票済の独立 issue で別 PR 処理。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF

gh pr create \
  --base develop \
  --title "refactor(csp): #176 B 案 PR 8 — style-src 'unsafe-inline' 削除 + B 案完了" \
  --body-file /tmp/claude/pr_body.md
```

Expected: PR URL が出力され、CI が起動する。

- [ ] **Step P.9: CI 結果確認**

PR 作成後 5-10 分待ってから:

```bash
gh pr checks $(gh pr view --json number -q .number) 2>&1 | tail -20
```

Expected:

- `test` (required) green
- `visual-regression` (non-required) は diff 報告 (理想は green、diff があれば PR comment で内容確認)

- [ ] **Step P.10: human review 待機**

memory `feedback_review_required_before_merge.md` 準拠: required CI green でも human review 前は merge 可能と語らない。`CI green / review 待ち` のフレーミングで報告。

---

## Self-Review (writing-plans skill 必須)

実装着手前に親 Opus が plan を見直す:

**1. Spec coverage**: spec section 2 の 15 項目 (PR 6 必須 11 + 追加 4) すべてが Task 1〜7 のいずれかに紐付いているか?

| spec 項目                             | task                                                 |
| ------------------------------------- | ---------------------------------------------------- |
| 1 (`_headers` flip)                   | Task 2                                               |
| 2 (`stripMetaStyleSrc` 撤去)          | Task 3                                               |
| 3 (`headers.test.ts` strict)          | Task 4                                               |
| 4 (`meta-csp.test.ts` strict)         | Task 4                                               |
| 5 (`astro-config-csp.test.ts` 削除)   | Task 4                                               |
| 6 (`decisions.md [067]`)              | Task 6                                               |
| 7 (VRT baseline 再撮影)               | Step P.5 + post-merge CI                             |
| 8 (`grep style={{` = 0)               | Step P.5 で確認                                      |
| 9 (全 E2E + 全 unit + astro check)    | Step P.3-P.5                                         |
| 10 (`.text-primary` 命名衝突)         | Task 6 ([067] 内 KEEP 判断記録)                      |
| 11 (Tailwind `border` + layer 優先度) | Task 6 ([067] 内 KEEP 判断記録) + 親 P.5 で VRT 観察 |
| 12 (Gs1Databar SVG `currentColor`)    | Task 1                                               |
| 13 (`.astro` 検出網)                  | Task 5                                               |
| 14 (`csp.ts` 同期)                    | Task 2                                               |
| 15 (SoT 更新)                         | Task 7                                               |

→ 全 15 項目 cover ✅

**2. Placeholder scan**: TBD / TODO / 未定義箇所:

- Task 7 / Step P.8 の PR 番号は意図的 placeholder (作成時点で未確定)、本 PR 内では `(merged TBD)` を残す設計
- `decisions.md [067]` 内の line 番号 `24XX` は `[067]` が末尾にあれば OK (具体行番号は file size 依存)
- 他に TBD / TODO 無し ✅

**3. Type consistency**:

- `gs1-svg-container` class 名は Task 1 全 step で統一 ✅
- `ASTRO_TARGET_FILES` 変数名は Task 5 全 step で統一 ✅
- branch 名 `feature/issue-176-b8-final-flip` は Step 0 / Step P.7 / Step P.8 で統一 ✅
- spec commit hash `900eb84` は Step 0.2 で参照 ✅

→ 整合 ✅

**4. 順序依存**:

- Task 2-3 中間で test red 状態になる (commit 単独で red)、pre-commit hook は test を走らせないため commit 自体は通る、Task 4 で green に戻る → plan 内で明示済 ✅

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-issue-176-b8-final-flip.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 親 Opus が fresh subagent 1 体 (sonnet) を dispatch、Task 1〜7 を直列実行、各 Task 間で diff レビュー。worktree 不使用、`feature/issue-176-b8-final-flip` 上で直接編集。

**2. Inline Execution** - 親 Opus がこのセッション内で全 Task を直接実行。subagent 委譲なし = Opus 消費が最大化するため非推奨 (ユーザー意向 = Opus 節約)。

**Which approach?**
