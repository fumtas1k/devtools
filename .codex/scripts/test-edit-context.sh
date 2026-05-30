#!/bin/bash
# Codex PreToolUse hook: テスト編集時に test-gates 参照を model-visible context として注入する。

set -e

input=$(cat)

tool_name=$(echo "$input" | jq -r '.tool_name // ""' 2>/dev/null || true)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)
command=$(echo "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || true)

matches_test_path() {
  case "$1" in
    */tests/*|*/__tests__/*|*.test.*|*.spec.*|*/test/*) return 0 ;;
    *) return 1 ;;
  esac
}

matched=0
if [ -n "$file_path" ] && matches_test_path "$file_path"; then
  matched=1
elif [ "$tool_name" = "apply_patch" ] && printf '%s\n' "$command" | grep -Eq '(^|\s)(tests/|[^[:space:]]*(\.test\.|\.spec\.|/__tests__/|/test/))'; then
  matched=1
fi

[ "$matched" = "1" ] || exit 0

cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "テストファイル編集を検知しました。ガード / バリデータ / 違反検知機構 / regression 防止テストを追加 / 修正する場合は test-gates skill を参照し、陽性対照テスト併設ルールを確認してください。陰性対照のみだと検知機構として不完全です。"
  }
}
JSON

exit 0

