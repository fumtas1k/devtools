#!/bin/bash
# Claude・Codex エージェント用の一時ファイル削除ヘルパー。
# /tmp/claude/ および /tmp/codex/ 配下のみ削除を許可する。

set -u

usage() {
  echo "Usage: bash scripts/rm-tmp.sh [-f] [-r|-R] [--] <path>..." >&2
}

allowed_target() {
  local target="$1"
  local parent base resolved_parent resolved_target

  parent=$(dirname -- "$target")
  base=$(basename -- "$target")

  if ! resolved_parent=$(cd "$parent" 2>/dev/null && pwd -P); then
    return 1
  fi

  resolved_target="$resolved_parent/$base"

  case "$resolved_target" in
    /tmp/claude/* | /private/tmp/claude/* | /tmp/codex/* | /private/tmp/codex/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

if [ "$#" -eq 0 ]; then
  usage
  exit 2
fi

options=()
targets=()
parsing_options=1

for arg in "$@"; do
  if [ "$parsing_options" -eq 1 ]; then
    case "$arg" in
      --)
        parsing_options=0
        ;;
      -f | -r | -R | -rf | -fr | -Rf | -fR)
        options+=("$arg")
        ;;
      -*)
        echo "Unsupported rm option: $arg" >&2
        exit 2
        ;;
      *)
        parsing_options=0
        targets+=("$arg")
        ;;
    esac
  else
    targets+=("$arg")
  fi
done

if [ "${#targets[@]}" -eq 0 ]; then
  usage
  exit 2
fi

# 末尾スラッシュを除去する（rm -r + symlink + 末尾スラッシュによる許可領域外削除を防ぐ）
normalized_targets=()
for target in "${targets[@]}"; do
  normalized="${target}"
  while [[ "$normalized" == */ ]]; do
    normalized="${normalized%/}"
  done
  normalized_targets+=("$normalized")
done

for target in "${normalized_targets[@]}"; do
  if ! allowed_target "$target"; then
    echo "Refusing to remove outside /tmp/claude or /tmp/codex: $target" >&2
    exit 1
  fi
done

if [ "${#options[@]}" -eq 0 ]; then
  rm -- "${normalized_targets[@]}"
else
  rm "${options[@]}" -- "${normalized_targets[@]}"
fi
