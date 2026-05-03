# Playbook: E2E 検証 / push 前チェックリスト

**いつ読むか**: バグ修正・UI 挙動変更を実装中 / push 前 / E2E が落ちた時。

基本宣言（E2E は実装と同時に書く・push 前に必ず実行）は `docs/shared-agent-rules.md` 3 章を参照。

---

## 0. 実行モードの前提

`npm run test:e2e` は **`astro build` 済みの `dist/` を `astro preview` で配信して実行する**（`playwright.config.ts` の `webServer.command` で連結済み）。理由:

- 本番 (Cloudflare Pages) のビルド成果物に対して E2E を回し、prod-parity を確保するため（`docs/decisions.md` [063]）。後続 [#176](https://github.com/fumtas1k/devtools/issues/176) 採用時には `<meta>` ベース CSP も生成されるため、その評価基盤を先回りで整備する位置付けでもある
- Astro の `security.csp` 機能は dev mode で動作せず build/preview のみで有効（[公式 docs](https://docs.astro.build/en/reference/configuration-reference/#securitycsp)）

`webServer.timeout` は CI で 30s / Local で 120s（[#248] で `process.env.CI` 分岐に変更）。CI では `.github/workflows/test.yml` 側で事前 build 済みのため preview 起動の早期検知に倒し、Local は build 込みのため余裕を持たせている。

---

## 1. E2E 実装の原則

- **E2E テストコードの追加は義務**: バグ修正・UI 挙動変更時は E2E テストコードを **必ず実装と同時に書く**。後回し禁止（`docs/shared-agent-rules.md` 3 章）。
- **`npm run test:e2e` は push 前に必ず実行**: subagent worktree か親セッションで通す。post-PR 代行は不要、CI が最終ゲート。

---

## 2. push 前必須チェックリスト

### 2.1 サブエージェント版

以下をすべて満たしてから完了報告する。**1 つでも未完了の場合は push せず、未完了の項目を完了報告に明記して親に判断を仰ぐ**。

| #   | チェック項目          | コマンド                                                                       |
| --- | --------------------- | ------------------------------------------------------------------------------ |
| 0   | node_modules 整備     | `npm ci`（fresh worktree なら 5〜10 秒で完了。詳細は下記参照）                 |
| 1   | develop ベース確認    | `git rev-parse origin/develop` と `git merge-base HEAD origin/develop` が一致  |
| 2   | ユニットテスト全 pass | `npm run test`                                                                 |
| 3   | 型チェック            | `node_modules/.bin/astro check`（0 errors）                                    |
| 4   | E2E テスト            | `npm run test:e2e`（env 不備で走らない場合は未完了の旨を明記して親に引き継ぐ） |

> **ステップ 0 の補足**: fresh subagent isolation worktree では node_modules が存在しないため、素の `npm ci` のみで十分（過去の `scripts/agent-worktree-setup.sh` は不要と判明し、issue #241 / decisions [062] で廃止）。`.claude/settings.json` の SessionStart hook が `npm ci` を auto-run するので通常は明示実行も不要だが、未実行を疑う場合は手動で再実行する。
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
