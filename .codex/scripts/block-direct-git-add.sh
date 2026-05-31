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

node - "$command" <<'NODE'
const command = process.argv[2] ?? '';
const helperPattern = /^\s*bash\s+\.codex\/scripts\/git-add-files\.sh(?:\s+[^;&|<>`$()\\]+)*\s*$/;
const denyMessage = 'Use bash .codex/scripts/git-add-files.sh instead of direct git add.';

function tokenize(input) {
  const tokens = [];
  let current = '';
  let state = 'unquoted';

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (state === 'unquoted') {
      if (/\s/.test(ch)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }
      if (ch === "'") {
        state = 'single';
        continue;
      }
      if (ch === '"') {
        state = 'double';
        continue;
      }
      if (ch === '\\') {
        i += 1;
        if (i < input.length) current += input[i];
        continue;
      }
      current += ch;
      continue;
    }

    if (state === 'single') {
      if (ch === "'") {
        state = 'unquoted';
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      state = 'unquoted';
      continue;
    }
    if (ch === '\\') {
      i += 1;
      if (i < input.length) current += input[i];
      continue;
    }
    current += ch;
  }

  if (current) tokens.push(current);
  return tokens;
}

function isGitToken(token) {
  return token === 'git' || token.endsWith('/git');
}

function hasDirectGitAdd(input, seen = new Set()) {
  if (helperPattern.test(input)) return false;
  if (seen.has(input)) return false;
  seen.add(input);

  const tokens = tokenize(input);

  for (const token of tokens) {
    if (/\s/.test(token) && hasDirectGitAdd(token, seen)) {
      return true;
    }
  }

  for (let i = 0; i < tokens.length; i += 1) {
    if (!isGitToken(tokens[i])) continue;
    for (let j = i + 1; j < tokens.length; j += 1) {
      if (tokens[j] === 'add') return true;
    }
  }

  return false;
}

if (hasDirectGitAdd(command)) {
  console.error(denyMessage);
  process.exit(1);
}

process.exit(0);
NODE
