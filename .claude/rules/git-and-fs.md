# Claude Code: Git / ファイルシステム操作ルール

`.agents/rules/common.md` の補足。Claude Code 固有の一時ファイル / sandbox / git 制約を定める。

## 一時ファイル

- 作成先は `/tmp/claude/` 配下。credential / secret 類は置かない。
- 削除は `bash .claude/scripts/rm-tmp.sh <path>` を使う（実パス検証で `/tmp/claude/` 配下のみ削除を許可）。
- `gh api` 等に渡す JSON / body ファイルも `/tmp/claude/` に作成する。

## sandbox 制約

- `denyWithinAllow` に含まれるファイルへの操作は Bash（`mkdir` / `rm` / `tee` / `sed -i` 等）経由では deny されるが、`Edit` / `Write` tool 経由は通る。操作前に必ず `Edit` / `Write` を先に試す（tool で完結できれば別ターミナル依頼は不要）。
- `!` prefix は sandbox bypass にならない。blocked 操作の workaround として使わない。

## git 操作

- `git -C <path>` は使わない。既に project dir に居る場合は素の `git` を使う（`git -C` は sandbox 除外パターンに合致せず SSH push が known_hosts 拒否で失敗する）。
