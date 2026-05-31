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

if printf '%s' "$command" | grep -Eq '^[[:space:]]*bash[[:space:]]+\.codex/scripts/git-add-files\.sh([[:space:]]+[^;&|<>`$()\\]+)*[[:space:]]*$'; then
  exit 0
fi

if printf '%s' "$command" | grep -Eq '(^|[^[:alnum:]_./-])(([^[:space:];|&()]+/)*git|command[[:space:]]+git)([[:space:]][^;&|()]*)*[[:space:]]+add([[:space:]]|$)'; then
  echo "Use bash .codex/scripts/git-add-files.sh instead of direct git add." >&2
  exit 1
fi

exit 0
