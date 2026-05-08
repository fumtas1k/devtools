#!/bin/bash
# Claude Code statusLine - rich 2-line display

input=$(cat)

# --- Colors ---
CYAN='\033[36m'; GREEN='\033[32m'; ORANGE='\033[38;5;208m'; RED='\033[31m'
MAGENTA='\033[35m'; YELLOW='\033[33m'; DIM='\033[2m'; BOLD='\033[1m'; RESET='\033[0m'

# --- Extract fields ---
model=$(echo "$input" | jq -r '.model.display_name // ""')
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
project=$(basename "$cwd")
cost=$(echo "$input" | jq -r '.cost.total_cost_usd // empty')
in_tok=$(echo "$input" | jq -r '.context_window.total_input_tokens // empty')
out_tok=$(echo "$input" | jq -r '.context_window.total_output_tokens // empty')
ctx_pct=$(echo "$input" | jq -r '.context_window.used_percentage // 0')
five_h_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
five_h_reset=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
seven_d_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
seven_d_reset=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

# --- Sandbox ---
sandbox_raw=$(echo "$input" | jq -r 'if (.sandbox | type) == "boolean" then (.sandbox | tostring) else "" end')
if [ -z "$sandbox_raw" ]; then
  # Fallback: check env var or infer from settings
  if [ "${CLAUDE_CODE_DISABLE_SANDBOX:-}" = "1" ] || [ "${SANDBOX:-}" = "false" ]; then
    sandbox_raw="false"
  else
    sandbox_raw="true"
  fi
fi

# --- Git branch ---
branch=""
if git_branch=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null); then
  staged=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" diff --cached --quiet 2>/dev/null; echo $?)
  unstaged=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" diff --quiet 2>/dev/null; echo $?)
  ind=""
  [ "$staged" = "1" ]   && ind="${ind}${MAGENTA}!${RESET}"
  [ "$unstaged" = "1" ] && ind="${ind}${YELLOW}+${RESET}"
  branch=" ${CYAN}${git_branch}${RESET}${ind}"
fi

# --- Progress bar (width=10) ---
make_bar() {
  local pct=$1 color=$2
  local width=10
  local filled=$(( pct * width / 100 ))
  [ "$filled" -gt "$width" ] && filled=$width
  local empty=$(( width - filled ))
  local bar=""
  local i=0
  while [ $i -lt $filled ]; do bar="${bar}█"; i=$(( i + 1 )); done
  i=0
  while [ $i -lt $empty  ]; do bar="${bar}░"; i=$(( i + 1 )); done
  printf "%b%s%b" "$color" "$bar" "$RESET"
}

# Color threshold: <=70=green, <=90=orange, >90=red
bar_color() {
  local pct=$1
  if   [ "$pct" -gt 90 ]; then echo "$RED"
  elif [ "$pct" -gt 70 ]; then echo "$ORANGE"
  else echo "$GREEN"; fi
}

# --- Format Unix timestamp → MM/DD HH:MM (local time) ---
fmt_reset() {
  local ts=$1
  [ -z "$ts" ] && return
  # macOS: date -r, Linux: date -d @
  if date -r "$ts" "+%m/%d %H:%M" 2>/dev/null; then :
  else date -d "@$ts" "+%m/%d %H:%M" 2>/dev/null; fi
}

# --- Line 1: Model | Project | Tokens | Cost ---
line1="${CYAN}${model}${RESET}"

line1="${line1} ${DIM}|${RESET} ${BOLD}${project}${RESET}${branch}"

if [ -n "$in_tok" ] && [ -n "$out_tok" ]; then
  in_k=$(awk -v t="$in_tok" 'BEGIN{printf "%.1f", t/1000}')
  out_k=$(awk -v t="$out_tok" 'BEGIN{printf "%.1f", t/1000}')
  line1="${line1} ${DIM}|${RESET} In: ${in_k}K / Out: ${out_k}K"
fi

if [ -n "$cost" ]; then
  cost_fmt=$(awk -v t="$cost" 'BEGIN{printf "$%.3f", t}')
  line1="${line1} ${DIM}|${RESET} ${YELLOW}${cost_fmt}${RESET}"
fi

if [ "$sandbox_raw" = "false" ]; then
  line1="${line1} ${DIM}|${RESET} ${RED}!SANDBOX${RESET}"
else
  line1="${line1} ${DIM}|${RESET} ${GREEN}SANDBOX${RESET}"
fi

# --- Line 2: ctx bar | 5h bar | 7d bar ---
ctx_int=$(printf '%.0f' "$ctx_pct")
ctx_col=$(bar_color "$ctx_int")
ctx_bar=$(make_bar "$ctx_int" "$ctx_col")
line2="ctx ${ctx_bar} ${ctx_col}${ctx_int}%${RESET}"

if [ -n "$five_h_pct" ]; then
  fh_int=$(printf '%.0f' "$five_h_pct")
  fh_col=$(bar_color "$fh_int")
  fh_bar=$(make_bar "$fh_int" "$fh_col")
  fh_reset=$(fmt_reset "$five_h_reset")
  line2="${line2} ${DIM}|${RESET} 5h ${fh_bar} ${fh_col}${fh_int}%${RESET}"
  [ -n "$fh_reset" ] && line2="${line2} ${DIM}${fh_reset}${RESET}"
fi

if [ -n "$seven_d_pct" ]; then
  sd_int=$(printf '%.0f' "$seven_d_pct")
  sd_col=$(bar_color "$sd_int")
  sd_bar=$(make_bar "$sd_int" "$sd_col")
  sd_reset=$(fmt_reset "$seven_d_reset")
  line2="${line2} ${DIM}|${RESET} 7d ${sd_bar} ${sd_col}${sd_int}%${RESET}"
  [ -n "$sd_reset" ] && line2="${line2} ${DIM}${sd_reset}${RESET}"
fi

# --- Output ---
printf "%b\n" "$line1"
printf "%b\n" "$line2"
