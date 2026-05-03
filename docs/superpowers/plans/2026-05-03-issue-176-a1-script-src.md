# #176 A-1: `script-src 'unsafe-inline'` 削減 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Astro 6.x の `security.csp` 機能を有効化し、`public/_headers` の CSP から `script-src 'unsafe-inline'` を削除する。`<meta http-equiv="content-security-policy">` 経由のハッシュベース許可で全 inline script を CSP 適合させる。`style-src 'unsafe-inline'` は本 PR スコープ外（B 案で別途）。

**Architecture:** `astro.config.mjs` に `security.csp` を追加して Astro の build pipeline が処理する inline `<script>` (Astro island loader 等) を自動 hash 化させる。`BaseLayout.astro` の SW 登録 `<script is:inline>` は Astro pipeline を bypass するため `is:inline` を外して module bundle 経路に乗せる（Astro が hash 化）。`public/_headers` から `script-src 'unsafe-inline'` を削除し、`src/utils/csp.ts:PRODUCTION_CSP` と `src/utils/__tests__/headers.test.ts` も同期。`applyProductionCsp` ヘルパは無変更（response header strict + dist の `<meta>` の AND 評価が browser 側で成立する）。

**Tech Stack:** Astro 6.1.5 (`security.csp.algorithm: 'SHA-256'` / `scriptDirective` config)、Vitest（headers.test.ts）、Playwright（preview ベース、#247 で整備済み）。

---

## 重要な前提

- **#247 マージ済み**: E2E は preview ベース。`<meta>` ベース CSP も実評価される
- **`#176` issue のコメント PoC 結論**: A-1（Astro built-in）が第一推奨、A-2 は fallback、A-3 は不可
- **本 PR は script-src のみ**: style-src（`style={{}}` 200+ 箇所の React inline style）は別 PR
- **dist の inline script 構成（baseline 計測済み）**:
  - 全ページ: SW `is:inline` script (1 本) + JSON-LD `<script type="application/ld+json">` (data, CSP 対象外)
  - ツールページのみ追加: Astro island loader inline script (1 本)
  - 他 inline executable script なし
- **Astro 公式 docs 仕様**:
  - `security.csp.scriptDirective.hashes` で手動 hash 列挙可能
  - `Astro.csp?.insertScriptHash()` で動的 hash 注入可能（`.astro` 内）
  - bundled scripts (Astro pipeline 経由) は自動 hash 化
  - dev mode は非対応（preview/build のみ） — #247 で対応済み

---

## ファイル構成

| 種別   | パス                                  | 役割                                                                  |
| ------ | ------------------------------------- | --------------------------------------------------------------------- |
| Modify | `astro.config.mjs`                    | `security.csp` ブロックを追加                                         |
| Modify | `src/layouts/BaseLayout.astro`        | SW 登録 `<script>` から `is:inline` を削除（Astro pipeline に乗せる） |
| Modify | `public/_headers`                     | CSP から `script-src 'unsafe-inline'` を削除（`'self'` のみ残す）     |
| Modify | `src/utils/csp.ts`                    | `PRODUCTION_CSP` 定数を新 CSP 値に同期                                |
| Modify | `src/utils/__tests__/headers.test.ts` | アサートを新 CSP 値に同期、`'unsafe-inline'` 不在を陽性チェック       |
| Verify | `tests/e2e/helpers.ts`                | `applyProductionCsp` の挙動確認（コードはそのまま）                   |
| Modify | `docs/decisions.md`                   | 新規 [064] エントリ追加、L1865（[054]）クロスリンク更新               |

---

## Task 1: 現状ベースラインを実機で確認（観察のみ）

**目的**: `security.csp` 適用前の dist 状態を再確認し、後続の比較基準を固定する。

**Files:** 触らない

- [ ] **Step 1: build & inline script inventory**

```bash
npm run build 2>&1 | tail -3
echo "===non-data inline scripts in dist/index.html==="
grep -oE "<script[^>]*>" dist/index.html
echo "===tool page (qr-code) inline script bodies==="
perl -ne 'if(/<script>(.+?)<\/script>/){print "INLINE: ",$1,"\n---\n"}' dist/tools/qr-code/index.html
echo "===total inline <script> count per page==="
grep -c "<script>" dist/index.html dist/tools/qr-code/index.html dist/about/index.html
```

期待:

- `dist/index.html`: SW inline script (1 本) + 外部 module 2-3 本 + JSON-LD 1 本
- ツールページ: SW + Astro island loader inline (合計 inline 2 本)
- 他に "executable inline script" 無し

- [ ] **Step 2: dev server で SW 登録が機能していることを確認**（後で preview と挙動比較するため）

```bash
npm run pretest:e2e
npm run dev &
sleep 4
curl -s http://localhost:4321/ | grep -oE "<script[^>]*>" | head -5
curl -sI http://localhost:4321/sw.js | head -3
kill %1 2>/dev/null
```

期待: `/sw.js` が 200 で返ること（dev でも SW ファイルが配信されている）。

- [ ] **Step 3: コミットなし**

---

## Task 2: `astro.config.mjs` に `security.csp` を有効化

**Files:**

- Modify: `astro.config.mjs`

- [ ] **Step 1: 現状確認**

```bash
cat astro.config.mjs
```

期待表示:

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://devtools-d9w.pages.dev',
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    build: {
      // #246: Vite の小 asset inline 化を無効化…
      assetsInlineLimit: 0,
    },
  },
});
```

- [ ] **Step 2: `security.csp` を追加**

`integrations` の後に以下を追加:

```js
  // #176 A-1: Astro built-in CSP で `<meta http-equiv="content-security-policy">` を各ページに注入し、
  // bundled scripts (Astro island loader 等の inline `<script type="module">` 含む) を自動で SHA-256 hash 化。
  // 結果として `public/_headers` の `script-src` から `'unsafe-inline'` を安全に削除できる。
  // dev mode では security.csp は無効（公式仕様）。E2E は preview ベース (#247) で評価する。
  security: {
    csp: {
      algorithm: 'SHA-256',
    },
  },
```

完成形（diff の該当部分）:

```js
export default defineConfig({
  site: 'https://devtools-d9w.pages.dev',
  integrations: [react(), sitemap()],
  security: {
    csp: {
      algorithm: 'SHA-256',
    },
  },
  vite: {
    ...
  },
});
```

- [ ] **Step 3: build して `<meta>` 注入を確認**

```bash
npm run build 2>&1 | tail -3
grep "http-equiv" dist/index.html
grep "http-equiv" dist/tools/qr-code/index.html
```

期待: 両ページで `<meta http-equiv="content-security-policy" content="...">` が出力される。`content` は `script-src 'self' 'sha256-xxx' 'sha256-yyy' ...; style-src 'self' 'sha256-xxx';` のような形。

- [ ] **Step 4: SW script が `<meta>` にカバーされているか確認**

```bash
echo "===meta CSP content==="
grep -oE 'content="[^"]+"' dist/index.html | head -1
echo "===SW inline script body==="
perl -ne 'if(/<script>\s*if .'\''serviceWorker'\''/.../<\/script>/){print}' dist/index.html | head -10
```

判定:

- もし meta に SW script の sha256 hash が含まれていない場合 → Task 3 で対処（is:inline 削除）
- 含まれている場合 → Task 3 は不要（その場合は Task 4 へ進む）

> 注: 現時点の予測では `is:inline` script は Astro pipeline を bypass するため auto-hash されない。Task 3 で対処する想定。

- [ ] **Step 5: コミット**

```bash
git add astro.config.mjs
git commit -m "feat(security): Astro security.csp を有効化し inline script を hash 化 (#176)"
```

---

## Task 3: SW 登録 script から `is:inline` を削除

**目的**: `<script is:inline>` は Astro pipeline を bypass し auto-hash 対象外。`is:inline` を外すと Astro が module 化して bundling し、bundled script として CSP `<meta>` に hash が自動で乗る。SW 登録は `window.addEventListener('load', ...)` で defer 実行のため module の defer セマンティクスとも両立する。

**Files:**

- Modify: `src/layouts/BaseLayout.astro:51-57`

- [ ] **Step 1: 現状確認**

```bash
sed -n '51,58p' src/layouts/BaseLayout.astro
```

期待表示:

```html
<script is:inline>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js');
    });
  }
</script>
```

- [ ] **Step 2: `is:inline` を削除**

`src/layouts/BaseLayout.astro:51` の `<script is:inline>` を `<script>` に変更:

```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js');
    });
  }
</script>
```

中身（SW 登録ロジック）は無変更。

- [ ] **Step 3: build して SW script の処理結果を確認**

```bash
npm run build 2>&1 | tail -3
echo "===dist/index.html の <script> 全件==="
grep -oE "<script[^>]*>" dist/index.html | sort -u
echo "===meta CSP content==="
grep -oE 'content="[^"]+"' dist/index.html | head -1
echo "===SW inline body 残存チェック==="
grep -c "serviceWorker" dist/index.html
```

期待:

- SW script は外部 `/_astro/<hash>.js` として bundle される（`<script type="module" src="...">`）か、または inline `<script type="module">` として残るが auto-hash される
- `script-src` に `'sha256-...'` が複数列挙される
- もし SW が外部 file になった場合、`grep -c "serviceWorker" dist/index.html` は 0 になる（外部 ref のみ残る）

- [ ] **Step 4: SW 登録が preview で機能することを確認**

```bash
npm run pretest:e2e
npx astro preview --port 4321 &
sleep 3
# 簡易確認: トップページを取得して script タグと _headers の整合
curl -s http://localhost:4321/ | grep -oE "<script[^>]*>" | head -5
curl -sI http://localhost:4321/sw.js | head -1
kill %1 2>/dev/null
```

期待: `/sw.js` が 200 で配信、build 結果通りの script tag が HTML にある。

- [ ] **Step 5: 単一 spec の E2E で動作確認**

```bash
npm run pretest:e2e
npx playwright test tests/e2e/config-converter.spec.ts --workers=1 --reporter=list
```

期待: 13/13 pass（CSP 関連 spec も含む。response header はまだ `'unsafe-inline'` を許可しているので strict ではない。Task 4 後に再評価）。

- [ ] **Step 6: コミット**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "refactor(layout): SW 登録 script の is:inline を外し security.csp の auto-hash 対象にする (#176)"
```

---

## Task 4: `public/_headers` から `script-src 'unsafe-inline'` を削除

**Files:**

- Modify: `public/_headers:4`

- [ ] **Step 1: 現状確認**

```bash
cat public/_headers
```

期待表示（CSP 行抜粋）:

```
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests
```

- [ ] **Step 2: `script-src 'self' 'unsafe-inline'` を `script-src 'self'` に変更**

`public/_headers` の CSP 行から `script-src 'self' 'unsafe-inline'` を `script-src 'self'` に変更（`'unsafe-inline'` トークンのみ削除）。`style-src 'self' 'unsafe-inline'` は無変更（B 案スコープ）。

完成行:

```
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests
```

- [ ] **Step 3: コミット（次の Task 5 と同 PR でまとめる方が一貫性高いので、Task 5 まで commit を保留しても可）**

ここでは保留せず単独で commit する方針:

```bash
git add public/_headers
git commit -m "security: public/_headers の script-src から 'unsafe-inline' を削除 (#176)"
```

---

## Task 5: `src/utils/csp.ts` の PRODUCTION_CSP を同期

**Files:**

- Modify: `src/utils/csp.ts:14-26`

- [ ] **Step 1: 現状確認**

```bash
cat src/utils/csp.ts
```

期待: `script-src 'self' 'unsafe-inline'; ` の行がある。

- [ ] **Step 2: PRODUCTION_CSP の `script-src` 行を更新**

L19 を変更:

Before:

```ts
  "script-src 'self' 'unsafe-inline'; " +
```

After:

```ts
  "script-src 'self'; " +
```

`style-src 'self' 'unsafe-inline'; ` (L18) は無変更。

- [ ] **Step 3: コミットは Task 6 と一括でも単独でも可。ここでは Task 6 と一括にする方針**

---

## Task 6: `src/utils/__tests__/headers.test.ts` のアサーションを更新 + 陽性チェック追加

**Files:**

- Modify: `src/utils/__tests__/headers.test.ts:79-81`

- [ ] **Step 1: 現状確認**

```bash
sed -n '79,90p' src/utils/__tests__/headers.test.ts
```

期待:

```ts
it('script-src は self を含む', () => {
  expect(csp).toMatch(/script-src[^;]*'self'/);
});
```

- [ ] **Step 2: `script-src` の `'unsafe-inline'` 不在を陽性チェックに追加**

L79-81 を以下に書き換え:

```ts
it("script-src は self のみで 'unsafe-inline' を含まない (#176)", () => {
  // #176 A-1: Astro security.csp の <meta> ハッシュベース許可に移行したため、
  // _headers 側の script-src からは 'unsafe-inline' を撤廃した。
  // 万一 'unsafe-inline' が再付与されると、本テストが落ちて CSP 緩和の事故を即時検出する。
  expect(csp).toMatch(/script-src[^;]*'self'/);
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
});
```

`style-src` のテスト（L83-88）は **無変更**（B 案スコープ）。

- [ ] **Step 3: vitest 実行**

```bash
npm run test -- src/utils/__tests__/headers.test.ts
```

期待: 全 pass。`script-src は self のみで 'unsafe-inline' を含まない (#176)` 含む。

- [ ] **Step 4: Task 5 + Task 6 を一括コミット**

```bash
git add src/utils/csp.ts src/utils/__tests__/headers.test.ts
git commit -m "test(security): PRODUCTION_CSP と headers.test.ts を script-src strict に同期 (#176)"
```

---

## Task 7: 全 E2E を実行し、strict CSP 下で全件 pass を確認

**目的**: `applyProductionCsp` ヘルパが route 介入で response header に新 PRODUCTION_CSP を注入する。preview 由来の `<meta>` と AND 評価され、`'unsafe-inline'` 完全 strict 環境下で全 spec が pass することを確認。

**Files:** 触らない（観察のみ。回帰があれば個別対応）

- [ ] **Step 1: 全 E2E を 1 worker で実行**

```bash
npm run pretest:e2e
npm run test:e2e -- --workers=1 2>&1 | tee "$TMPDIR/e2e-176-a1.log"
```

期待: 144 passed / 1 skipped / 0 failed（#247 と同じ）。

- [ ] **Step 2: 失敗があれば分類**

| 種別                                                   | 対応                                                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| inline script の auto-hash 漏れ                        | 該当 inline script を特定。`is:inline` だったか / Astro pipeline で漏れたか調査。前者なら Task 3 と同様に `is:inline` 削除、後者なら `Astro.csp?.insertScriptHash()` で手動補強 |
| SW 登録の hydration timing 差                          | preview と dev の hydration 遅延差。spec 側の `waitForReactHydration` timeout 調整（最終手段）                                                                                  |
| CSP `<meta>` と response header の interpretation 衝突 | browser が AND 評価で stricter を採用するため通常は強くなる方向。違反検出されたら本 PR の方針見直し                                                                             |

- [ ] **Step 3: 修正があれば commit を分けて記録、再実行**

- [ ] **Step 4: applyProductionCsp 陽性対照テストの確認**

```bash
npx playwright test tests/e2e/config-converter.spec.ts --grep "applyProductionCsp は実際に CSP 違反を捕捉する" --workers=1
```

期待: pass（陽性対照は強くなった CSP 下でも違反を捕捉できる）。

---

## Task 8: SW 登録の preview 動作確認（手動）

**目的**: SW が新 CSP 環境でも正しく登録されることをブラウザで確認する。E2E は SW 登録の成否を直接検証していないため。

**Files:** 触らない

- [ ] **Step 1: preview 起動 + ブラウザで確認**

```bash
npm run pretest:e2e
npm run preview &
sleep 3
echo "Open http://localhost:4321/ in browser and verify:"
echo "  1. DevTools Console: 'CSP' 関連 violation message が出ていない"
echo "  2. DevTools Application > Service Workers: /sw.js が registered & active"
echo "  3. ページリロードで SW から fetch される（Network タブで Service Worker provided）"
echo "(then) kill %1"
```

> 自動テストでカバーしきれない領域。**実機ブラウザで 1 度確認**してから commit / PR push する。

- [ ] **Step 2: 確認 OK ならコミット不要、NG なら原因に応じて対応**

---

## Task 9: `docs/decisions.md` に [064] 追加 + クロスリンク

**Files:**

- Modify: `docs/decisions.md`（L1865 の `'unsafe-inline'` クロスリンク更新、末尾に [064] 追加）

- [ ] **Step 1: 既存 L1865 のクロスリンク更新**

該当箇所を grep で見つける:

```bash
grep -n "'unsafe-inline'" docs/decisions.md | head -5
```

L1865 の `(追跡 issue: [#176](...)）。なお dev / preview server の挙動差で security.csp が未検証だった件は [063] で解消した。` を以下に更新:

After:

```
（追跡 issue: [#176](https://github.com/fumtas1k/devtools/issues/176)）。なお dev / preview server の挙動差で security.csp が未検証だった件は [063] で解消、`script-src 'unsafe-inline'` 削減は [064] で実施。
```

加えて [063] の関連欄（後続 issue 行）にも `[064] で完了` の旨を追記（任意・一貫性のため推奨）。

- [ ] **Step 2: 末尾に [064] を追加**

末尾（[063] の後ろ）に新規エントリを追加:

```markdown
---

## [064] 2026-05-03 — `script-src 'unsafe-inline'` 削減: Astro `security.csp` 採用

**2026-05-03 | ステータス: 採用**

### 背景

[054] で導入した CSP は `script-src 'self' 'unsafe-inline'` を含み、Astro の hydration runtime / island 制御スクリプト / `is:inline` ScriptWorker 登録が inline `<script>` で出力されるため `'unsafe-inline'` が必須だった。これは `dangerouslySetInnerHTML` 利用箇所（QrCode / Gs1Databar / qr-ticket GenerateTab の 3 箇所）が将来 sink 化した場合に XSS 防御が効かない既知の弱点だった。[#176](https://github.com/fumtas1k/devtools/issues/176) で 3 案 PoC 並走の結果、A-1（Astro `security.csp` 採用）が第一推奨と確定。E2E の preview 切替（[063]）が完了し A-1 を安全に検証できる土台が整ったため本 PR で実施。

### 決断

`astro.config.mjs` に `security: { csp: { algorithm: 'SHA-256' } }` を追加し、Astro の build pipeline が処理する inline `<script>` を自動で SHA-256 hash 化、`<meta http-equiv="content-security-policy">` を各ページに注入する。

- `BaseLayout.astro` の SW 登録 `<script is:inline>` は Astro pipeline を bypass するため `is:inline` を削除し、Astro が module bundle 経路で処理する形に変更（auto-hash の対象に）
- `public/_headers` の `script-src 'self' 'unsafe-inline'` から `'unsafe-inline'` を削除し `script-src 'self'` に
- `src/utils/csp.ts:PRODUCTION_CSP` と `src/utils/__tests__/headers.test.ts` を同期、`'unsafe-inline'` 不在を陽性アサート
- `applyProductionCsp` ヘルパ（[061] 由来）は無変更。response header (route 介入) と `<meta>` (build 由来) が browser 側で AND 評価されるため、本 PR で初めて [063] が用意した「AND 評価」が実体化する

### 残課題（B 案 — 別 PR）

`style-src 'unsafe-inline'` は依然として残る。React TSX の `style={{...}}` 200+ 箇所が build 後 `style="..."` 属性として出力されるためで、属性ベース inline style は CSP 仕様上 hash/nonce 照合の対象外。CSS Modules / scoped style への段階移行（[#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B）を別途進める。

### 却下した選択肢

- **A-2 post-build hash 化（自前 integration）**: `astro:build:done` フックで dist HTML をパースして hash 化する自前実装。Astro builtin が stable なため不要。将来 builtin に互換問題が出た場合の fallback として A-2 PoC ローカル報告書のみ残す。
- **A-3 CSP3 strict-dynamic + nonce**: 静的 SSG では per-request nonce を発行できず、固定 nonce は CSP-Evaluator が HIGH severity 判定。Astro が 1 ページに nonce 無し inline script 3〜4 本を生成しているため `strict-dynamic` の transitive trust も活きない。実装不可。
- **SW 登録 script の手動 hash 列挙 (`scriptDirective.hashes`)**: SW script の中身を変更するたびに hash 再計算が必要。`is:inline` 削除のほうが zero-maintenance で堅牢。

### 影響 / 移行

- **CSP の XSS 緩和効果**: `script-src 'unsafe-inline'` 撤廃により、上記 3 箇所の `dangerouslySetInnerHTML` 利用箇所が将来 sink 化した場合のインライン XSS 注入が CSP で block されるようになる
- **build 出力**: 全ページに `<meta http-equiv="content-security-policy" content="script-src 'self' 'sha256-...' ...; style-src 'self' 'sha256-...';">` が注入される（dist サイズわずかに増、誤差レベル）
- **dev mode**: `security.csp` は dev で動作しない（[063] で確認済の Astro 公式仕様）。dev は引き続き `'unsafe-inline'` 許容で動作するため開発体験への影響なし。E2E は preview ベース ([063]) で評価
- **CSP gate 強度**: `applyProductionCsp` ヘルパが response header strict + `<meta>` hash の AND を評価する形に実体化。新たな inline script を追加すると CI が違反検出して止まる
- **後続作業**: B 案（`style-src 'unsafe-inline'` 削減）は独立 PR として継続

### 関連 PR / issue

- 本 PR: 実装時に番号置換
- 解消する issue: [#176](https://github.com/fumtas1k/devtools/issues/176)（A-1 完了）
- 前提依存: [063]（E2E preview 切替）／[061]（CSP 違反 CI 検知ゲート）／[054]（CSP 初導入）
- 後続: [#176](https://github.com/fumtas1k/devtools/issues/176) の B 案（`style-src 'unsafe-inline'` 削減）
```

- [ ] **Step 3: docs-references vitest を実行**

```bash
npm run test -- tests/meta/docs-section-references.test.ts
```

期待: pass。

- [ ] **Step 4: コミット**

```bash
git add docs/decisions.md
git commit -m "docs(decisions): [064] script-src 'unsafe-inline' 削減を記録 (#176)"
```

---

## Task 10: 自動メモリ更新

**Files:**

- Modify: `~/.claude/projects/-Users-fumta-projects-devtools/memory/feedback_prod_parity_csp.md`

- [ ] **Step 1: メモリ末尾に [064] 適用後の状態を追記**

「**2026-05-03 update（#246 / [063]）**: ...」の後に、新たに `**2026-05-03 update（#176 / [064]）**: ...` を追加し、「`script-src 'unsafe-inline'` を撤廃。`<meta>` の sha256 hash と response header の strict CSP の AND 評価が CI gate として実体化」旨を記録。

- [ ] **Step 2: コミットなし**（メモリは git 管理外）

---

## Task 11: 最終検証 → push → PR 作成

**Files:** 触らない

- [ ] **Step 1: develop ベース確認**

```bash
git rev-parse origin/develop
git merge-base HEAD origin/develop
```

期待: 一致。

- [ ] **Step 2: 全ゲート最終 run**

```bash
npm run test 2>&1 | tail -5
node_modules/.bin/astro check 2>&1 | tail -5
npm run test -- tests/meta/docs-section-references.test.ts 2>&1 | tail -5
npm run pretest:e2e
npm run test:e2e -- --workers=1 2>&1 | tail -10
```

期待: 全 pass。

- [ ] **Step 3: スコープ外 diff チェック**

```bash
git diff origin/develop --name-only
git diff origin/develop -- '*.tsx' '*.astro' | grep -E '^-.*aria-' || echo "OK: aria 削除なし"
```

想定変更ファイル:

- `astro.config.mjs`
- `src/layouts/BaseLayout.astro`
- `public/_headers`
- `src/utils/csp.ts`
- `src/utils/__tests__/headers.test.ts`
- `docs/decisions.md`
- `docs/superpowers/plans/2026-05-03-issue-176-a1-script-src.md`

- [ ] **Step 4: push**

```bash
git push -u origin feature/issue-176-a1-script-src
```

- [ ] **Step 5: PR 作成（`--base develop` 必須）**

```bash
gh pr create --base develop \
  --title "security: CSP の script-src から 'unsafe-inline' を削除 (Astro security.csp 採用) (#176)" \
  --body-file "$TMPDIR/pr-176.md"
```

PR 本文には:

- 概要（#176 A-1 採用）
- 主な変更点（astro.config / BaseLayout / \_headers / csp.ts / headers.test / decisions [064]）
- スコープ外（style-src は B 案で別途）
- 検証結果（unit / astro check / E2E + meta テスト）
- SW 登録の手動確認結果
- 後続（B 案）

---

## 完了基準

- [ ] `public/_headers` の CSP `script-src` から `'unsafe-inline'` が消えている
- [ ] `dist/*.html` 全ページに `<meta http-equiv="content-security-policy">` が注入され `script-src` に hash が列挙されている
- [ ] `npm run test`（unit） / `astro check` 全 pass
- [ ] `npm run test:e2e`（preview ベース）が新 strict CSP 下で全件 pass
- [ ] `applyProductionCsp` 陽性対照テストが新 CSP 下でも違反を捕捉
- [ ] preview 環境で SW 登録が機能することを実機確認
- [ ] `docs/decisions.md` [064] が追加され、L1865（[054]）にクロスリンクが入っている
- [ ] PR が `--base develop` で作成され、CI green
