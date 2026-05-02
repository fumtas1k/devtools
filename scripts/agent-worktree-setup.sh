#!/usr/bin/env bash
# scripts/agent-worktree-setup.sh
#
# subagent isolation worktree (.claude/worktrees/agent-<id>/) で
# E2E / unit テストを走らせる前に node_modules を整地するヘルパー。
#
# docs/agent-lessons.md 2026-05-01 エントリの手順をスクリプト化したもの:
# - sandbox 由来の read-only ファイルを書き込み可能化
# - 古い node_modules を完全削除
# - $TMPDIR 配下のキャッシュで npm ci（~/.npm が root-owned 問題を回避）
# - port 4321 を解放（並列 worktree でのポート衝突対策）
#
# 使い方:
#   bash scripts/agent-worktree-setup.sh
#
# 関連: issue #194, #211, #212 / docs/agent-lessons.md
set -euo pipefail

# リポジトリルートで実行されていることを確認（cd ミスでの誤削除事故対策）
[[ -f package.json ]] || {
  echo "[agent-worktree-setup] package.json が見つかりません。リポジトリルートで実行してください" >&2
  exit 1
}

chmod -R u+w node_modules 2>/dev/null || true
rm -rf node_modules

# $TMPDIR が未設定 (Linux 等) の場合は /tmp をデフォルトにし、末尾スラッシュを除去
tmp="${TMPDIR:-/tmp}"
tmp="${tmp%/}"
npm ci --cache "${tmp}/npm-cache"

# ポート未使用時の `kill: usage:` エラーを避けるため -r で空入力時起動しない
lsof -ti:4321 | xargs -r kill -9 2>/dev/null || true

echo "[agent-worktree-setup] node_modules 整地完了"
