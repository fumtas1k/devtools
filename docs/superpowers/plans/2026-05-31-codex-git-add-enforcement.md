# Codex Git Add Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codex で `git add` 直実行を止め、明示的な staging helper 経由のみを許可する。

**Architecture:** 直接 `git add` を拒否する rule を追加し、Bash 実行時に direct `git add` を検知して失敗させる PreToolUse hook を追加する。helper の `bash .codex/scripts/git-add-files.sh` は従来どおり allow に残し、運用上の staging 経路を一本化する。

**Tech Stack:** `.codex/rules/default.rules`, `.codex/hooks.json`, Bash

---

### Task 1: direct `git add` を拒否する

**Files:**

- Modify: `.codex/rules/default.rules`

- [ ] **Step 1: 直接 `git add` を forbidden にする**

```rules
prefix_rule(
    pattern = ["git", "add"],
    decision = "forbidden",
    justification = "Stage changes only through .codex/scripts/git-add-files.sh so explicit path validation is always enforced.",
    match = ["git add AGENTS.md", "git add .", "git add -A"],
)
```

- [ ] **Step 2: broad git mutating rule から `add` を外す**

```rules
prefix_rule(
    pattern = ["git", ["switch", "checkout", "commit", "fetch", "pull", "merge", "rebase", "worktree"]],
    decision = "prompt",
    justification = "Git commands that may mutate the worktree, refs, or network state require confirmation.",
    match = [
        "git switch -c chore/example",
        "git commit --amend",
        "git fetch origin",
        "git pull --ff-only",
        "git merge --ff-only develop",
        "git rebase --continue",
        "git worktree prune",
    ],
)
```

### Task 2: hook で direct `git add` を止める

**Files:**

- Create: `.codex/scripts/block-direct-git-add.sh`
- Modify: `.codex/hooks.json`

- [ ] **Step 1: direct `git add` を検知して exit 1 する hook script を作る**

```bash
#!/bin/bash
set -euo pipefail

input=$(cat)

command=$(printf '%s' "$input" | node -e '
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
')

case "$command" in
  git\ add|git\ add\ *)
    case "$command" in
      bash\ .codex/scripts/git-add-files.sh* ) exit 0 ;;
      git\ add\ *) echo "Use bash .codex/scripts/git-add-files.sh instead of direct git add." >&2; exit 1 ;;
    esac
    ;;
esac
```

- [ ] **Step 2: Bash 実行時に hook を走らせる**

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "bash .codex/scripts/block-direct-git-add.sh",
      "statusMessage": "git add の実行経路を確認中"
    }
  ]
}
```

### Task 3: 陽性対照を確認してコミットする

**Files:**

- Modify: `.codex/rules/default.rules`
- Modify: `.codex/hooks.json`
- Create: `.codex/scripts/block-direct-git-add.sh`

- [ ] **Step 1: helper は引き続き使えることを確認する**

Run: `bash .codex/scripts/git-add-files.sh .codex/rules/default.rules`
Expected: 失敗せずに stage される。

- [ ] **Step 2: direct `git add` が拒否されることを確認する**

Run: `git add .codex/rules/default.rules`
Expected: helper 使用を促すメッセージで拒否される。

- [ ] **Step 3: 変更をコミットする**

```bash
git add .codex/rules/default.rules .codex/hooks.json .codex/scripts/block-direct-git-add.sh docs/superpowers/plans/2026-05-31-codex-git-add-enforcement.md
git commit -m "fix: git add 直実行を抑止"
```
