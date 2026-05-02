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

chmod -R u+w node_modules 2>/dev/null || true
rm -rf node_modules
npm ci --cache "${TMPDIR%/}/npm-cache"
lsof -ti:4321 | xargs kill -9 2>/dev/null || true

echo "[agent-worktree-setup] node_modules 整地完了"
