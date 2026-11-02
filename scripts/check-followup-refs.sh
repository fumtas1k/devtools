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
#   2 - チェック対象のファイルがない

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
PATTERN='((issue[[:space:]]*化|対応|追記|追加)[[:space:]]*予定|別[[:space:]]*(PR|issue)|follow[-[:space:]]?up|TBD|後で[[:space:]]*(対応|追加|修正|実装|検討|確認)|(issue[[:space:]]*化|follow[-[:space:]]?up)[[:space:]]*候補|future[[:space:]]+work|将来課題)'

# issue 番号パターン
HAS_ISSUE_REF='#[0-9]+'

found=0
checked=0
QUOTE_PREFIX='^[[:space:]]*>[[:space:]]?'
HEADING='^[[:space:]]*#+[[:space:]]'
FENCE='^[[:space:]]*(`{3,}|~{3,})'
CLOSE_FENCE='^[[:space:]]*(`{3,}|~{3,})[[:space:]]*$'
LIST_ITEM='^[[:space:]]*([-+*]|[0-9]+[.)])[[:space:]]+'
BACKTICKS='^(`+)'

# 引用記号の深さを数え、残りの行を REPLY に返す。
strip_quote_prefix() {
  REPLY="$1"
  quote_depth=0
  while [[ "$REPLY" =~ $QUOTE_PREFIX ]]; do
    REPLY="${REPLY:${#BASH_REMATCH[0]}}"
    quote_depth=$((quote_depth + 1))
  done
}

# 前後の行が同じ段落または箇条書き項目に属するか判定する。
# 後の行が新しい項目なら、前の項目に付いた issue 番号は共有しない。
same_block() {
  local before after before_depth REPLY quote_depth
  strip_quote_prefix "$1"
  before="$REPLY" before_depth="$quote_depth"
  strip_quote_prefix "$2"
  after="$REPLY"
  [[ "$before_depth" -eq "$quote_depth" ]] || return 1
  [[ "$before" =~ ^[[:space:]]*$ || "$after" =~ ^[[:space:]]*$ ]] && return 1
  [[ "$before" =~ $HEADING || "$after" =~ $HEADING ]] && return 1
  [[ "$before" =~ $FENCE || "$after" =~ $FENCE ]] && return 1
  [[ "$after" =~ $LIST_ITEM ]] && return 1
  return 0
}

for file in "$@"; do
  [ -f "$file" ] || { echo "[SKIP] $file: ファイルが見つかりません" >&2; continue; }
  checked=$((checked + 1))

  # ファイルを配列に読み込む（前後行チェックのため）
  mapfile -t lines < "$file"
  total=${#lines[@]}

  # コードブロックの行番号セットと、HTML コメントを除いた参照用の行を構築する。
  unset in_code_block
  declare -A in_code_block
  unset ref_lines
  declare -a ref_lines
  code_fence=''
  fence_depth=0
  in_comment=0
  for ((i=0; i<total; i++)); do
    strip_quote_prefix "${lines[$i]}"
    if [ -n "$code_fence" ] && [ "$quote_depth" -lt "$fence_depth" ]; then
      code_fence=''
    fi
    if [ -n "$code_fence" ]; then
      if [ "$quote_depth" -eq "$fence_depth" ] && [[ "$REPLY" =~ $CLOSE_FENCE ]] &&
        [[ "${BASH_REMATCH[1]:0:1}" = "${code_fence:0:1}" ]] &&
        [ "${#BASH_REMATCH[1]}" -ge "${#code_fence}" ]; then
        in_code_block[$((i+1))]=1
        code_fence=''
        ref_lines[$i]=''
        continue
      fi
    elif [ "$in_comment" -eq 0 ] && [[ "$REPLY" =~ $FENCE ]]; then
      code_fence="${BASH_REMATCH[1]}"
      fence_depth="$quote_depth"
    fi
    if [ -n "$code_fence" ]; then
      in_code_block[$((i+1))]=1
      ref_lines[$i]=''
      continue
    fi

    remaining="${lines[$i]}"
    visible=''
    while :; do
      if [ "$in_comment" -eq 1 ]; then
        case "$remaining" in
          *'-->'*) remaining="${remaining#*-->}"; in_comment=0 ;;
          *) break ;;
        esac
      else
        case "$remaining" in
          *'<!--'*)
            # 同じ行で閉じるインラインコード中の <!-- はコメントではない。
            before_comment="${remaining%%<!--*}"
            before_tick="${remaining%%\`*}"
            if [ "${#before_tick}" -lt "${#before_comment}" ]; then
              after_tick="${remaining:${#before_tick}}"
              [[ "$after_tick" =~ $BACKTICKS ]]
              open_ticks="${BASH_REMATCH[1]}"
              search="${after_tick:${#open_ticks}}"
              span="$open_ticks"
              matched=0
              while [[ "$search" == *'`'* ]]; do
                segment="${search%%\`*}"
                search="${search:${#segment}}"
                [[ "$search" =~ $BACKTICKS ]]
                ticks="${BASH_REMATCH[1]}"
                span+="$segment$ticks"
                search="${search:${#ticks}}"
                if [ "$ticks" = "$open_ticks" ]; then
                  matched=1
                  break
                fi
              done
              if [ "$matched" -eq 1 ]; then
                visible+="$before_tick$span"
                remaining="$search"
              else
                visible+="$before_tick$open_ticks"
                remaining="${after_tick:${#open_ticks}}"
              fi
              continue
            fi
            visible+="${remaining%%<!--*}"
            remaining="${remaining#*<!--}"
            in_comment=1
            ;;
          *) visible+="$remaining"; break ;;
        esac
      fi
    done
    ref_lines[$i]="$visible"
  done

  # grep でヒット行番号を取得（1-indexed）
  while IFS=: read -r lineno line; do
    lineno=$((lineno))  # 数値化
    idx=$((lineno - 1)) # 0-indexed

    # Markdown の見出し行（# で始まる行）はセクションタイトルのため除外
    if [[ "$line" =~ $HEADING ]]; then
      continue
    fi

    # コードブロック内の行は除外
    if [ -n "${in_code_block[$lineno]+x}" ]; then
      continue
    fi

    # 同じ行に issue 番号があれば OK
    if [[ "${ref_lines[$idx]}" =~ $HAS_ISSUE_REF ]]; then
      continue
    fi

    # 前行 (idx-1) をチェック
    if [ $idx -gt 0 ]; then
      if [ -z "${in_code_block[$((lineno - 1))]+x}" ] &&
        same_block "${lines[$((idx - 1))]}" "$line" &&
        [[ "${ref_lines[$((idx - 1))]}" =~ $HAS_ISSUE_REF ]]; then
        continue
      fi
    fi

    # 後行 (idx+1) をチェック
    if [ $((idx + 1)) -lt $total ]; then
      if [ -z "${in_code_block[$((lineno + 1))]+x}" ] &&
        same_block "$line" "${lines[$((idx + 1))]}" &&
        [[ "${ref_lines[$((idx + 1))]}" =~ $HAS_ISSUE_REF ]]; then
        continue
      fi
    fi

    # issue 番号なし → 警告出力
    echo "[WARN] $file:$lineno: $line"
    found=1
  done < <(grep -nE "$PATTERN" "$file" 2>/dev/null || true)
done

if [ "$checked" -eq 0 ]; then
  echo '[ERROR] チェック対象のファイルがありません' >&2
  exit 2
fi

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
