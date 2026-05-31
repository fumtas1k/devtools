#!/bin/bash
# Codex PreToolUse hook: direct `git add` を拒否し、staging helper のみ許可する。

set -euo pipefail

input=$(cat)

json_get_command() {
  printf '%s' "$input" | node -e '
let data = "";
process.stdin.on("data", (chunk) => (data += chunk));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(data);
    process.stdout.write(payload?.tool_input?.command ?? "");
  } catch {
    process.stdout.write("");
  }
});
'
}

command=$(json_get_command)

case "$command" in
  *".codex/scripts/git-add-files.sh"* )
    exit 0
    ;;
esac

if printf '%s' "$command" | grep -Eq '(^|[^[:alnum:]_./-])git[[:space:]]+add([[:space:]]|$)'; then
  echo "Use bash .codex/scripts/git-add-files.sh instead of direct git add." >&2
  exit 1
fi

exit 0
