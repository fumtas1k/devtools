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

python3 - "$command" <<'PY'
import re
import shlex
import sys

command = sys.argv[1]
helper_pattern = re.compile(
    r'^\s*bash\s+\.codex/scripts/git-add-files\.sh(?:\s+[^;&|<>`$()\\]+)*\s*$'
)
deny_message = 'Use bash .codex/scripts/git-add-files.sh instead of direct git add.'

if helper_pattern.fullmatch(command):
    raise SystemExit(0)

if re.search(r'[;&|<>`$()\n]', command):
    print(deny_message, file=sys.stderr)
    raise SystemExit(1)

try:
    tokens = shlex.split(command, posix=True)
except ValueError:
    print(deny_message, file=sys.stderr)
    raise SystemExit(1)


def is_git_command(token: str) -> bool:
    return token == 'git' or token.endswith('/git')


for index, token in enumerate(tokens):
    if is_git_command(token) and any(later == 'add' for later in tokens[index + 1 :]):
        print(deny_message, file=sys.stderr)
        raise SystemExit(1)

raise SystemExit(0)
PY
