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
# 設計思想:
#   - 「予定」は「issue 化予定」「対応予定」「追記予定」「追加予定」等の先送り文脈に限定し、
#     「リリース予定日」「公開予定」のような通常文書の「予定」による過検出を防ぐ。
#   - 「後で」は「後で対応」「後で追加」等の先送り動詞を伴う形に限定し、
#     「後でコンフリクトが〜だった」のような過去形・技術説明での誤検出を防ぐ。
#   - 「別途」は単体では「別途実行が必要」等の技術説明に多用されるため除外し、
#     「別 PR」「別 issue」の形のみ先送り表現として扱う。
#   - 「候補」は「issue 化候補」「follow-up 候補」等に限定し、「拡張候補」等は除外する。
#   - 「将来課題」も先送り表現として検出する。Markdown 見出し行は一律スキップする（while ループ内）。
PATTERN='((issue[[:space:]]*化|対応|追記|追加)[[:space:]]*予定|別[[:space:]]*(PR|issue)|follow-?up|TBD|後で[[:space:]]*(対応|追加|修正|実装|検討|確認)|(issue[[:space:]]*化|follow-?up)[[:space:]]*候補|future[[:space:]]+work|将来課題)'

# issue 番号パターン
HAS_ISSUE_REF='#[0-9]+'

found=0

for file in "$@"; do
  [ -f "$file" ] || { echo "[SKIP] $file: ファイルが見つかりません" >&2; continue; }

  # ファイルを配列に読み込む（前後行チェックのため）
  mapfile -t lines < "$file"
  total=${#lines[@]}

  # コードブロック（``` で囲まれた範囲）の行番号セットを構築（1-indexed）
  unset in_code_block
  declare -A in_code_block
  code_fence=0
  for ((i=0; i<total; i++)); do
    if printf '%s\n' "${lines[$i]}" | grep -qE '^[[:space:]]*```'; then
      code_fence=$(( 1 - code_fence ))
    fi
    if [ "$code_fence" -eq 1 ]; then
      in_code_block[$((i+1))]=1
    fi
  done

  # grep でヒット行番号を取得（1-indexed）
  while IFS=: read -r lineno line; do
    lineno=$((lineno))  # 数値化
    idx=$((lineno - 1)) # 0-indexed

    # Markdown の見出し行（# で始まる行）はセクションタイトルのため除外
    if printf '%s\n' "$line" | grep -qE '^[[:space:]]*#+[[:space:]]'; then
      continue
    fi

    # コードブロック内の行は除外
    if [ -n "${in_code_block[$lineno]+x}" ]; then
      continue
    fi

    # 同じ行に issue 番号があれば OK
    if printf '%s\n' "$line" | grep -qE "$HAS_ISSUE_REF"; then
      continue
    fi

    # 前行 (idx-1) をチェック
    if [ $idx -gt 0 ]; then
      if printf '%s\n' "${lines[$((idx - 1))]}" | grep -qE "$HAS_ISSUE_REF"; then
        continue
      fi
    fi

    # 後行 (idx+1) をチェック
    if [ $((idx + 1)) -lt $total ]; then
      if printf '%s\n' "${lines[$((idx + 1))]}" | grep -qE "$HAS_ISSUE_REF"; then
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
