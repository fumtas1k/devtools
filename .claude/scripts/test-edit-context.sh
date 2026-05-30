#!/bin/bash
# PreToolUse hook: テスト編集時に陽性対照ルールへの注意を additionalContext で注入する。
#
# 設計: skill `test-gates` が auto-trigger 不発のときの保険。Edit/Write/MultiEdit 系
#       の file_path がテストパスにマッチしたら system-reminder を注入させる。
#
# 入力: stdin に Claude Code が tool 呼び出し情報を JSON で渡す。
# 出力: stdout に hookSpecificOutput JSON を出すと additionalContext として
#       Claude のコンテキストに注入される (Claude Code Hook 仕様)。
#       マッチしないときは何も出さない (silent pass)。
#
# JSON parse は jq ではなく node を使う: このリポジトリは Node 22 前提で node は
# 必ず存在するが、jq は暗黙の外部依存になり、欠落環境では `|| true` で hook が
# 黙って no-op になり「テスト編集を検知できないまま green」になる (PR #542 レビュー指摘)。

set -e

# 入力 JSON 全体を読む
input=$(cat)

# JSON のフィールドを node で取り出す (dotted path を argv で受ける)。
# 不正な JSON のときは空文字を返す (best-effort: reminder hook なので edit 自体は止めない)。
# .codex/scripts/test-edit-context.sh と同じヘルパーで、今後フィールドを増やしても流用できる。
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

# ファイルパスを抽出 (Edit/Write/MultiEdit すべて tool_input.file_path を持つ)。
file_path=$(json_get "tool_input.file_path")

# 空ならパスなしで何もしない
if [ -z "$file_path" ]; then
  exit 0
fi

# テストパス判定:
#   - tests/ または tests-* / __tests__/ 配下
#   - 拡張子前に .test. / .spec. を含む
case "$file_path" in
  */tests/*|*/__tests__/*|*.test.*|*.spec.*|*/test/*)
    cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "テストファイル編集を検知しました。ガード / バリデータ / 違反検知機構 / regression 防止テストを追加 / 修正する場合は **`Skill` tool で `test-gates` を必ず呼んで** 陽性対照テスト併設ルールを確認してください。陰性対照のみだと検知機構として不完全 (過去 PR #233 で applyProductionCsp が空回りしたまま merge 寸前まで行った事故あり)。"
  }
}
JSON
    ;;
esac

exit 0
