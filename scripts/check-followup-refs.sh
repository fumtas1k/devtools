#!/usr/bin/env bash
# check-followup-refs.sh
# PR レビュー返信や教訓記録などに「先送り表現」が含まれているのに
# 対応する issue 番号 (#NNN) が併記されていない行を検出する。
#
# 使い方:
#   scripts/check-followup-refs.sh <file>...
#
# 終了コード:
#   0 - 問題なし（先送り表現が無いか、すべてに issue 番号が併記されている）
#   1 - 起票忘れ疑いあり（標準出力に該当行、標準エラーに対応方法ヒント）

set -euo pipefail

# 先送り表現の正規表現パターン
PATTERN='(予定|別[[:space:]]*(PR|issue)|follow-?up|TBD|後で|候補|追記する|追記予定|別途|future|将来)'

# issue 番号パターン
HAS_ISSUE_REF='#[0-9]+'

found=0

for file in "$@"; do
  [ -f "$file" ] || { echo "[SKIP] $file: ファイルが見つかりません" >&2; continue; }

  # ファイルを配列に読み込む（前後行チェックのため）
  mapfile -t lines < "$file"
  total=${#lines[@]}

  # grep でヒット行番号を取得（1-indexed）
  while IFS=: read -r lineno line; do
    lineno=$((lineno))  # 数値化
    idx=$((lineno - 1)) # 0-indexed

    # 同じ行に issue 番号があれば OK
    if echo "$line" | grep -qE "$HAS_ISSUE_REF"; then
      continue
    fi

    # 前行 (idx-1) をチェック
    if [ $idx -gt 0 ]; then
      if echo "${lines[$((idx - 1))]}" | grep -qE "$HAS_ISSUE_REF"; then
        continue
      fi
    fi

    # 後行 (idx+1) をチェック
    if [ $((idx + 1)) -lt $total ]; then
      if echo "${lines[$((idx + 1))]}" | grep -qE "$HAS_ISSUE_REF"; then
        continue
      fi
    fi

    # issue 番号なし → 警告出力
    echo "[WARN] $file:$lineno: $line"
    found=1
  done < <(grep -nE "$PATTERN" "$file" 2>/dev/null || true)
done

if [ "$found" -eq 1 ]; then
  cat <<'EOM' >&2

[ヒント] 上記の「先送り表現」には issue 番号 (#NNN) の併記がありません。
以下のいずれかを行ってください:
1. gh issue create で起票し、該当行に番号を反映する
2. 「対応不要」が確実なら、具体的な判断（例: "現状の安定度を確認しており、flaky が顕在化したら対処する"）に書き換える
3. 先送り表現自体を削除する
EOM
  exit 1
fi

exit 0
