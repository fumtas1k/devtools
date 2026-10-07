# Claude Code: Git / ファイルシステム操作ルール

`.agents/rules/common.md` の補足。Claude Code 固有の一時ファイル / sandbox / git 制約。

## 一時ファイル

- 作成先は `/tmp/claude/` 配下（`gh api` 等に渡す body / JSON ファイルも同じ）。削除は `bash scripts/rm-tmp.sh <path>` を使う。

## sandbox 制約

- `denyWithinAllow` 対象のファイルは Bash（`mkdir` / `rm` / `sed -i` 等）では deny されるが `Edit` / `Write` tool は通る。先に tool で試す。
- `!` prefix は sandbox bypass にならない。
- `.claude/settings.json` の `sandbox.excludedCommands`（`git push` / `git fetch` / `gh pr` / `gh issue` / `npm run test:e2e` / `codex review` 等）は **単独で実行する**。`cd ... &&` の前置、`&&` / `;` 連結、パイプ、リダイレクト、ループを付けるとパターンに一致せず sandbox 内で走り、SSH の proxy 拒否や `gh` の `x509: OSStatus -26276`・`listen EPERM` として失敗する（PR #764）。
- `git -C <path>` は使わない（除外パターンに一致せず SSH push が known_hosts 拒否で失敗する）。

## Playwright / E2E（macOS ローカルセッションのみ）

web セッション（claude.ai/code）は Chromium 導入済みのコンテナで動くため、本節は該当しない。

- ブラウザ未導入なら `PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/claude/ms-playwright"` を指定して `npx playwright install chromium chromium-headless-shell`（`~/Library/Caches` は書込 deny）。
- `node` スクリプトからの `chromium.launch()` は `mach_port_rendezvous ... (1100)` で失敗する。スクリーンショット等の単発操作も一時 spec + 専用 config を作り test runner 経由で実行する（一時 spec はコミットしない）。
- `webServer` が `listen EPERM ::1:4321` で失敗したら `astro preview --host 127.0.0.1` を別途起動して `baseURL` で参照する。
- loopback への connect 自体が全面 deny される環境では in-session E2E は実行不能。接続 probe が 2〜3 回失敗したら workaround 探索を打ち切り、CI を最終ゲートにして PR 本文にローカル E2E 未実行と理由を書く（PR #749）。
- `astro dev` / `astro preview` を調査目的で手動起動しない（エージェント検知時に detached 起動し、止まらず残ることがある）。残ったら `npm run pretest:e2e:dev` を単独実行して 4321 / 4322 を空ける（PR #769 / #772）。
