#!/bin/bash
# Stage explicit repository paths only. Avoid broad pathspecs such as "." or -A.

set -u

usage() {
  echo "Usage: bash .codex/scripts/git-add-files.sh <path>..." >&2
}

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Not inside a git repository" >&2
  exit 1
}

if [ "$#" -eq 0 ]; then
  usage
  exit 2
fi

allowed_pathspec() {
  local pathspec="$1"
  local parent base resolved_parent

  case "$pathspec" in
    "" | "." | "./." | -* | /* | ../* | */../* | */.. | ..)
      return 1
      ;;
  esac

  if [ -e "$repo_root/$pathspec" ]; then
    parent=$(dirname -- "$repo_root/$pathspec")
    base=$(basename -- "$repo_root/$pathspec")
    if ! resolved_parent=$(cd "$parent" 2>/dev/null && pwd -P); then
      return 1
    fi
    case "$resolved_parent/$base" in
      "$repo_root"/*)
        return 0
        ;;
      *)
        return 1
        ;;
    esac
  fi

  # Deleted tracked files no longer exist; path traversal has already been rejected.
  return 0
}

for pathspec in "$@"; do
  if ! allowed_pathspec "$pathspec"; then
    echo "Refusing broad or unsafe git add pathspec: $pathspec" >&2
    exit 1
  fi
done

git add -- "$@"
