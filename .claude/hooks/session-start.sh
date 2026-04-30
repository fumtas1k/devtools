#!/bin/bash
# Claude Code on the web セッション開始時に依存関係を導入する。
# - npm 依存関係（vitest / playwright 等）
# - Playwright 用 Chromium バイナリ（E2E 実行に必須）
# ローカル CLI 等の非リモート環境ではスキップ。
set -euo pipefail

# リモート環境（Claude Code on the web）以外では何もしない
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo "[session-start] npm install"
npm install --no-audit --no-fund

echo "[session-start] playwright install chromium"
npx playwright install chromium

echo "[session-start] done"
