# Playbook: E2E 検証 / push 前チェックリスト

**いつ読むか**: バグ修正・UI 挙動変更を実装中 / push 前 / E2E が落ちた時。

基本宣言（E2E は実装と同時に書く・push 前に必ず実行）は `.agents/rules/common.md` 3 章を参照。

---

## 0. 実行モードの前提

`npm run test:e2e` は **`astro build` 済みの `dist/` を `astro preview` で配信して実行する**（`playwright.config.ts` の `webServer.command` で連結済み）。理由:

- 本番 (Cloudflare Pages) のビルド成果物に対して E2E を回し、prod-parity を確保するため（`docs/decisions.md` [063]）。後続 [#176](https://github.com/fumtas1k/devtools/issues/176) 採用時には `<meta>` ベース CSP も生成されるため、その評価基盤を先回りで整備する位置付けでもある
- Astro の `security.csp` 機能は dev mode で動作せず build/preview のみで有効（[公式 docs](https://docs.astro.build/en/reference/configuration-reference/#securitycsp)）

`webServer.timeout` は CI で 30s / Local で 120s（[#248] で `process.env.CI` 分岐に変更）。CI では `.github/workflows/test.yml` 側で事前 build 済みのため preview 起動の早期検知に倒し、Local は build 込みのため余裕を持たせている。

---

## 1. E2E 実装の原則

- **E2E テストコードの追加は義務**: バグ修正・UI 挙動変更時は E2E テストコードを **必ず実装と同時に書く**。後回し禁止（`.agents/rules/common.md` 3 章）。
- **`npm run test:e2e` は push 前に必ず実行**: subagent worktree か親セッションで通す。post-PR 代行は不要、CI が最終ゲート。

---

## 2. push 前必須チェックリスト

### 2.1 サブエージェント版

以下をすべて満たしてから完了報告する。**1 つでも未完了の場合は push せず、未完了の項目を完了報告に明記して親に判断を仰ぐ**。

| #   | チェック項目          | コマンド                                                                                   |
| --- | --------------------- | ------------------------------------------------------------------------------------------ |
| 0   | node_modules 整備     | `npm ci`（新規作成 worktree では必須。fresh worktree なら 5〜10 秒で完了。詳細は下記参照） |
| 1   | develop ベース確認    | `git rev-parse origin/develop` と `git merge-base HEAD origin/develop` が一致              |
| 2   | ユニットテスト全 pass | `npm run test`                                                                             |
| 3   | 型チェック            | `node_modules/.bin/astro check`（0 errors）                                                |
| 4   | E2E テスト            | `npm run test:e2e`（env 不備で走らない場合は未完了の旨を明記して親に引き継ぐ）             |

> **ステップ 0 の補足**: fresh subagent isolation worktree では node_modules が存在しないため、素の `npm ci` のみで十分（過去の `scripts/agent-worktree-setup.sh` は不要と判明し、issue #241 / decisions [062] で廃止）。`.claude/settings.json` の SessionStart hook は session 開始時のみ fire するため、mid-session で `git worktree add` した worktree には適用されない。新規作成 worktree では作成直後に手動で `npm ci` を実行する必須ステップとして扱うこと。
>
> **既存パッケージの version 操作・削除に注意**: `.idea/` `.vscode/` を同梱する推移依存パッケージ（現プロジェクトでは `iconv-lite` / `stream-replace-string`）の upgrade / uninstall は sandbox の write 制約で EPERM になる可能性あり。新規追加 (`npm install foo`) は影響なし。詳細は issue #241 参照。

### 2.2 親セッション版

PR 作成手順を含むため `docs/playbooks/pr-creation.md` 3 章を参照。

---

## 3. push 前 E2E の実行責任 / worktree 並走時の注意

- **subagent worktree で push する場合**: subagent が pre-push チェックの一部として `npm run test:e2e` まで通す。env 不備（古い node_modules / port 4321 占有 / vite serving allow list エラー等）が原因で走らない場合は親に引き継ぐ
- **親セッションが直接 push する場合**: 親が `npm run test:e2e` を pre-push で走らせる
- **CI**: post-push の最終ゲート。pre-push で通っていれば green になることを期待

### worktree 並走時の注意

- 複数 subagent worktree が同時に E2E を回すとポート 4321 が衝突する。**1 worktree ずつ実行する**
- agent worktree は新規作成時 node_modules が空または不整合なため、push 前必須チェックリストのステップ 0 (worktree 整地) を必ず先行する

---

## 4. 失敗パターンの判定

- **テスト本来の失敗**（assertion error、要素が見つからない等）→ 修正してから再実行
- **環境由来の失敗**（`waitForReactHydration` timeout、`Error: connect ECONNREFUSED 127.0.0.1:4321`、`Timed out waiting for server to start`、`webServer was not ready` 等）→ ステップ 0 の整地と `npm run build` が成功するかの確認を実施してから 1 回だけ再実行
- 再実行でも環境由来失敗が続く場合 → **CI を最終判断とする**（push して CI 結果を待つ）

> 補足: `playwright.config.ts` の `webServer.timeout` は CI で 30s / Local で 120s（[#248] で `process.env.CI` 分岐に変更）。CI では `.github/workflows/test.yml` 側で事前 build 済みのため preview 起動の早期検知に倒し、Local は build 込みのため余裕を持たせている。env 由来失敗の発見は CI のタイムアウトで早期に確定する。

> macOS/Linux 前提。Windows/WSL では別手段（`netstat -ano` + `taskkill` 等）が必要。

> ポート 4321 以外を使う場合は `4321` を対象ポートに読み替える。

---

## 5. コマンドリファレンス（抜粋）

| 用途                       | コマンド                                                                                                                             |
| :------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| ユニットテスト             | `npm run test` / `npm run test:watch`                                                                                                |
| 型チェック                 | `node_modules/.bin/astro check`                                                                                                      |
| 型チェック（特定ファイル） | `npx astro check --filter <file>`                                                                                                    |
| E2E テスト                 | `npm run test:e2e` ❌ `npm run e2e` は存在しない（local では内部で build + preview を直列起動。CI は事前 build 済みで preview のみ） |
| node_modules 整備          | `npm ci`                                                                                                                             |
| port 4321 解放             | `npm run pretest:e2e`                                                                                                                |

---

## 6. 緊急復旧（普段は不要、トラブル時のみ）

通常は SessionStart hook の auto `npm ci` と push 前必須チェックリストで十分。以下は稀な環境異常時に手順を思い出すためのリファレンス。

### 6.1 port 4321 が占有されている

E2E が `ECONNREFUSED 127.0.0.1:4321` や `webServer was not ready` で失敗する場合、前回の dev server / preview server が残っている可能性。preview と dev は同じ port 4321 を使うため、どちらが残っていても衝突する。

```bash
npm run pretest:e2e   # 既存 npm script。中身は lsof -ti:4321 | xargs kill -9
```

`npm run test:e2e` は pre-hook で自動実行するので、通常は気にしなくて良い。手動で kill だけしたい時に使う。

> Local では `reuseExistingServer: false`（[#248]）に変更したため、開発者が手動で
> `npm run preview` を別途起動した状態で `npm run test:e2e` を回すと、Playwright は
> 既存 server を再利用せず port 4321 を新規 bind しようとして衝突する。手動 preview を
> 終了してから E2E を回すか、`npm run pretest:e2e` で port を解放する。

### 6.2 node_modules が壊れて `npm ci` が EPERM で失敗する

`.idea/` `.vscode/` 同梱パッケージの版差で `rm -rf node_modules` が EPERM 中断する稀ケース。`npm ci` 内部の rm でも同症状になる。

```bash
# 該当ディレクトリだけ /tmp に退避してから npm ci
mv node_modules/iconv-lite/.idea "$TMPDIR/abandoned-idea-$$" 2>/dev/null
mv node_modules/stream-replace-string/.vscode "$TMPDIR/abandoned-vscode-$$" 2>/dev/null
rm -rf node_modules
npm ci
```

`mv` が通って `rm` が EPERM になるのは sandbox の `.idea/.vscode` 保護による（issue #241 の検証で判明）。

### 6.3 `~/.npm` が root-owned で `npm ci` が EACCES

過去に `sudo npm install` した形跡がある環境で発生。

**永続修復（推奨・1 回のみ）**:

```bash
sudo chown -R "$(id -u):$(id -g)" ~/.npm
```

**ワークアラウンド（その場限り）**:

```bash
npm ci --cache "$TMPDIR/npm-cache"
```

### 6.4 sandbox 由来の read-only な node_modules ファイル

過去 PR #168 / #181 / #188 で発生した古い症状。長期間再利用された worktree で sandbox 経由の install が積み重なって権限がねじれる。fresh subagent isolation worktree では発生しないが、参考として残す。

```bash
chmod -R u+w node_modules 2>/dev/null || true
rm -rf node_modules
npm ci
```

詳細は `docs/agent-lessons.md` 2026-05-01 entry「worktree の node_modules が古いと E2E が hydration timeout で大量失敗する」参照。

---

## 7. Visual Regression Test (VRT)

**いつ読むか**: ui コンポーネント / page layout の visual 変更を伴う PR を作成 / レビューする時。

### 7.1 VRT の位置付け

- 実行: 専用 workflow `Visual Regression`（PR trigger）が `npm run test:vrt` を起動
- 通常 e2e (`npm run test:e2e`) は VRT を実行しない（playwright project 分離による）
- VRT は **required check に含めない**（意図的 visual 変更が merge を block しない設計）
- 結果: PR comment と artifact (`playwright-report`) で報告
- baseline 配置: `tests/e2e/visual-regression.spec.ts-snapshots/*-linux.png` (CI Linux runner で生成)

### 7.2 PR comment に diff が出た時の判断フロー

1. PR comment 内の `Workflow run` リンクから diff 画像を確認
2. **意図的な visual 変更**（design system update / 新 component 追加 / 意図的 layout 調整）の場合:
   - GitHub Actions UI で `Update Visual Regression Baseline` workflow を **本 PR のブランチ** で `workflow_dispatch` trigger
   - bot が baseline を更新して commit back
   - `git pull` で baseline を receive、push（branch protection は feature branch なので問題なし）
   - VRT が pass し PR comment が「✅ 全 36 件 pass」に更新される
3. **意図しない visual 変更**（regression）の場合:
   - 該当変更を fix
   - VRT が pass するまで commit & push を repeat
4. 判断保留で merge したい場合:
   - VRT は required ではないので fail のままでも merge は可能
   - ただし develop の baseline と乖離した状態で merge すると後続 PR で diff が大量発生するため、極力避ける

### 7.3 VRT のローカル実行

```bash
npm run test:vrt
```

> ⚠️ ローカル mac で実行すると CI Linux baseline と OS 差で fail する。**ローカル baseline (`*-darwin.png`) は通常 commit しない**。development 用に残す場合のみ `--update-snapshots` で生成（ただし git に commit しないこと）。CI 上の Linux baseline (`*-linux.png`) のみが SoT。

### 7.4 VRT 自体の architecture 変更（rare ops）

- spec は `tests/e2e/visual-regression.spec.ts`
- mock は `addInitScript` で `Math.random` / `Date.now` を固定（spec 上部参照）
- 新 page を VRT 対象に追加: spec の `PAGES` 配列に path 追記 → baseline 再生成
- 新 viewport 追加: `VIEWPORTS` 配列に追記 → baseline 再生成
- 詳細: `docs/decisions.md` [066]

### 7.5 develop branch protection の現状（issue #255 I-1）

`gh api repos/<owner>/<repo>/branches/develop/protection` は 2026-05-09 時点で
**404 "Branch not protected"** を返す。develop は **branch protection 未設定** の状態。

**solo dev 体制での影響評価（重要）**:

本リポジトリは「PR 作成者 = レビュアー = merger が同一人物」の solo dev 体制。
GitHub branch protection の主要オプションを solo dev に当てはめると:

| protection オプション                 | solo dev での効果                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `Require pull request before merging` | △ PR workflow を強制するだけで「他人による review」を強制しない                 |
| `Require approvals` (N≥1)             | × **self-approve 不可で自分の PR が永久 merge 不能になり詰む**（GitHub policy） |
| `Restrict who can push`               | △ direct push を禁じるが、PR 経由の self-merge は依然可能                       |
| `Bypass list` 管理                    | × そもそも protection 無効のため audit 対象なし                                 |

→ **`Require approvals` が使えない以上、branch protection 単体では「review なしマージを block する」
効果は solo dev では得られない**。issue #255 が当初想定した「bypass list 経由の許可漏れ」概念は
team 体制を前提としており、solo dev には直接適用できない。

**bot push の実体は「PR diff の一部」**:

`update-visual-baseline.yml` の最終 step は `git push` で baseline を更新するが:

- `actions/checkout@v6` の `ref: ${{ github.head_ref || github.ref_name }}` により
  bot は **PR の feature branch に push する**（develop に直 push しない）。
- bot の baseline 変更は **既存 PR の diff の一部** として PR comment / files changed に表示され、
  user (= 自分) が PR 上で目視確認可能。
- workflow には `if: github.ref != 'refs/heads/develop' && !main` で default branch 上での
  `workflow_dispatch` 誤 trigger を no-op にする二次 safety がある。

→ bot は review pipeline を bypass せず、user 通常 PR review (7.2 章のフロー) に乗っている。
solo dev で必要なのは **「VRT PR comment が出た PR は merge 前に必ず diff 目視」という運用規律**であって、
branch protection 設定変更ではない。この目視運用は 7.2 章で既に明文化済み。

**結論（本 issue I-1 の actionable 範囲）**:

- 短期: **追加対策不要**。既存 workflow 設計 (`if: !default-branch` + bot push を PR branch 限定 + 7.2 章の目視運用) で
  solo dev に妥当な review 経路は確保されている。
- 中期: `peter-evans/create-pull-request` 化は team 体制 (review 担当 vs PR 作成者が別人) なら有効だが、
  solo dev では「baseline 専用 PR が分離されて視認性向上」程度の限定的効果。**pursue は user 判断**。
- 体制が team に移行した場合は本章を再評価し、`Require approvals` + bypass list 管理 + peter-evans 化を
  まとめて検討する。

### 7.6 Baseline PNG への secret 混入予防（issue #255 I-2）

baseline PNG は CI runner で生成され git にコミットされる。一度焼き付くと:

- text-based scan（git-secrets / gitleaks）の盲点で検出されない
- git 履歴は rewrite 困難で permanent leak になりがち

**実装済み防御層 (PR #255 系)**:

1. **spec 層**: `tests/e2e/visual-regression.spec.ts` の `addInitScript` 冒頭で
   `localStorage.clear()` / `sessionStorage.clear()` を実行。将来 spec に
   `setItem('apiKey', ...)` 等が誤って追加されても、init script で直前に clear することで
   永続化前の baseline 撮影を保証する。
2. **workflow 層**: `update-visual-baseline.yml` の build 前に
   `*_KEY` / `*_TOKEN` / `*_SECRET` / `*_PASSWORD` / `*_CREDENTIAL` 命名の env var が
   流れていないか early-fail check。`GITHUB_TOKEN` のみ exact match (`GITHUB_TOKEN_FOO=` の意図せぬ allow を防ぐ)、
   `RUNNER_*` / `GITHUB_RUN_*` / `ACTIONS_*` / `GH_*` / `PIP_*` / `PYPI_*` は GH Actions runtime 由来として prefix allow。

**Layer 1 の scope 限定（重要）**:

`localStorage.clear()` / `sessionStorage.clear()` は **storage-based 焼き付き** のみ対処する。以下の経路は **未カバー**:

- `document.cookie` (cookie viewer 系ツールが render すれば leak 可能)
- IndexedDB (より複雑だが原理的に同じ leak 経路)
- URL params (`?token=xyz` をページ内で表示する設計があれば leak)
- form pre-fills (`<input value="${secret}">` 直書き)

これらの primary defense は **「spec が secret を扱わない」原則**。Layer 1 / Layer 2 は last resort として位置付ける。spec を新規追加 / 拡張する際は、cookie / IndexedDB / URL / form value に secret を流さないことを reviewer がチェックする。

**Layer 2 audit step の coverage gap（既知）**:

regex `^[A-Z][A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)=` は接尾辞のみマッチし、以下を取りこぼす:

- 複数形 (`SECRETS=`、`KEYS=`)
- 中間出現 (`MY_TOKEN_VALUE=`)
- 別命名 (`AUTH=`、`BEARER_*=`、`PIN=`、`JWT=`、`SESSION=`)
- `_` 開始 (`_PRIVATE_KEY=`)

false positive 増加とのトレードオフで現状は acceptable な ROI 判断。secret naming convention が拡張された際は本 docs を再評価。

**contributor への注意**:

- spec に `localStorage.setItem(...)` / `sessionStorage.setItem(...)` を追加する場合、
  その値は **baseline PNG に焼き付く可能性がある**（特に rendered DOM が storage を
  visualize するツールでは確実に映り込む）。secret-like な値を spec で扱う場合は
  baseline 生成対象 page を除外するか、screenshot 前に値を masking する。
- workflow に新規 secret env を追加する場合は spec / job のスコープを最小化し、
  上記 audit step の allow list を更新するときは PR review で焼き付きリスクを再評価。
