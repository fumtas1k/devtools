# Claude Code (web): GitHub 連携トークンの制約

`.agents/rules/common.md` の補足。Claude Code on the web（claude.ai/code 等）固有の制約。

## `workflow_dispatch` / workflow run 操作はできない

連携トークンに `actions: write` 権限が無いため、`workflow_dispatch`（GitHub MCP の `actions_run_trigger`）と workflow run の再実行・キャンセルは必ず `403 Resource not accessible by integration` になる。リトライでは解消しない。

試さずに、最初から手動トリガーを案内する: **Actions** タブ → 対象 workflow（例: `Update Visual Regression Baseline`）→ **Run workflow** → branch に対象 PR のブランチを選ぶ。ツール追加 PR では VRT baseline 再生成で毎回必要になる（issue #676）。

## それ以外は「できない」と先回りしない

read 系、PR / issue へのコメント、PR 作成・本文更新、`merge_pull_request`（squash 含む、PR #678）は実行可能と確認済み。可否未確認の write 操作は、実際に 403 を踏むまで「できない」と宣言しない。
