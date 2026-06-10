#!/usr/bin/env bash
# scripts/test-vrt-comment-build.sh
#
# visual-regression.yml の「PR comment 本文を組み立て」step の
# pipeline ロジックを bash 環境下で再現し、3 つのケースを検証する。
#
# ケース A（陰性対照・早期失敗再現）:
#   ✘ 0 件の空 log → pipeline の後段まで到達し、sentinel 行まで出力されることを assert。
#
# ケース B（通常失敗再現）:
#   ✘ 行 + (retry 行を含む fixture log → 期待形式の行が出力されることを assert。
#   awk の -F'›' 抽出ロジックが正しく動作することを検証。
#
# ケース C（陽性対照）:
#   `|| true` を外した旧実装相当の pipeline を空 log で実行。
#   途中で中断して sentinel 行に到達しない（exit non-zero）ことを assert。
#   「テストハーネスがこの regression クラスを検知できる」証明。
#
# issue #324 / PR #333 参照。
#
# 使い方: bash scripts/test-vrt-comment-build.sh
# 終了コード: 0=全ケース pass / 1=いずれか fail

# 複製元 workflow step（set -euo pipefail）と同一オプションに揃え、未定義変数も早期検知する
set -euo pipefail

# 一時ディレクトリを作成し、終了時に掃除する。
# macOS の mktemp はテンプレート省略時に TMPDIR を無視して /var/folders を使うため、
# sandbox 環境 (TMPDIR のみ書込可) でも動くようテンプレートで TMPDIR を明示する。
TMPDIR_WORK=$(mktemp -d "${TMPDIR:-/tmp}/vrt-comment-build.XXXXXXXX")
trap 'rm -rf "$TMPDIR_WORK"' EXIT

PASS=0
FAIL=0

# ヘルパー: ケース結果を出力する
pass() {
  echo "  ✓ $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "  ✗ $1"
  FAIL=$((FAIL + 1))
}

# ===========================================================================
# ケース A（陰性対照）: ✘ 0 件の空 log → sentinel 行まで到達することを assert
# 空 log で pipeline が中断しないことを確認する（|| true による回帰修正の検証）
# ===========================================================================
echo "ケース A: 空 log（✘ 0 件）→ sentinel 行まで到達"

LOG_A="$TMPDIR_WORK/log_a.txt"
touch "$LOG_A"  # 空ファイル

OUTPUT_A="$TMPDIR_WORK/output_a.txt"

# workflow 内の step を bash -eo pipefail 環境で再現
bash -eo pipefail <<SCRIPT_A > "$OUTPUT_A" 2>&1
LOG_FILE="$LOG_A"
{
  echo "body<<MARKDOWN_EOF"
  echo "## VRT 結果"
  if [ -f "\$LOG_FILE" ]; then
    # workflow の実物と同じ pipeline（|| true で包む形）
    ( grep -E '^[[:space:]]+✘' "\$LOG_FILE" \
      | grep -v '(retry' \
      | awk -F'›' '{
          n = NF
          spec = \$n
          sub(/^[ \t]+/, "", spec)
          sub(/[ \t]*\([0-9.]+m?s\)[ \t]*\$/, "", spec)
          vp = \$(n - 1)
          sub(/^[ \t]+/, "", vp)
          sub(/[ \t]+\$/, "", vp)
          print "- [" vp "] " spec
        }' \
      | sort -u \
      | head -30 ) || true
  fi
  echo "SENTINEL_LINE"
  echo "MARKDOWN_EOF"
}
SCRIPT_A

if grep -q "SENTINEL_LINE" "$OUTPUT_A"; then
  pass "sentinel 行まで到達した（pipeline が中断しなかった）"
else
  fail "sentinel 行に到達しなかった"
  echo "    stdout/stderr: $(cat "$OUTPUT_A")"
fi

# ===========================================================================
# ケース B（陰性対照）: ✘ 行 + (retry 行を含む fixture log → 期待形式の行が出力される
# awk の -F'›' 抽出ロジックが正しく動作することを検証
# ===========================================================================
echo ""
echo "ケース B: ✘ 行 + retry 行のある fixture log → 期待形式の行を出力"

LOG_B="$TMPDIR_WORK/log_b.txt"
cat > "$LOG_B" <<'FIXTURE'
  ✘ home page › desktop › スナップショット (12.3s)
  ✘ home page › desktop › スナップショット (retry 1) (11.8s)
  ✘ tools/qr-code › mobile › スナップショット (8.4s)
  ✓ about › desktop › スナップショット (2.1s)
FIXTURE

OUTPUT_B="$TMPDIR_WORK/output_b.txt"

bash -eo pipefail <<SCRIPT_B > "$OUTPUT_B" 2>&1
LOG_FILE="$LOG_B"
( grep -E '^[[:space:]]+✘' "\$LOG_FILE" \
  | grep -v '(retry' \
  | awk -F'›' '{
      n = NF
      spec = \$n
      sub(/^[ \t]+/, "", spec)
      sub(/[ \t]*\([0-9.]+m?s\)[ \t]*\$/, "", spec)
      vp = \$(n - 1)
      sub(/^[ \t]+/, "", vp)
      sub(/[ \t]+\$/, "", vp)
      print "- [" vp "] " spec
    }' \
  | sort -u \
  | head -30 ) || true
SCRIPT_B

# retry 行が除外されていることを確認
if grep -q "(retry" "$OUTPUT_B"; then
  fail "retry 行が除外されていない"
  echo "    output: $(cat "$OUTPUT_B")"
else
  pass "retry 行が正しく除外された"
fi

# 期待形式の行が含まれているかを確認
if grep -q "^\- \[" "$OUTPUT_B"; then
  pass "期待形式 '- [viewport] spec名' の行が出力された"
else
  fail "期待形式の行が出力されなかった"
  echo "    output: $(cat "$OUTPUT_B")"
fi

# desktop viewport の spec が含まれているかを確認
if grep -q "\[desktop\]" "$OUTPUT_B"; then
  pass "desktop viewport の spec が出力された"
else
  fail "desktop viewport の spec が出力されなかった"
  echo "    output: $(cat "$OUTPUT_B")"
fi

# ===========================================================================
# ケース C（陽性対照）: || true を外した旧実装で空 log → 途中で中断することを assert
# この regression クラスをテストハーネスが検知できることを証明する
# ===========================================================================
echo ""
echo "ケース C: 旧実装（|| true なし）+ 空 log → 中断して exit non-zero"

LOG_C="$TMPDIR_WORK/log_c.txt"
touch "$LOG_C"

OUTPUT_C="$TMPDIR_WORK/output_c.txt"

# 旧実装相当: ( ... ) || true の || true を外したパイプライン
# bash -eo pipefail 環境下では grep がマッチ 0 件のとき exit 1 を返し、
# set -e により即座にスクリプトが中断する。
# 意図的に失敗させるため、スクリプト全体の exit code を期待する。
# 外側の set -e による途中終了を防ぐため || EXIT_C=$? で exit code を捕捉する。
EXIT_C=0
bash -eo pipefail <<SCRIPT_C > "$OUTPUT_C" 2>&1 || EXIT_C=$?
LOG_FILE="$LOG_C"
{
  echo "BEFORE_PIPELINE"
  # 旧実装: || true なし。空 log では grep が exit 1 → set -e で中断する。
  grep -E '^[[:space:]]+✘' "\$LOG_FILE" \
    | grep -v '(retry' \
    | awk -F'›' '{
        n = NF
        spec = \$n
        sub(/^[ \t]+/, "", spec)
        sub(/[ \t]*\([0-9.]+m?s\)[ \t]*\$/, "", spec)
        vp = \$(n - 1)
        sub(/^[ \t]+/, "", vp)
        sub(/[ \t]+\$/, "", vp)
        print "- [" vp "] " spec
      }' \
    | sort -u \
    | head -30
  echo "SENTINEL_LINE"
}
SCRIPT_C

if [ "$EXIT_C" -ne 0 ]; then
  pass "旧実装は exit $EXIT_C で中断した（regression が検知可能であることを確認）"
else
  fail "旧実装が exit 0 で完了した（陽性対照が機能していない）"
fi

if ! grep -q "SENTINEL_LINE" "$OUTPUT_C"; then
  pass "sentinel 行に到達しなかった（pipeline が正しく中断した）"
else
  fail "sentinel 行まで到達してしまった（中断を検知できていない）"
  echo "    output: $(cat "$OUTPUT_C")"
fi

# ===========================================================================
# 結果サマリ
# ===========================================================================
echo ""
echo "==============================="
echo "結果: ${PASS} passed, ${FAIL} failed"
echo "==============================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

exit 0
