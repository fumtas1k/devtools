# Claude Code (web): GitHub 連携トークンの制約

`.agents/rules/common.md` の補足。**Claude Code on the web（claude.ai/code 等のリモート実行環境）固有**の GitHub 連携トークン制約を定める。Codex / Gemini CLI 等は別の実行環境・別トークンを使うため本ルールの対象外（各エージェント固有ルールを参照）。

## `workflow_dispatch` はエージェント自身が起動できない

web セッションの GitHub 連携トークンには `actions: write` 権限が無い。そのため `workflow_dispatch` による workflow 起動は **必ず `403 Resource not accessible by integration` で失敗** する。**権限スコープ（トークン）の問題なのでリトライしても解消しない**。

不可と確定している操作（`actions: write` 依存）:

- `workflow_dispatch` による workflow 起動（GitHub MCP の `actions_run_trigger` の `run_workflow`）
- `rerun_*` / `cancel_workflow_run` 等の workflow run 再実行・キャンセル系

エージェントは「自分でトリガーします」と提案・実行して 403 を踏むのではなく、**最初から手動トリガー手順を案内する**:

1. GitHub の対象リポジトリ → **Actions** タブを開く
2. 左メニューから対象 workflow（例: `Update Visual Regression Baseline`）を選択
3. **Run workflow** → branch に **対象 PR のブランチ**を選んで実行

特に **ツール追加 PR では VRT baseline 再生成（`Update Visual Regression Baseline` の `workflow_dispatch`）が毎回必須** になるため再発頻度が高い（`.agents/rules/common.md` 5 章のツール追加フロー参照）。

## 過剰な「できない宣言」も避ける

不可と確定しているのは上記 `actions: write` 依存操作のみ。以下は連携トークンで**実行可能**であることを確認済み:

- GitHub MCP の read 系（`pull_request_read` / `actions_list` / `get_job_logs` 等）
- PR/issue への comment、PR 作成（`create_pull_request`）・本文更新（`update_pull_request`）
- **`merge_pull_request`（squash マージ含む）** — PR #678 で実証（連携トークンで成功）

上記以外の write 操作で可否が未確認のものは、実際に 403 を踏むまで先回りで「できない」と宣言しない。

過去事例: PR #675 で VRT baseline 再生成のため workflow_dispatch を試行 → 403 → 手動依頼、の無駄なラウンドトリップが発生（issue #676）。
