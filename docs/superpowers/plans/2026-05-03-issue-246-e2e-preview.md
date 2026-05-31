# E2E を astro preview ベースへ切替 + ドキュメント整合 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** E2E テスト一式を `astro preview`（ビルド済み `dist/` 配信）ベースで起動するよう Playwright 構成・CI・関連ドキュメントを整合させ、後続の #176 で導入する `security.csp` の `<meta>` ベース CSP を E2E が実環境同等に検証できる状態にする。

**Architecture:** `playwright.config.ts:webServer.command` を `npm run dev` から「`npm run build` で `dist/` を生成 → `astro preview` で配信」する形に切り替える。`applyProductionCsp` ヘルパは現状ロジック（route 介入で response header に `PRODUCTION_CSP` を上書き）を維持し、preview 由来の `<meta>` と AND 評価される構成にする。CI（`.github/workflows/test.yml`）の e2e job にも `npm run build` を追加する。ドキュメント側（`shared-agent-rules.md` / `playbooks/e2e-validation.md` / `playbooks/pr-creation.md` / `decisions.md` / `README.md` / `CLAUDE.md`）は preview 前提に書き直し、`docs/decisions.md` に新規エントリ [063] を追加して L1867 の「将来課題」を解消した旨をクロスリンクする。

**Tech Stack:** Astro 6.1.5（`build` / `preview` モード）、Playwright（`webServer` 統合）、GitHub Actions（`actions/checkout@v4` / `setup-node@v4`）、Vitest（`tests/docs-references.test.ts` / `headers.test.ts`）。

---

## ファイル構成

| 種別   | パス                                                      | 役割                                                                                 |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Modify | `playwright.config.ts`                                    | `webServer.command` を `astro preview` 系へ切替、`timeout` を build 時間込みに延長   |
| Modify | `package.json`                                            | `pretest:e2e` で port kill に加え、必要なら build 連結方針を反映                     |
| Modify | `.github/workflows/test.yml`                              | e2e job に `npm run build` step を追加                                               |
| Verify | `tests/e2e/helpers.ts`                                    | `applyProductionCsp` の動作が preview 上でも変わらないことを確認（コードはそのまま） |
| Modify | `.agents/rules/common.md`                                 | 2 章コマンド表に preview 経由である旨を補足                                          |
| Modify | `docs/playbooks/e2e-validation.md`                        | 全体を preview 前提に書き直し                                                        |
| Modify | `docs/playbooks/pr-creation.md`                           | E2E 行に preview 経由を追記                                                          |
| Modify | `docs/decisions.md`                                       | 新規 [063] エントリ追加、L1867 にクロスリンク追記                                    |
| Modify | `README.md`                                               | E2E 行に preview 経由を 1 行補足（任意・簡潔さ重視で省略可）                         |
| Modify | `CLAUDE.md`                                               | 「最重要ルール（要約）」の検証行に preview 経由を補足                                |
| Modify | `.claude/projects/.../memory/feedback_prod_parity_csp.md` | preview ベースで `<meta>` も検証可能と更新（自動メモリ）                             |

---

## Task 1: preview サーバーを単独起動して挙動を確認する

**目的**: `astro preview` が dev と同じ port 4321 で配信できること、`dist/` が必要であることを実機で確認する。設定変更前のベースライン。

**Files:**

- 触らない（手動実行のみ）

- [ ] **Step 1: build 成果物を最新化**

```bash
npm run build
```

期待: エラー無しで `dist/` 配下が更新される。`dist/index.html` `dist/tools/*/index.html` が生成される。

- [ ] **Step 2: preview を起動して port 4321 を確認**

```bash
npx astro preview --port 4321
```

期待: ターミナルに `Listening on http://localhost:4321/` 等が出る。別端末で `curl -sI http://localhost:4321/ | head -5` を叩き、`HTTP/1.1 200 OK` が返ること。Ctrl+C で停止。

- [ ] **Step 3: preview 起動コマンドを確定**

判断: `npm run preview` script は `astro preview` を呼ぶだけ。port は CLI の `--port 4321` で固定。**`webServer.command` 内で `npm run build && npm run preview -- --port 4321` と直列連結する** 方針を採用する（CI 側でも同じ流れになり一貫する）。

- [ ] **Step 4: コミットなし**（観察のみ）

---

## Task 2: `playwright.config.ts` を preview ベースに切り替える

**Files:**

- Modify: `playwright.config.ts:24-30`

- [ ] **Step 1: 現状の webServer 設定を確認**

```bash
sed -n '24,32p' playwright.config.ts
```

期待表示:

```ts
  webServer: {
    command: 'npm run dev',
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321',
    timeout: 30_000,
    reuseExistingServer: true,
  },
```

- [ ] **Step 2: webServer を build + preview に書き換え**

`playwright.config.ts:24-30` を以下に差し替え:

```ts
  webServer: {
    // #246: security.csp の `<meta>` を含めた本番相当 CSP を E2E で評価するため
    // dev server ではなく `astro build` 後の `dist/` を `astro preview` で配信する。
    // build はキャッシュが効くと数秒、cold でも 15〜25s 程度。preview 起動は瞬時。
    command: 'npm run build && npm run preview -- --port 4321',
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321',
    // build 時間を含むため 30s → 120s に延長（cold start でも収まる余裕）
    timeout: 120_000,
    reuseExistingServer: true,
  },
```

- [ ] **Step 3: 単一ファイルの E2E を 1 本だけ走らせて preview 起動が成功することを確認**

```bash
npm run pretest:e2e
npx playwright test tests/e2e/config-converter.spec.ts --project=chromium --workers=1
```

期待: `webServer was not ready` で失敗しないこと。スペックの個別テスト assertion のみが評価対象になること。

- [ ] **Step 4: 失敗があれば原因を切り分け**

- `webServer was not ready` → `timeout: 120_000` を更に増やすか、`npm run build` が失敗していないか別ターミナルで確認
- `404` 連発 → `dist/` の生成が想定外。`npm run build` が dirty 状態でないか確認
- CSP 違反 → 後続タスクで扱うため一旦記録のみ

- [ ] **Step 5: コミット**

```bash
git add playwright.config.ts
git commit -m "test(e2e): Playwright の webServer を astro preview ベースに切替 (#246)"
```

---

## Task 3: 全 E2E を preview 上で実行し、回帰を洗い出す

**Files:**

- 触らない（観察と必要に応じた個別修正のみ。回帰が出た場合は別 step で追記する）

- [ ] **Step 1: 全 E2E を 1 worker で直列実行**

```bash
npm run pretest:e2e
npm run test:e2e -- --workers=1 2>&1 | tee "$TMPDIR/e2e-preview-run.log"
```

期待: 全件 pass。実行時間（build 込み）を計測してメモる（PR 本文に書く値）。

- [ ] **Step 2: 失敗したテストがあれば分類**

| 種別                                                  | 対応                                                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| dev / preview のレンダリング差（hydration timing 等） | 個別に `waitForReactHydration` の timeout を延ばす等で対処、commit を分ける                                                       |
| アセット参照差 (`/_astro/...` ハッシュ違い)           | スペック側がハッシュ前提に書かれていないか確認（通常は relative）                                                                 |
| `applyProductionCsp` 配下のテストが新たに違反検出     | 想定通り。preview の HTML には `<meta>` が無い（#176 未実装段階）ため、ヘッダだけで評価される。dev 時と等価のはずなので原因を特定 |

- [ ] **Step 3: 個別修正をしたら都度コミット**

例:

```bash
git add tests/e2e/<file>.spec.ts
git commit -m "test(e2e): preview 上での hydration timing に追従 (#246)"
```

- [ ] **Step 4: 全件 pass を確認したら、所要時間を控えておく**

```bash
grep -E "^\s*[0-9]+ passed" "$TMPDIR/e2e-preview-run.log" | tail -1
grep -E "(Slow test|Total)" "$TMPDIR/e2e-preview-run.log" | tail -5
```

メモ値: `dev 比 +XX 秒` を Task 9 の PR 本文に書く。

---

## Task 4: `applyProductionCsp` メタテストが preview 上でも陽性を保つことを確認

**目的**: 「ガード自体が動作している」陽性対照（`tests/e2e/config-converter.spec.ts:242` の「`applyProductionCsp` は実際に CSP 違反を捕捉する」）が preview 配下でも `assertNoViolations` を意図通り throw すること。

**Files:**

- 触らない（確認のみ）

- [ ] **Step 1: 該当メタテストを単独で実行**

```bash
npx playwright test tests/e2e/config-converter.spec.ts --grep "applyProductionCsp は実際に CSP 違反を捕捉する" --workers=1
```

期待: pass（陽性対照が違反を捕捉して、テストとしては成功扱い）。

- [ ] **Step 2: コミットなし**

---

## Task 5: CI workflow に build step を追加する

**Files:**

- Modify: `.github/workflows/test.yml:56-72`

- [ ] **Step 1: 現状の e2e job を確認**

```bash
sed -n '56,80p' .github/workflows/test.yml
```

期待表示:

```yaml
e2e:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: npm
    - run: npm ci
    - name: Playwright ブラウザをインストール
      run: npx playwright install --with-deps chromium
    - name: E2E テストを実行
      run: npm run test:e2e
```

- [ ] **Step 2: 判断ポイント**

`webServer.command` 内で `npm run build && npm run preview` を直列実行している（Task 2）ため、CI 側で別途 `npm run build` step を分けても **重複しない**：Playwright は `reuseExistingServer: true` で既に上がっていれば skip する。CI で別 step を立てる利点:

- ログが `Build` と `E2E` で分かれて読みやすい
- build 失敗を E2E job 内で早期に切り分けられる

→ **CI 側でも明示的に `npm run build` step を追加する**。`webServer.command` は安全網として残す（手元実行時に build 忘れを防ぐ）。

- [ ] **Step 3: build step を追加**

`.github/workflows/test.yml` の e2e job に、Playwright インストール step の **後ろ**、E2E 実行 step の **前** に以下を挿入:

```yaml
- name: 本番相当アセットを build（E2E は preview 経由で配信するため必要）
  run: npm run build
```

完成形（該当部分のみ抜粋）:

```yaml
- run: npm ci

- name: Playwright ブラウザをインストール
  run: npx playwright install --with-deps chromium

- name: 本番相当アセットを build（E2E は preview 経由で配信するため必要）
  run: npm run build

- name: E2E テストを実行
  run: npm run test:e2e
```

- [ ] **Step 4: yml の syntax を確認**

```bash
node -e "const yaml = require('js-yaml'); yaml.load(require('fs').readFileSync('.github/workflows/test.yml','utf8')); console.log('valid')"
```

期待: `valid`。`js-yaml` が devDependencies に無ければ skip し、目視確認で代替。

- [ ] **Step 5: コミット**

```bash
git add .github/workflows/test.yml
git commit -m "ci: e2e job に build step を追加し preview 配信に対応 (#246)"
```

---

## Task 6: ドキュメント整合 — `shared-agent-rules.md` / `playbooks/*`

**Files:**

- Modify: `.agents/rules/common.md:34-39`
- Modify: `docs/playbooks/e2e-validation.md`（複数箇所）
- Modify: `docs/playbooks/pr-creation.md:67`

- [ ] **Step 1: `.agents/rules/common.md:34-39` のコマンド表を更新**

L34-39 の表を以下に差し替え（行頭スペース・パイプ位置を保つ）:

```markdown
| 用途                                  | コマンド                                         |
| :------------------------------------ | :----------------------------------------------- |
| 開発サーバー (http://localhost:4321)  | `npm run dev`                                    |
| 本番ビルド / プレビュー               | `npm run build` / `npm run preview`              |
| 整形 / 整形チェック                   | `npm run format` / `npm run format:check`        |
| 型チェック（コミット前必須）          | `node_modules/.bin/astro check`                  |
| ユニットテスト (Vitest)               | `npm run test` / `npm run test:watch`            |
| E2E テスト (Playwright, preview 経由) | `npm run test:e2e` ❌ `npm run e2e` は存在しない |
```

差分: E2E 行のラベルに「(Playwright, preview 経由)」を追記。

- [ ] **Step 2: `docs/playbooks/e2e-validation.md` 冒頭に preview 前提の注記を追加**

L8 直後（`---` の後）に新セクションを追加:

```markdown
## 0. 実行モードの前提

`npm run test:e2e` は **`astro build` 済みの `dist/` を `astro preview` で配信して実行する**（playwright.config.ts の `webServer.command` で連結済み）。理由:

- 本番 (Cloudflare Pages) の `<meta>` ベース CSP を含むビルド成果物に対して E2E を回し、prod-parity を確保するため（`docs/decisions.md` [063]）
- Astro の `security.csp` 機能は dev mode で動作せず build/preview のみで有効（[公式 docs](https://docs.astro.build/en/reference/configuration-reference/#securitycsp)）

`webServer.timeout` は build 時間を含むため 120s に延長してある（cold start でも収まる余裕）。
```

- [ ] **Step 3: `docs/playbooks/e2e-validation.md` 4 章「失敗パターンの判定」を更新**

L56-59 の `webServer was not ready` 判定箇所を以下に差し替え:

```markdown
- **環境由来の失敗**（`waitForReactHydration` timeout、`Error: connect ECONNREFUSED 127.0.0.1:4321`、`Timed out waiting for server to start`、`webServer was not ready` 等）→ ステップ 0 の整地と `npm run build` が成功するかの確認を実施してから 1 回だけ再実行
- 再実行でも環境由来失敗が続く場合 → **CI を最終判断とする**（push して CI 結果を待つ）

> 補足: `playwright.config.ts` の `webServer.timeout` は 120s（PR #247、#246 で 30s → 120s に延長。build 時間込み）。env 由来失敗の発見はこのタイムアウトで早期に確定する。
```

- [ ] **Step 4: `docs/playbooks/e2e-validation.md` 5 章「コマンドリファレンス」を更新**

L74 の E2E 行を:

```markdown
| E2E テスト | `npm run test:e2e` ❌ `npm run e2e` は存在しない（内部で build + preview を直列起動） |
```

- [ ] **Step 5: `docs/playbooks/e2e-validation.md` 6.1 を更新**

L86-92 の port 4321 説明を以下に差し替え:

```markdown
E2E が `ECONNREFUSED 127.0.0.1:4321` や `webServer was not ready` で失敗する場合、前回の dev server / preview server が残っている可能性。preview と dev は同じ port 4321 を使うため、どちらが残っていても衝突する。
```

- [ ] **Step 6: `docs/playbooks/pr-creation.md:67` を更新**

```markdown
| 3 | E2E 直列実行 | `npm run test:e2e`（preview 経由・複数 worktree がある場合は同時実行しない、詳細は `e2e-validation.md` 3 章） |
```

- [ ] **Step 7: 各 doc の `<file>.md N 章` 形式参照ドリフト検出 vitest を実行（PR #245 で導入）**

```bash
npm run test -- tests/docs-references.test.ts
```

期待: 全 pass。失敗した場合は参照箇所と章番号を一致させる。

- [ ] **Step 8: コミット**

```bash
git add .agents/rules/common.md docs/playbooks/e2e-validation.md docs/playbooks/pr-creation.md
git commit -m "docs: E2E を preview 経由で実行する旨を rules / playbooks に反映 (#246)"
```

---

## Task 7: `docs/decisions.md` に新規エントリ [063] 追加 + L1867 にクロスリンク

**Files:**

- Modify: `docs/decisions.md:1865-1867`（クロスリンク追記）
- Modify: `docs/decisions.md` 末尾（新規 [063] 追加）

- [ ] **Step 1: 既存 L1865 / L1867 にクロスリンクを追記**

L1865 の `'unsafe-inline'` 注記文末（`継続的に検討する（追跡 issue: [#176]...）。`）の後に半角スペースを挟んで追加:

> 追加文: `なお dev / preview server の挙動差で security.csp が未検証だった件は [063] で解消した。`

L1867 の「将来課題とする。」を以下に差し替え:

```markdown
- ℹ️ E2E テストでのヘッダ検証は、Playwright が `npm run dev`（Astro dev server）経由で起動しており dev server は `_headers` を解釈しないため、本 PR では `public/_headers` ファイル内容の Vitest 単体テストに留めた。preview サーバーまたは実デプロイ後の検証は将来課題とする → **[063] で E2E を preview ベースに移行して解消**。
```

- [ ] **Step 2: 末尾（[062] の後）に新規 [063] を追加**

```markdown
---

## [063] 2026-05-03 — E2E を `astro dev` から `astro build && astro preview` ベースに切替

**2026-05-03 | ステータス: 採用**

### 背景

[054] で導入した CSP は `public/_headers` 経由でレスポンスヘッダとして配信される。後続の [#176] 改善（`script-src 'unsafe-inline'` 削減）で採用予定の Astro 6.x `security.csp` 機能は、ビルド時に各ページへ `<meta http-equiv="content-security-policy">` を注入してインラインスクリプト/スタイルをハッシュベースで許可する。

しかし [Astro 公式ドキュメント](https://docs.astro.build/en/reference/configuration-reference/#securitycsp) は明確に、`security.csp` は **dev mode で動作せず build/preview モードのみで有効** と記載している。`playwright.config.ts:webServer.command` は `npm run dev` を起動していたため、このまま [#176] を採用しても E2E は `<meta>` 不在の環境で回り、本番との prod-parity が崩れる（[061] で同種の dev/prod 乖離による事故が発生済み）。

[054] 末尾の「preview サーバーまたは実デプロイ後の検証は将来課題とする」の解消にもあたる。

### 決断

`playwright.config.ts:webServer.command` を `npm run build && npm run preview -- --port 4321` に切り替え、E2E を `dist/` 配信に対して実行する。

- `webServer.timeout` は build 時間を含むため 30s → 120s に延長
- CI（`.github/workflows/test.yml`）の e2e job にも `npm run build` step を明示追加（ログ可読性 + 早期失敗切り分け）
- `applyProductionCsp` ヘルパは現状ロジック（route 介入で response header に `PRODUCTION_CSP` を上書き）を維持。preview 由来の `<meta>` と AND 評価される構成にする
- `.agents/rules/common.md` / `docs/playbooks/e2e-validation.md` / `docs/playbooks/pr-creation.md` / `README.md` / `CLAUDE.md` を preview 前提に整合

### 却下した選択肢

- **dev のまま維持し、`<meta>` 注入だけ E2E helper で再現**: `dist/` の build 成果物から `<meta>` を抽出して注入する設計が必要で、build 出力と E2E 注入の二重管理になり brittle。prod-parity の本質（実ビルド成果物への E2E）から外れる。
- **`wrangler pages dev` で E2E を駆動**: [061] で同様検討済み。起動コスト・依存追加が CI 全体に波及する。preview で十分。
- **`security.csp` 採用を諦めて [#176] を A-2 (post-build hash 化) に倒す**: A-2 は実装複雑度・将来 Astro builtin との互換性で劣る。preview 切替は本番一致のため独立して価値があり、[#176] 以外にも波及効果がある（同種の eval 依存事故 [061] の早期検知精度向上）。

### 影響 / 移行

- **E2E 実行時間**: cold start で build に 15〜25s 程度上乗せ。`reuseExistingServer: true` のためローカル連続実行では 2 回目以降スキップ。CI では毎回 build が走る（許容範囲）
- **手元実行**: `npm run test:e2e` のコマンドは変わらない。内部的に build が走るため初回は数十秒かかる旨を `e2e-validation.md` 0 章に明記
- **port 4321**: dev / preview で同じため衝突リスクは変わらず。`npm run pretest:e2e` の port kill ロジックも変更不要
- **preview と dev の挙動差**: hydration timing がわずかに異なる可能性あり（実装時に検出された場合は個別 spec の `waitForReactHydration` timeout 調整で対応）
- **後続作業の解禁**: [#176] の A-1 PR が安全に着手可能になる

### 関連 PR / issue

- 本 PR: #247
- 前提となる issue: #246
- 後続: #176（A-1 採用）
- 過去: [054]（CSP 初導入）／[061]（CSP 違反 CI 検知ゲート初導入）
```

- [ ] **Step 3: docs-references vitest を再実行**

```bash
npm run test -- tests/docs-references.test.ts
```

期待: pass。

- [ ] **Step 4: コミット**

```bash
git add docs/decisions.md
git commit -m "docs(decisions): [063] E2E を astro preview ベースに切替を記録 (#246)"
```

---

## Task 8: `README.md` / `CLAUDE.md` の最低限の補足

**Files:**

- Modify: `README.md:51` 周辺
- Modify: `CLAUDE.md` の最重要ルール検証行

- [ ] **Step 1: `README.md:51` の E2E 行を確認**

```bash
sed -n '45,55p' README.md
```

- [ ] **Step 2: 必要なら 1 行補足**

L51 を以下に差し替え（または「内部で build + preview を起動」を簡潔に追記）:

```markdown
npm run test:e2e # E2Eテスト実行（内部で build + preview を起動）
```

> 判断: README は新規ユーザー向け。詳細は playbook に集約しているため簡潔に留める。

- [ ] **Step 3: `CLAUDE.md` の最重要ルール検証行を確認**

```bash
grep -n "test:e2e" CLAUDE.md
```

- [ ] **Step 4: 必要なら preview 経由を追記**

「**`npm run test:e2e` は push 前に必ず実行**」の補足カッコ内に「preview 経由」を追加するか、後置で「（内部で build + preview を直列起動）」を入れる。playbook へのリンクは既存のため、コマンド文字列の変更だけで足りる。

例:

```markdown
- **検証**: `npm run test`（ユニット）と `astro check`（型）はサブエージェント / 親共通。**`npm run test:e2e` は push 前に必ず実行**（subagent worktree か親で。内部で build + preview を直列起動。post-PR 代行は不要、CI が最終ゲート）。node_modules 不在の worktree は `npm ci` で整備（SessionStart hook で自動実行）。詳細手順 → `docs/playbooks/e2e-validation.md`
```

- [ ] **Step 5: docs-references vitest を再実行**

```bash
npm run test -- tests/docs-references.test.ts
```

- [ ] **Step 6: コミット**

```bash
git add README.md CLAUDE.md
git commit -m "docs: README / CLAUDE.md の E2E 行に preview 経由を補足 (#246)"
```

---

## Task 9: 自動メモリの更新

**Files:**

- Modify: `/Users/fumta/.claude/projects/-Users-fumta-projects-devtools/memory/feedback_prod_parity_csp.md`

- [ ] **Step 1: 既存メモリを確認**

```bash
cat ~/.claude/projects/-Users-fumta-projects-devtools/memory/feedback_prod_parity_csp.md
```

- [ ] **Step 2: 「preview 経由で `<meta>` ベース CSP も検証可能になった（#246 / [063]）」を追記**

該当ファイルの本文に「How to apply」セクションがあれば、「現在 E2E は preview 起動なので `<meta>` 由来 CSP も実評価される」旨を 1 行追加。

- [ ] **Step 3: コミットなし**（メモリは git 管理外）

---

## Task 10: 最終検証 → push → PR 作成

**Files:**

- 触らない（検証と PR 作成のみ）

- [ ] **Step 1: develop ベース確認**

```bash
git rev-parse origin/develop
git merge-base HEAD origin/develop
```

期待: 両者一致。

- [ ] **Step 2: ユニット + 型チェック + docs-references**

```bash
npm run test
node_modules/.bin/astro check
```

期待: 全 pass / 0 errors。

- [ ] **Step 3: E2E 全件 pass を最終確認**

```bash
npm run pretest:e2e
npm run test:e2e -- --workers=1 2>&1 | tee "$TMPDIR/e2e-final.log"
```

期待: 全件 pass。

- [ ] **Step 4: aria-\* 削除等のスコープ外 diff チェック**

```bash
git diff origin/develop --name-only
git diff origin/develop -- '*.tsx' '*.astro' | grep -E '^-.*aria-' || echo "OK: aria 削除なし"
```

- [ ] **Step 5: push**

```bash
git push -u origin feature/issue-246-e2e-preview-v2
```

- [ ] **Step 6: PR 作成**（`gh pr create --base develop` を必ず明示）

PR 本文ファイル: `$TMPDIR/pr-246.md`（HEREDOC でバックスラッシュ escape しないこと、メモリ「HEREDOC No Escape」参照）。本文には:

- 概要（issue #246 の解消）
- 主な変更点（playwright.config / CI / docs / decisions [063]）
- 計測値（dev → preview 切替で +XX 秒）
- 検証ログ（`npm run test` / `astro check` / `npm run test:e2e` 全 pass）

```bash
gh pr create --base develop \
  --title "test(e2e): Playwright を astro preview ベースに切替 + ドキュメント整合 (#246)" \
  --body-file "$TMPDIR/pr-246.md"
```

- [ ] **Step 7: PR URL を控える**

返ってきた URL を memory もしくは active context に控え、CI 結果を待ってから #176 の A-1 着手判断を行う。

---

## 完了基準

- [ ] `npm run test:e2e` が preview ベースで全件 pass
- [ ] `npm run test`（unit）/ `astro check` 全 pass
- [ ] `tests/docs-references.test.ts` 全 pass
- [ ] `.github/workflows/test.yml` の e2e job に build step が追加されている
- [ ] `.agents/rules/common.md` / `docs/playbooks/*.md` / `docs/decisions.md` / `README.md` / `CLAUDE.md` に preview 前提が反映されている
- [ ] `docs/decisions.md` に新規 [063] エントリと L1865 / L1867 のクロスリンクが入っている
- [ ] PR が `--base develop` で作成され、CI が green
