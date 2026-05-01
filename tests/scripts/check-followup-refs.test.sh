#!/usr/bin/env bash
# scripts/check-followup-refs.sh の回帰テスト
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/check-followup-refs.sh"
TMPDIR_TEST="$(mktemp -d "${TMPDIR:-/tmp}/check-followup-refs-test.XXXXXX")"
trap 'rm -rf "$TMPDIR_TEST"' EXIT

fail_count=0

assert_exit() {
  local expected="$1"
  local file="$2"
  local desc="$3"
  if "$SCRIPT" "$file" >/dev/null 2>&1; then
    actual=0
  else
    actual=$?
  fi
  if [ "$actual" = "$expected" ]; then
    echo "[OK] $desc (exit $actual)"
  else
    echo "[FAIL] $desc (expected $expected, got $actual)"
    fail_count=$((fail_count + 1))
  fi
}

# Case 1: issue 化予定 (issue 番号なし) → exit 1
echo "issue 化予定" > "$TMPDIR_TEST/case1.md"
assert_exit 1 "$TMPDIR_TEST/case1.md" "case1: issue 化予定 without issue ref → detect"

# Case 2: issue 番号併記 → exit 0
echo "別 issue で追跡 #196" > "$TMPDIR_TEST/case2.md"
assert_exit 0 "$TMPDIR_TEST/case2.md" "case2: 先送り表現 + issue ref → pass"

# Case 3: 通常文書の「予定」(リリース予定など) → exit 0 (過検出しない)
echo "リリース予定日: 2026-06-01" > "$TMPDIR_TEST/case3.md"
assert_exit 0 "$TMPDIR_TEST/case3.md" "case3: '予定' in normal context → no false positive"

# Case 4: 「対応予定」(issue ref なし) → exit 1
echo "後で対応予定" > "$TMPDIR_TEST/case4.md"
assert_exit 1 "$TMPDIR_TEST/case4.md" "case4: 対応予定 without issue ref → detect"

# Case 5: 「将来課題」(issue ref なし) → exit 1
echo "将来課題として残す" > "$TMPDIR_TEST/case5.md"
assert_exit 1 "$TMPDIR_TEST/case5.md" "case5: 将来課題 without issue ref → detect"

# Case 6: 「TBD」 → exit 1
echo "詳細は TBD" > "$TMPDIR_TEST/case6.md"
assert_exit 1 "$TMPDIR_TEST/case6.md" "case6: TBD without issue ref → detect"

if [ "$fail_count" -gt 0 ]; then
  echo "$fail_count test(s) failed"
  exit 1
fi
echo "All tests passed"
