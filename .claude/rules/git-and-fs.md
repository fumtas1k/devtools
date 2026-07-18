# Claude Code: Git / ファイルシステム操作ルール

`.agents/rules/common.md` の補足。Claude Code 固有の一時ファイル / sandbox / git 制約を定める。

## 一時ファイル

- 作成先は `/tmp/claude/` 配下。credential / secret 類は置かない。
- 削除は `bash scripts/rm-tmp.sh <path>` を使う（実パス検証で `/tmp/claude/` 配下のみ削除を許可。`/tmp/codex/` も同ヘルパーで削除可）。
- `gh api` 等に渡す JSON / body ファイルも `/tmp/claude/` に作成する。

## sandbox 制約

- `denyWithinAllow` に含まれるファイルへの操作は Bash（`mkdir` / `rm` / `tee` / `sed -i` 等）経由では deny されるが、`Edit` / `Write` tool 経由は通る。操作前に必ず `Edit` / `Write` を先に試す（tool で完結できれば別ターミナル依頼は不要）。
- `!` prefix は sandbox bypass にならない。blocked 操作の workaround として使わない。

## git 操作

- `git -C <path>` は使わない。既に project dir に居る場合は素の `git` を使う（`git -C` は sandbox 除外パターンに合致せず SSH push が known_hosts 拒否で失敗する）。

## Playwright / E2E の sandbox 制約

- ブラウザ未インストール環境では `PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/claude/ms-playwright"`（リポジトリ内の sandbox 書込可能経路）を指定して `npx playwright install chromium chromium-headless-shell` する。デフォルトの `~/Library/Caches` は書込 deny。キャッシュは未追跡のまま残してよい（次セッションで再利用可）。
- `node` スクリプトから `chromium.launch()` を直接呼ぶと `mach_port_rendezvous ... Permission denied (1100)` で起動できない。**test runner（`npm run test:e2e` / `npx playwright test`）経由なら起動できる**。スクリーンショット撮影等の単発ブラウザ操作も、一時 spec + 専用 config（起動済みサーバを `baseURL` 参照、`webServer` なし）を作って runner 経由で実行する（一時 spec はコミットしない）。
- 環境によっては `webServer` 自動起動が `listen EPERM ::1:4321`（IPv6 bind 拒否）で失敗することがある。その場合は `astro preview --host 127.0.0.1` を別途起動して `baseURL` で参照する。

（経緯: PR #746 のセッションで親・サブエージェント計 3 者が同じ制約に別々に遭遇したため記録）
