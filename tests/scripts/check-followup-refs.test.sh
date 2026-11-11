#!/usr/bin/env bash
# scripts/check-followup-refs.sh の回帰テスト
set -euo pipefail

# fixture が呼び出し元の repository、index、Git 設定を変更しないようにする。
# alternate index は専用テスト内で明示的に指定する。
for git_env_name in $(compgen -e GIT_); do
  unset "$git_env_name"
done

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
printf '%s\n' "issue 化予定" > "$TMPDIR_TEST/case1.md"
assert_exit 1 "$TMPDIR_TEST/case1.md" "case1: issue 化予定 without issue ref → detect"

# Case 2: issue 番号併記 → exit 0
printf '%s\n' "別 issue で追跡 #196" > "$TMPDIR_TEST/case2.md"
assert_exit 0 "$TMPDIR_TEST/case2.md" "case2: 先送り表現 + issue ref → pass"

# Case 3: 通常文書の「予定」(リリース予定など) → exit 0 (過検出しない)
printf '%s\n' "リリース予定日: 2026-06-01" > "$TMPDIR_TEST/case3.md"
assert_exit 0 "$TMPDIR_TEST/case3.md" "case3: '予定' in normal context → no false positive"

# Case 4: 「対応予定」(issue ref なし) → exit 1
printf '%s\n' "後で対応予定" > "$TMPDIR_TEST/case4.md"
assert_exit 1 "$TMPDIR_TEST/case4.md" "case4: 対応予定 without issue ref → detect"

# Case 5: 「将来課題」(issue ref なし) → exit 1
printf '%s\n' "将来課題として残す" > "$TMPDIR_TEST/case5.md"
assert_exit 1 "$TMPDIR_TEST/case5.md" "case5: 将来課題 without issue ref → detect"

# Case 6: 「TBD」 → exit 1
printf '%s\n' "詳細は TBD" > "$TMPDIR_TEST/case6.md"
assert_exit 1 "$TMPDIR_TEST/case6.md" "case6: TBD without issue ref → detect"

# 隣接する別項目の issue 番号で先送り表現を見逃さない（陽性対照）。
printf '%s\n' '- 完了 #196' '- 将来課題として残す' > "$TMPDIR_TEST/list-before.md"
assert_exit 1 "$TMPDIR_TEST/list-before.md" "separate list item before → detect"
printf '%s\n' '1. 将来課題として残す' '2. 完了 #196' > "$TMPDIR_TEST/list-after.md"
assert_exit 1 "$TMPDIR_TEST/list-after.md" "separate ordered list item after → detect"
printf '%s\n' '将来課題として残す' '# 見出し #196' > "$TMPDIR_TEST/heading.md"
assert_exit 1 "$TMPDIR_TEST/heading.md" "heading is not a related issue ref → detect"
printf '%s\n' '将来課題として残す' '``` #196' 'example' '```' > "$TMPDIR_TEST/fence.md"
assert_exit 1 "$TMPDIR_TEST/fence.md" "code fence is not a related issue ref → detect"
printf '%s\n' '> - 完了 #196' '> - 将来課題として残す' > "$TMPDIR_TEST/quoted-list-before.md"
assert_exit 1 "$TMPDIR_TEST/quoted-list-before.md" "quoted list item before → detect"
printf '%s\n' '> - 将来課題として残す' '> - 完了 #196' > "$TMPDIR_TEST/quoted-list-after.md"
assert_exit 1 "$TMPDIR_TEST/quoted-list-after.md" "quoted list item after → detect"
printf '%s\n' '> > 1. 完了 #196' '> > 2. 将来課題' > "$TMPDIR_TEST/nested-quote.md"
assert_exit 1 "$TMPDIR_TEST/nested-quote.md" "nested quoted ordered list → detect"
printf '%s\n' '> 追跡先 #196' 'follow up' > "$TMPDIR_TEST/quote-boundary.md"
assert_exit 1 "$TMPDIR_TEST/quote-boundary.md" "quote boundary → detect"
printf '%s\n' 'follow up' '<!-- old issue #196 -->' > "$TMPDIR_TEST/comment-next.md"
assert_exit 1 "$TMPDIR_TEST/comment-next.md" "comment reference on next line → detect"
printf '%s\n' 'follow up <!-- old issue #196 -->' > "$TMPDIR_TEST/comment-inline.md"
assert_exit 1 "$TMPDIR_TEST/comment-inline.md" "inline comment reference → detect"
printf '%s\n' '<!--' 'old issue #196 -->' 'follow up' > "$TMPDIR_TEST/comment-multiline.md"
assert_exit 1 "$TMPDIR_TEST/comment-multiline.md" "multiline comment reference → detect"
printf '%s\n' '<!--' '~~~' '-->' 'follow up' > "$TMPDIR_TEST/comment-fence.md"
assert_exit 1 "$TMPDIR_TEST/comment-fence.md" "fence inside comment does not hide following text → detect"
printf '%s\n' 'Use `<!--` in templates.' 'follow-up #196' > "$TMPDIR_TEST/comment-inline-code.md"
assert_exit 0 "$TMPDIR_TEST/comment-inline-code.md" "comment opener inside inline code does not hide following ref → pass"
printf '%s\n' 'Use `` ` <!-- ` `` in templates.' 'follow-up #196' > "$TMPDIR_TEST/comment-inline-code-multiple.md"
assert_exit 0 "$TMPDIR_TEST/comment-inline-code-multiple.md" "matching inline code delimiters preserve following ref → pass"
printf '%s\n' 'Use `unclosed <!-- old #196 -->' 'follow up' > "$TMPDIR_TEST/comment-unclosed-code.md"
assert_exit 1 "$TMPDIR_TEST/comment-unclosed-code.md" "unmatched backtick does not hide comment → detect"
printf '%s\n' 'follow up' '~~~ text #196' 'example' '~~~' > "$TMPDIR_TEST/tilde-fence.md"
assert_exit 1 "$TMPDIR_TEST/tilde-fence.md" "tilde fence reference → detect"
printf '%s\n' '````' '```' '#196' '````' 'follow up' > "$TMPDIR_TEST/long-fence.md"
assert_exit 1 "$TMPDIR_TEST/long-fence.md" "shorter fence does not close code block → detect"
printf '%s\n' '> ~~~' 'follow up' > "$TMPDIR_TEST/quote-fence-boundary.md"
assert_exit 1 "$TMPDIR_TEST/quote-fence-boundary.md" "unquoted text after quoted fence → detect"
printf '%s\n' '```' '> ```' '```' 'follow-up' > "$TMPDIR_TEST/fence-quoted-close.md"
assert_exit 1 "$TMPDIR_TEST/fence-quoted-close.md" "quoted fence inside unquoted fence is literal → detect"
printf '%s\n' '> ```' '> > ```' '> ```' '> follow-up' > "$TMPDIR_TEST/fence-nested-close.md"
assert_exit 1 "$TMPDIR_TEST/fence-nested-close.md" "nested quoted fence is literal → detect"
printf '%s\n' '> ```' '> follow-up' '> ```' > "$TMPDIR_TEST/fence-quoted-code.md"
assert_exit 0 "$TMPDIR_TEST/fence-quoted-code.md" "matching quoted fence skips code → pass"
printf '%s\n' '# Heading #196' > "$TMPDIR_TEST/long-line.md"
printf 'follow up %0131072d\n' 0 >> "$TMPDIR_TEST/long-line.md"
assert_exit 1 "$TMPDIR_TEST/long-line.md" "long line after heading → detect"

# 同一段落・同一項目内の前後行は従来どおり認める（陰性対照）。
printf '%s\n' '追跡先 #196' '将来課題として残す' > "$TMPDIR_TEST/paragraph.md"
assert_exit 0 "$TMPDIR_TEST/paragraph.md" "previous line in paragraph → pass"
printf '%s\n' '- 将来課題として残す' '  追跡先 #196' > "$TMPDIR_TEST/list-continuation.md"
assert_exit 0 "$TMPDIR_TEST/list-continuation.md" "next line in same list item → pass"
printf '%s\n' '- 追跡先 #196' '  将来課題として残す' > "$TMPDIR_TEST/list-continuation-before.md"
assert_exit 0 "$TMPDIR_TEST/list-continuation-before.md" "previous line in same list item → pass"
printf '%s\n' '> - 将来課題として残す' '>   追跡先 #196' > "$TMPDIR_TEST/quoted-continuation.md"
assert_exit 0 "$TMPDIR_TEST/quoted-continuation.md" "same quoted list item → pass"
printf '%s\n' 'follow up <!-- obsolete #1 --> #196' > "$TMPDIR_TEST/comment-visible-ref.md"
assert_exit 0 "$TMPDIR_TEST/comment-visible-ref.md" "visible ref after comment → pass"
printf '%s\n' '~~~' 'follow up' '~~~' > "$TMPDIR_TEST/tilde-code.md"
assert_exit 0 "$TMPDIR_TEST/tilde-code.md" "follow up inside tilde fence → skip"
printf '%s\n' '追跡先 #196' '' '将来課題として残す' > "$TMPDIR_TEST/paragraph-break.md"
assert_exit 1 "$TMPDIR_TEST/paragraph-break.md" "separate paragraphs → detect"

printf '%s\n' 'follow up later' > "$TMPDIR_TEST/follow-up-space.md"
assert_exit 1 "$TMPDIR_TEST/follow-up-space.md" "spaced follow up without ref → detect"
printf '%s\n' 'follow up #196' > "$TMPDIR_TEST/follow-up-ref.md"
assert_exit 0 "$TMPDIR_TEST/follow-up-ref.md" "spaced follow up with ref → pass"
printf '%s\n' 'follow-up' > "$TMPDIR_TEST/follow-hyphen.md"
assert_exit 1 "$TMPDIR_TEST/follow-hyphen.md" "hyphenated follow-up without ref → detect"
printf '%s\n' 'followup' > "$TMPDIR_TEST/follow-joined.md"
assert_exit 1 "$TMPDIR_TEST/follow-joined.md" "joined followup without ref → detect"

assert_exit 2 "$TMPDIR_TEST/missing.md" "no existing target → error"
assert_exit 2 "$TMPDIR_TEST/unmatched-*.md" "unexpanded glob → error"
assert_exit 2 "$TMPDIR_TEST" "directory is not a target → error"
if "$SCRIPT" >/dev/null 2>&1; then
  echo "[FAIL] no arguments → error"
  fail_count=$((fail_count + 1))
else
  actual=$?
  if [ "$actual" = 2 ]; then
    echo "[OK] no arguments → error (exit $actual)"
  else
    echo "[FAIL] no arguments → error (expected 2, got $actual)"
    fail_count=$((fail_count + 1))
  fi
fi
if "$SCRIPT" "$TMPDIR_TEST/missing.md" "$TMPDIR_TEST/case2.md" >/dev/null 2>&1; then
  echo "[OK] missing target alongside checked target → pass"
else
  echo "[FAIL] missing target alongside checked target → pass"
  fail_count=$((fail_count + 1))
fi
if "$SCRIPT" "$TMPDIR_TEST/missing.md" "$TMPDIR_TEST/case1.md" >/dev/null 2>&1; then
  actual=0
else
  actual=$?
fi
if [ "$actual" = 1 ]; then
  echo "[OK] missing target alongside violation → detect"
else
  echo "[FAIL] missing target alongside violation (expected 1, got $actual)"
  fail_count=$((fail_count + 1))
fi

# 陽性対照: 複数ファイルの警告順・行番号・原文（CRLF と末尾改行なし）を検証する。
printf '%s\r\n%s' '# heading' 'TBD <!-- #123 -->' > "$TMPDIR_TEST/output-first.md"
printf '%s\n' '> - follow up' '> - referenced #123' 'normal' '将来課題' > "$TMPDIR_TEST/output-second.md"
printf '[WARN] %s:2: TBD <!-- #123 -->\n[WARN] %s:1: > - follow up\n[WARN] %s:4: 将来課題\n' \
  "$TMPDIR_TEST/output-first.md" "$TMPDIR_TEST/output-second.md" "$TMPDIR_TEST/output-second.md" > "$TMPDIR_TEST/expected-output"
if "$SCRIPT" "$TMPDIR_TEST/output-first.md" "$TMPDIR_TEST/output-second.md" > "$TMPDIR_TEST/actual-output" 2> "$TMPDIR_TEST/actual-error"; then
  actual=0
else
  actual=$?
fi
if [ "$actual" = 1 ] && cmp -s "$TMPDIR_TEST/expected-output" "$TMPDIR_TEST/actual-output" &&
  grep -q '^\[ヒント\]' "$TMPDIR_TEST/actual-error"; then
  echo '[OK] warning order, original text, line number and hint'
else
  echo '[FAIL] warning order, original text, line number or hint'
  fail_count=$((fail_count + 1))
fi

# 陰性対照: 空ファイルとコメント外の参照は警告を出さない。
: > "$TMPDIR_TEST/empty.md"
printf '%s\r\n%s' 'follow up' '追跡先 #123' > "$TMPDIR_TEST/output-clean.md"
if "$SCRIPT" "$TMPDIR_TEST/empty.md" "$TMPDIR_TEST/output-clean.md" > "$TMPDIR_TEST/actual-output" 2> "$TMPDIR_TEST/actual-error" &&
  [ ! -s "$TMPDIR_TEST/actual-output" ] && [ ! -s "$TMPDIR_TEST/actual-error" ]; then
  echo '[OK] empty and referenced files produce no warning'
else
  echo '[FAIL] empty and referenced files produce no warning'
  fail_count=$((fail_count + 1))
fi

# 先頭ハイフンは旧 grep と同じく検知せず、等号とバックスラッシュは保持する。
printf '%s\n' 'TBD' > "$TMPDIR_TEST/-leading.md"
printf '%s\n' 'follow-up' > "$TMPDIR_TEST/key=value.md"
printf '%s\n' '将来課題' > "$TMPDIR_TEST/back\\slash.md"
printf '%s\n' '[WARN] key=value.md:1: follow-up' '[WARN] back\slash.md:1: 将来課題' > "$TMPDIR_TEST/expected-output"
if (cd "$TMPDIR_TEST" && "$SCRIPT" '-leading.md' 'key=value.md' 'back\slash.md') > "$TMPDIR_TEST/actual-output" 2> "$TMPDIR_TEST/actual-error"; then
  actual=0
else
  actual=$?
fi
if [ "$actual" = 1 ] && cmp -s "$TMPDIR_TEST/expected-output" "$TMPDIR_TEST/actual-output"; then
  echo '[OK] special relative file names'
else
  echo '[FAIL] special relative file names'
  fail_count=$((fail_count + 1))
fi

# grep の出力を IFS=: read で処理していた際の末尾コロンを保持する。
printf '%s\n' 'TBD:' 'TBD::' ':TBD:' 'TBD:x:' > "$TMPDIR_TEST/colons.md"
printf '[WARN] %s:1: TBD\n[WARN] %s:2: TBD::\n[WARN] %s:3: :TBD:\n[WARN] %s:4: TBD:x:\n' \
  "$TMPDIR_TEST/colons.md" "$TMPDIR_TEST/colons.md" "$TMPDIR_TEST/colons.md" "$TMPDIR_TEST/colons.md" > "$TMPDIR_TEST/expected-output"
if "$SCRIPT" "$TMPDIR_TEST/colons.md" > "$TMPDIR_TEST/actual-output" 2> "$TMPDIR_TEST/actual-error"; then
  actual=0
else
  actual=$?
fi
if [ "$actual" = 1 ] && cmp -s "$TMPDIR_TEST/expected-output" "$TMPDIR_TEST/actual-output"; then
  echo '[OK] candidate colon handling'
else
  echo '[FAIL] candidate colon handling'
  fail_count=$((fail_count + 1))
fi

# grep がバイナリと判断した入力は旧実装と同様に候補行を出さない。
printf 'TBD\000text\n' > "$TMPDIR_TEST/binary.md"
if "$SCRIPT" "$TMPDIR_TEST/binary.md" > "$TMPDIR_TEST/actual-output" 2> "$TMPDIR_TEST/actual-error" &&
  [ ! -s "$TMPDIR_TEST/actual-output" ] && [ ! -s "$TMPDIR_TEST/actual-error" ]; then
  echo '[OK] binary grep result is not a candidate line'
else
  echo '[FAIL] binary grep result is not a candidate line'
  fail_count=$((fail_count + 1))
fi

# 継承したファイル記述子を通常モードの literal path として使う。
printf '%s\n' 'follow up' > "$TMPDIR_TEST/inherited-fd.md"
for fd in 3 4; do
  if [ "$fd" = 3 ]; then
    if "$SCRIPT" /dev/fd/3 3< "$TMPDIR_TEST/inherited-fd.md" > "$TMPDIR_TEST/actual-output" 2> "$TMPDIR_TEST/actual-error"; then actual=0; else actual=$?; fi
  else
    if "$SCRIPT" /dev/fd/4 4< "$TMPDIR_TEST/inherited-fd.md" > "$TMPDIR_TEST/actual-output" 2> "$TMPDIR_TEST/actual-error"; then actual=0; else actual=$?; fi
  fi
  printf '[WARN] /dev/fd/%s:1: follow up\n' "$fd" > "$TMPDIR_TEST/expected-output"
  if [ "$actual" = 1 ] && cmp -s "$TMPDIR_TEST/expected-output" "$TMPDIR_TEST/actual-output"; then
    echo "[OK] inherited fd $fd retains legacy warning"
  else
    echo "[FAIL] inherited fd $fd legacy warning (exit $actual)"
    fail_count=$((fail_count + 1))
  fi
done
printf '[WARN] %s:1: follow up\n[WARN] /dev/fd/3:1: follow up\n[WARN] /dev/fd/4:1: follow up\n' "$TMPDIR_TEST/inherited-fd.md" > "$TMPDIR_TEST/expected-output"
if "$SCRIPT" "$TMPDIR_TEST/inherited-fd.md" /dev/fd/3 /dev/fd/4 3< "$TMPDIR_TEST/inherited-fd.md" 4< "$TMPDIR_TEST/inherited-fd.md" > "$TMPDIR_TEST/actual-output" 2> "$TMPDIR_TEST/actual-error"; then actual=0; else actual=$?; fi
if [ "$actual" = 1 ] && cmp -s "$TMPDIR_TEST/expected-output" "$TMPDIR_TEST/actual-output"; then
  echo '[OK] inherited descriptors survive multiple legacy inputs'
else
  echo "[FAIL] inherited descriptors survive multiple legacy inputs (exit $actual)"
  fail_count=$((fail_count + 1))
fi

# grep が先行候補を出力後に NUL を見つけても、mapfile と同じ位置で行を切る。
printf 'TBD\n%100000s\000#123\n' '' > "$TMPDIR_TEST/binary-late.md"
assert_exit 1 "$TMPDIR_TEST/binary-late.md" 'NUL hides a later adjacent issue reference → detect'

# ロケールが全角空白を空白として扱う場合も、原文を保持して検知する。
if [[ '　' =~ ^[[:space:]]$ ]]; then
  printf '%s\n' '#　TBD' '　```' 'TBD' '　```' '' 'issue　化予定' > "$TMPDIR_TEST/unicode-space.md"
  printf '[WARN] %s:6: issue　化予定\n' "$TMPDIR_TEST/unicode-space.md" > "$TMPDIR_TEST/expected-output"
  if "$SCRIPT" "$TMPDIR_TEST/unicode-space.md" > "$TMPDIR_TEST/actual-output" 2> "$TMPDIR_TEST/actual-error"; then
    actual=0
  else
    actual=$?
  fi
  if [ "$actual" = 1 ] && cmp -s "$TMPDIR_TEST/expected-output" "$TMPDIR_TEST/actual-output"; then
    echo '[OK] Unicode whitespace follows locale and preserves original text'
  else
    echo '[FAIL] Unicode whitespace follows locale and preserves original text'
    fail_count=$((fail_count + 1))
  fi
fi

# index 入力は独立した fixture で検証する。hook と利用者の Git 設定は使わない。
REPO_ROOT="$(cd "$(dirname "$SCRIPT")/.." && pwd)"
FIXTURE="$TMPDIR_TEST/repo"
mkdir -p "$FIXTURE" "$TMPDIR_TEST/bin" "$TMPDIR_TEST/snapshots"
(
  export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
  export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null
  cd "$FIXTURE"
  git init -q
  mkdir special
  printf '%s\n' 'follow up' > bad.md
  printf '%s\n' 'follow up #123' > clean.md
  printf '%s\n' 'follow up' > unchanged.md
  printf '%s\n' 'follow up' > deleted.md
  printf '%s\n' 'follow up' > removed.md
  printf '%s\n' 'follow up' > ./-leading
  printf '%s\n' 'follow up' > ./--index
  printf '%s\n' 'follow up' > ./--
  printf '%s\n' 'follow up' > ./--other
  printf '%s\n' 'follow up' > special/'-name'
  printf '%s\n' 'follow up' > special/'space tab'  # 他の特殊名もディレクトリ単位で明示 stage
  printf '%s\n' 'follow up' > "special/$(printf 'tab\tnewline\nname')"
  printf '%s\n' 'follow up' > 'special/*?[:=]'
  ln -s bad.md link
  bash "$REPO_ROOT/.codex/scripts/git-add-files.sh" bad.md clean.md unchanged.md deleted.md removed.md ./-leading ./--index ./-- ./--other special link
  git -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm fixture
  printf '%s\n' 'follow up #123' > bad.md
  printf '%s\n' 'follow up' > clean.md
  rm deleted.md removed.md
  bash "$REPO_ROOT/.codex/scripts/git-add-files.sh" removed.md
  printf '%s\n' 'follow up #123' > removed.md
  printf '%s\n' 'follow up' > untracked.md
)

REAL_GREP=$(command -v grep)
index_check() {
  local expected="$1" desc="$2"
  shift 2
  if (cd "$FIXTURE" && TMPDIR="$TMPDIR_TEST/snapshots" "$SCRIPT" "$@") > "$TMPDIR_TEST/index-out" 2> "$TMPDIR_TEST/index-err"; then
    actual=0
  else
    actual=$?
  fi
  if [ "$actual" = "$expected" ] && { [ "$expected" != 2 ] || "$REAL_GREP" -q '\[ERROR\]' "$TMPDIR_TEST/index-err"; }; then
    echo "[OK] $desc"
  else
    echo "[FAIL] $desc (expected $expected, got $actual)"
    cat "$TMPDIR_TEST/index-err"
    fail_count=$((fail_count + 1))
  fi
}

# 陽性対照: WT では参照あり、index では参照なし。
index_check 1 'index staged violation, WT referenced' --index -- bad.md
if ! grep -Fxq '[WARN] bad.md:1: follow up' "$TMPDIR_TEST/index-out"; then
  echo '[FAIL] index warning uses requested path and staged content'
  fail_count=$((fail_count + 1))
fi
# 陰性対照: WT では違反、index では参照あり。
index_check 0 'index staged reference, WT violation' --index -- clean.md
index_check 1 'unchanged index blob is read' --index -- unchanged.md
index_check 1 'index blob is read after WT deletion' --index -- deleted.md
index_check 2 'staged deletion with recreated WT is rejected' --index -- removed.md
index_check 2 'untracked target is rejected' --index -- untracked.md
index_check 2 'missing target mixed with clean target is rejected' --index -- clean.md missing.md
index_check 2 'directory is rejected' --index -- special
index_check 2 'symlink is rejected' --index -- link
index_check 2 'missing separator is rejected' --index bad.md
index_check 2 'missing path is rejected' --index --
for invalid in /absolute ../bad.md ././bad.md dir/../bad.md dir/./bad.md dir//bad.md bad.md/ . ''; do
  index_check 2 "invalid index path: $invalid" --index -- "$invalid"
done
index_check 1 'leading ./ is accepted' --index -- ./bad.md
index_check 1 'leading hyphen index path is read' --index -- -leading
index_check 1 'reserved name is a legacy path when escaped' ./--index
index_check 0 'standalone -- remains a legacy path' --
index_check 0 'unknown flag name remains a legacy path' --other
for special in 'special/-name' 'special/space tab' "special/$(printf 'tab\tnewline\nname')" 'special/*?[:=]'; do
  index_check 1 "literal index path: $special" --index -- "$special"
  printf '[WARN] %s:1: follow up\n' "$special" > "$TMPDIR_TEST/index-expected"
  if ! cmp -s "$TMPDIR_TEST/index-expected" "$TMPDIR_TEST/index-out"; then
    echo '[FAIL] literal path output'
    fail_count=$((fail_count + 1))
  fi
done
if (cd "$FIXTURE/special" && "$SCRIPT" --index -- ../bad.md) > "$TMPDIR_TEST/index-out" 2> "$TMPDIR_TEST/index-err"; then actual=0; else actual=$?; fi
if [ "$actual" = 2 ] && grep -q '\[ERROR\]' "$TMPDIR_TEST/index-err"; then
  echo '[OK] non-root invocation is rejected'
else
  echo '[FAIL] non-root invocation'
  fail_count=$((fail_count + 1))
fi

# index の競合・submodule は対象の entry のみを調べる。
(
  export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
  cd "$FIXTURE"
  oid=$(git hash-object -w bad.md)
  printf '100644 %s 1\tconflict.md\n100644 %s 2\tconflict.md\n' "$oid" "$oid" | git update-index --index-info
  printf '160000 %s 0\tsubmodule\n' "$(git rev-parse HEAD)" | git update-index --index-info
)
index_check 2 'unmerged target is rejected' --index -- conflict.md
index_check 2 'submodule target is rejected' --index -- submodule
index_check 0 'unrelated unmerged entry is ignored' --index -- clean.md

# 代替 index と作業ツリー/index の不変性を確認する。
cp "$FIXTURE/.git/index" "$TMPDIR_TEST/alternate-index"
(
  export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
  export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null
  export GIT_INDEX_FILE="$TMPDIR_TEST/alternate-index"
  cd "$FIXTURE"
  bash "$REPO_ROOT/.codex/scripts/git-add-files.sh" bad.md clean.md
)
index_before=$(git -C "$FIXTURE" hash-object "$FIXTURE/.git/index")
alt_before=$(git -C "$FIXTURE" hash-object "$TMPDIR_TEST/alternate-index")
wt_before=$(git -C "$FIXTURE" diff --binary | git hash-object --stdin)
GIT_INDEX_FILE="$TMPDIR_TEST/alternate-index" index_check 0 'alternate index contains reference' --index -- bad.md
GIT_INDEX_FILE="$TMPDIR_TEST/alternate-index" index_check 1 'alternate index contains violation' --index -- clean.md
index_check 1 'default index remains independent' --index -- bad.md
if [ "$index_before" = "$(git -C "$FIXTURE" hash-object "$FIXTURE/.git/index")" ] &&
  [ "$alt_before" = "$(git -C "$FIXTURE" hash-object "$TMPDIR_TEST/alternate-index")" ] &&
  [ "$wt_before" = "$(git -C "$FIXTURE" diff --binary | git hash-object --stdin)" ]; then
  echo '[OK] both indexes and WT remain unchanged'
else
  echo '[FAIL] checker changed an index or WT'
  fail_count=$((fail_count + 1))
fi

# 外部コマンドの故障を注入し、エラーと後始末を検証する。
REAL_GIT=$(command -v git)
REAL_GREP=$(command -v grep)
REAL_RM=$(command -v rm)
export REAL_GIT REAL_GREP REAL_RM
cat > "$TMPDIR_TEST/bin/git" <<'SH'
#!/usr/bin/env bash
if [ "${FAIL_COMMAND-}" = "${1-}" ]; then exit 42; fi
if [ "${FAIL_COMMAND-}" = term ] && [ "${1-}" = cat-file ]; then kill -TERM "$PPID"; exit 42; fi
if [ "${FAIL_COMMAND-}" = int ] && [ "${1-}" = cat-file ]; then kill -INT "$PPID"; exit 42; fi
if [ "${FAIL_COMMAND-}" = truncated ] && [ "${1-}" = ls-files ]; then
  IFS= read -r -d '' record < <("$REAL_GIT" "$@")
  printf '%s' "$record"
  exit 0
fi
exec "$REAL_GIT" "$@"
SH
cat > "$TMPDIR_TEST/bin/grep" <<'SH'
#!/usr/bin/env bash
if [ "${FAIL_COMMAND-}" = grep ]; then exit 42; fi
if [ "${FAIL_COMMAND-}" = read ]; then
  "$REAL_GREP" "$@"
  result=$?
  "$REAL_RM" -f -- "${@: -1}"
  exit "$result"
fi
exec "$REAL_GREP" "$@"
SH
cat > "$TMPDIR_TEST/bin/mktemp" <<'SH'
#!/usr/bin/env bash
if [ "${FAIL_COMMAND-}" = mktemp ]; then exit 42; fi
exec /usr/bin/mktemp "$@"
SH
cat > "$TMPDIR_TEST/bin/rm" <<'SH'
#!/usr/bin/env bash
if [ "${FAIL_COMMAND-}" = rm ]; then exit 42; fi
exec "$REAL_RM" "$@"
SH
chmod +x "$TMPDIR_TEST/bin/"*
for command in ls-files cat-file grep mktemp read rm truncated; do
  PATH="$TMPDIR_TEST/bin:$PATH" FAIL_COMMAND="$command" index_check 2 "failure propagates: $command" --index -- clean.md
done
# rm 失敗で意図的に残した領域を片付けて signal の cleanup を検証する。
"$REAL_RM" -rf "$TMPDIR_TEST/snapshots"/*
for signal in term int; do
  if [ "$signal" = term ]; then expected=143; else expected=130; fi
  if (cd "$FIXTURE" && PATH="$TMPDIR_TEST/bin:$PATH" FAIL_COMMAND="$signal" TMPDIR="$TMPDIR_TEST/snapshots" "$SCRIPT" --index -- clean.md) > "$TMPDIR_TEST/index-out" 2> "$TMPDIR_TEST/index-err"; then actual=0; else actual=$?; fi
  if [ "$actual" = "$expected" ] && [ -z "$(ls -A "$TMPDIR_TEST/snapshots")" ]; then
    echo "[OK] $signal is not successful and cleans snapshots"
  else
    echo "[FAIL] $signal exit status: $actual"
    fail_count=$((fail_count + 1))
  fi
done
index_check 0 'successful check cleans snapshots' --index -- clean.md
if [ -z "$(ls -A "$TMPDIR_TEST/snapshots")" ]; then
  echo '[OK] temporary snapshots cleaned'
else
  echo '[FAIL] temporary snapshots remain'
  fail_count=$((fail_count + 1))
fi

if [ "$fail_count" -gt 0 ]; then
  echo "$fail_count test(s) failed"
  exit 1
fi
echo "All tests passed"
