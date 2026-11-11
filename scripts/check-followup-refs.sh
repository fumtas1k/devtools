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

index_mode=0
if [ "${1-}" = '--index' ]; then
  index_mode=1
  shift
  if [ "${1-}" != '--' ] || [ "$#" -lt 2 ]; then
    echo '[ERROR] 使用方法: --index -- <path>...' >&2
    exit 2
  fi
  shift
  root=$(GIT_OPTIONAL_LOCKS=0 git rev-parse --show-toplevel 2>/dev/null) || {
    echo '[ERROR] リポジトリルートを取得できません' >&2
    exit 2
  }
  if [ "$(pwd -P)" != "$root" ]; then
    echo '[ERROR] リポジトリルートから実行してください' >&2
    exit 2
  fi
  temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/check-followup-refs.XXXXXX") || {
    echo '[ERROR] 一時ディレクトリを作成できません' >&2
    exit 2
  }
  cleanup() {
    status=$?
    trap - EXIT
    if ! rm -rf -- "$temp_dir"; then
      echo '[ERROR] 一時ディレクトリを削除できません' >&2
      [ "$status" -ne 0 ] || status=2
    fi
    exit "$status"
  }
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
fi

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
# mawk はマルチバイト空白を [:space:] と認識しないため、Bash のロケール判定に合わせる。
unicode_spaces=''
for char in $'\u0085' $'\u00a0' $'\u1680' $'\u2000' $'\u2001' $'\u2002' $'\u2003' $'\u2004' $'\u2005' $'\u2006' $'\u2007' $'\u2008' $'\u2009' $'\u200a' $'\u2028' $'\u2029' $'\u202f' $'\u205f' $'\u3000'; do
  if [[ "$char" =~ ^[[:space:]]$ ]]; then
    unicode_spaces+="${unicode_spaces:+,}$char"
  fi
done

for file in "$@"; do
  if [ "$index_mode" -eq 1 ]; then
    file=${file#./}
    case "$file" in
      '' | /* | . | .. | ./* | */ | */./* | */. | ../* | */../* | */.. | *//* )
        echo "[ERROR] 不正なパス: $file" >&2
        exit 2
        ;;
    esac
    if ! GIT_OPTIONAL_LOCKS=0 GIT_LITERAL_PATHSPECS=1 git ls-files --stage -z -- "$file" > "$temp_dir/metadata"; then
      echo "[ERROR] index を取得できません: $file" >&2
      exit 2
    fi
    record=''
    extra=''
    if ! exec 5< "$temp_dir/metadata"; then
      echo "[ERROR] index の情報を読めません: $file" >&2
      exit 2
    fi
    if ! IFS= read -r -d '' record <&5; then
      echo "[ERROR] index の情報を読めません: $file" >&2
      exit 2
    fi
    IFS= read -r -d '' extra <&5 || :
    metadata=${record%%$'\t'*}
    indexed_path=${record#*$'\t'}
    mode=${metadata%% *}
    rest=${metadata#* }
    oid=${rest%% *}
    stage=${rest#* }
    if [ -z "$record" ] || [ -n "$extra" ] || [ "$indexed_path" != "$file" ] ||
      { [ "$mode" != 100644 ] && [ "$mode" != 100755 ]; } || [ "$stage" != 0 ]; then
      echo "[ERROR] index の通常ファイルではありません: $file" >&2
      exit 2
    fi
    source_file="$temp_dir/blob"
    if ! GIT_OPTIONAL_LOCKS=0 git cat-file blob "$oid" > "$source_file"; then
      echo "[ERROR] index の内容を取得できません: $file" >&2
      exit 2
    fi
    if grep -nE "$PATTERN" "$source_file" > "$temp_dir/candidates"; then
      :
    else
      status=$?
      if [ "$status" -ne 1 ]; then
        echo "[ERROR] 候補行を取得できません: $file" >&2
        exit 2
      fi
    fi
    if ! exec 3< "$temp_dir/candidates" || ! exec 4< "$source_file"; then
      echo "[ERROR] 一時ファイルを読めません: $file" >&2
      exit 2
    fi
  else
    [ -f "$file" ] || { echo "[SKIP] $file: ファイルが見つかりません" >&2; continue; }
  fi
  checked=$((checked + 1))
  # 次行を解析した時点で現在行を判定し、前後各 1 行だけを保持する。
  # 候補は旧来の grep 判定を使い、awk は 1 件先読みして行番号を照合する。
  # パスは awk の引数にするとオプションや変数代入として解釈され得る。
  check_file() {
    FOLLOWUP_FILE="$file" FOLLOWUP_CANDIDATES="/dev/fd/3" FOLLOWUP_REF="$HAS_ISSUE_REF" FOLLOWUP_SPACES="$unicode_spaces" awk '
    function normalize(line,    i) {
      for (i = 1; i <= space_count; i++) gsub(spaces[i], " ", line)
      return line
    }

    function strip_quote(line) {
      depth = 0
      while (match(line, /^[[:space:]]*>[[:space:]]?/)) {
        line = substr(line, RLENGTH + 1)
        depth++
      }
      return line
    }

    function same_block(before, after,    before_depth) {
      before = strip_quote(before)
      before_depth = depth
      after = strip_quote(after)
      if (before_depth != depth) return 0
      if (before ~ /^[[:space:]]*$/ || after ~ /^[[:space:]]*$/) return 0
      if (before ~ /^[[:space:]]*#+[[:space:]]/ || after ~ /^[[:space:]]*#+[[:space:]]/) return 0
      if (before ~ /^[[:space:]]*(```+|~~~+)/ || after ~ /^[[:space:]]*(```+|~~~+)/) return 0
      if (after ~ /^[[:space:]]*([-+*]|[0-9]+[.)])[[:space:]]+/) return 0
      return 1
    }

    # コメントを除いた参照用テキストと、コードブロック内かを返す。
    function analyze(line,    stripped, line_depth, fence, rest, visible, pos, tick_pos, before_tick, after_tick, open_ticks, search, span, segment, ticks, matched) {
      stripped = strip_quote(line)
      line_depth = depth
      is_code = 0
      ref_line = ""
      if (code_fence != "" && line_depth < fence_depth) code_fence = ""
      if (code_fence != "") {
        if (line_depth == fence_depth && match(stripped, /^[[:space:]]*(```+|~~~+)[[:space:]]*$/)) {
          fence = substr(stripped, RSTART, RLENGTH)
          sub(/^[[:space:]]*/, "", fence)
          sub(/[[:space:]]*$/, "", fence)
          if (substr(fence, 1, 1) == substr(code_fence, 1, 1) && length(fence) >= length(code_fence)) {
            is_code = 1
            code_fence = ""
            return
          }
        }
      } else if (!in_comment && match(stripped, /^[[:space:]]*(```+|~~~+)/)) {
        code_fence = substr(stripped, RSTART, RLENGTH)
        sub(/^[[:space:]]*/, "", code_fence)
        fence_depth = line_depth
      }
      if (code_fence != "") {
        is_code = 1
        return
      }

      rest = line
      visible = ""
      while (1) {
        if (in_comment) {
          pos = index(rest, "-->")
          if (!pos) break
          rest = substr(rest, pos + 3)
          in_comment = 0
        } else {
          pos = index(rest, "<!--")
          if (!pos) {
            visible = visible rest
            break
          }
          tick_pos = index(rest, "`")
          if (tick_pos && tick_pos < pos) {
            before_tick = substr(rest, 1, tick_pos - 1)
            after_tick = substr(rest, tick_pos)
            match(after_tick, /^`+/)
            open_ticks = substr(after_tick, 1, RLENGTH)
            search = substr(after_tick, RLENGTH + 1)
            span = open_ticks
            matched = 0
            while ((tick_pos = index(search, "`")) != 0) {
              segment = substr(search, 1, tick_pos - 1)
              search = substr(search, tick_pos)
              match(search, /^`+/)
              ticks = substr(search, 1, RLENGTH)
              span = span segment ticks
              search = substr(search, RLENGTH + 1)
              if (ticks == open_ticks) {
                matched = 1
                break
              }
            }
            if (matched) {
              visible = visible before_tick span
              rest = search
            } else {
              visible = visible before_tick open_ticks
              rest = substr(after_tick, length(open_ticks) + 1)
            }
          } else {
            visible = visible substr(rest, 1, pos - 1)
            rest = substr(rest, pos + 4)
            in_comment = 1
          }
        }
      }
      ref_line = visible
    }

    # Bash の IFS=: read が末尾単独の区切り文字を除去する動作も再現する。
    function read_candidate(    record, separator) {
      if ((getline record < candidate_path) <= 0) {
        candidate_number = 0
        return
      }
      separator = index(record, ":")
      if (!separator) {
        candidate_number = 0
        return
      }
      candidate_number = substr(record, 1, separator - 1) + 0
      candidate_text = substr(record, separator + 1)
      if (candidate_text ~ /^[^:]*:$/) candidate_text = substr(candidate_text, 1, length(candidate_text) - 1)
    }

    function check_current(has_next,    candidate_view) {
      candidate_view = normalize(candidate_text)
      if (candidate_view ~ /^[[:space:]]*#+[[:space:]]/ || current_code) return
      if (current_ref ~ ref_pattern) return
      if (has_previous && !previous_code && same_block(previous, candidate_view) && previous_ref ~ ref_pattern) return
      if (has_next && !is_code && same_block(candidate_view, next_line) && ref_line ~ ref_pattern) return
      printf "[WARN] %s:%d: %s\n", file, current_number, candidate_text
      found = 1
    }

    BEGIN {
      file = ENVIRON["FOLLOWUP_FILE"]
      candidate_path = ENVIRON["FOLLOWUP_CANDIDATES"]
      ref_pattern = ENVIRON["FOLLOWUP_REF"]
      if (ENVIRON["FOLLOWUP_SPACES"] != "") space_count = split(ENVIRON["FOLLOWUP_SPACES"], spaces, ",")
      nul = sprintf("%c", 0)
      read_candidate()
    }
    {
      # Bash の mapfile が NUL 以降を切り捨てていた動作を維持する。
      raw_line = $0
      nul_pos = index(raw_line, nul)
      if (nul_pos) raw_line = substr(raw_line, 1, nul_pos - 1)
      next_line = normalize(raw_line)
      analyze(next_line)
      if (has_current) {
        if (candidate_number == current_number) {
          check_current(1)
          read_candidate()
        }
        previous = current
        previous_ref = current_ref
        previous_code = current_code
        has_previous = 1
      }
      current = next_line
      current_ref = ref_line
      current_code = is_code
      current_number = NR
      has_current = 1
    }
    END {
      if (has_current && candidate_number == current_number) check_current(0)
      if (found) exit 1
    }
    '
  }
  if [ "$index_mode" -eq 1 ]; then
    if check_file <&4 3<&3; then status=0; else status=$?; fi
  else
    if check_file < "$file" 3< <(grep -nE "$PATTERN" "$file" 2>/dev/null || true); then status=0; else status=$?; fi
  fi
  if [ "$status" -eq 1 ]; then
    found=1
  elif [ "$status" -ne 0 ]; then
    if [ "$index_mode" -eq 1 ]; then
      echo "[ERROR] 内容を検査できません: $file" >&2
      exit 2
    fi
    exit "$status"
  fi
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
