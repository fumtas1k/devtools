#!/bin/bash
# Codex SessionStart hook: package-lock.json のハッシュが変わったときだけ npm ci を実行する。
# Claude Code 用 .claude/scripts/session-install.sh と同じ方針。

set -u

[ -f package-lock.json ] || exit 0

hash=$({ sha256sum package-lock.json 2>/dev/null || shasum -a 256 package-lock.json; } | cut -d' ' -f1)

if [ ! -d node_modules ] || [ "$(cat node_modules/.lockhash 2>/dev/null)" != "$hash" ]; then
  npm ci && echo "$hash" >node_modules/.lockhash
fi

