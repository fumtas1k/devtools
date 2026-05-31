#!/bin/bash
# Codex PreToolUse hook: テスト編集時に test-gates 参照を model-visible context として注入する。
#
# JSON parse は jq ではなく node を使う (理由は .claude/scripts/test-edit-context.sh と同じ):
# このリポジトリは Node 22 前提で node は必ず存在するが、jq は暗黙の外部依存になり、
# 欠落環境では `|| true` で hook が黙って no-op になり検知漏れを招く (PR #542 レビュー指摘)。

set -e

input=$(cat)

# JSON のフィールドを node で取り出す (dotted path を argv で受ける)。
# 不正な JSON のときは空文字を返す (best-effort)。
json_get() {
  printf '%s' "$input" | node -e '
const path = process.argv[1].split(".");
let d = "";
process.stdin.on("data", (c) => (d += c));
process.stdin.on("end", () => {
  try {
    let v = JSON.parse(d);
    for (const k of path) v = v == null ? undefined : v[k];
    process.stdout.write(v == null ? "" : String(v));
  } catch {
    process.stdout.write("");
  }
});
' "$1"
}

tool_name=$(json_get "tool_name")
file_path=$(json_get "tool_input.file_path")
command=$(json_get "tool_input.command")

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
