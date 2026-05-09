# scripts/

このディレクトリには、開発・CI 運用を補助する bash スクリプトを配置します。

## `scripts/` vs `.claude/scripts/` の使い分け

「誰が呼ぶか」で配置先を分ける:

| 配置先             | 呼び出し元                                                                                    | 例                                       |
| ------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `scripts/`         | 人間 / CI workflow / `package.json` script / Claude が Bash 経由で叩く汎用ユーティリティ      | `check-followup-refs.sh`                 |
| `.claude/scripts/` | Claude Code harness のみ (`.claude/settings.json` の `hooks.*` / `statusLine.command` 等から) | `test-edit-context.sh` (PreToolUse hook) |

汎用性のあるユーティリティは `scripts/` 側に置き、Claude Code 設定駆動の挙動 (hook handler、status line generator 等) は `.claude/scripts/` 側に置く。`.claude/scripts/` のスクリプトは Claude Code を使わない開発者には実行されないため、CI / package.json から参照しないこと。

---

## check-followup-refs.sh

PR レビュー返信や教訓記録に「先送り表現」（予定 / 候補 / follow-up 等）が含まれているのに対応する issue 番号が併記されていない場合を検出する。

### 使い方

```bash
# 単一ファイル
./scripts/check-followup-refs.sh docs/agent-lessons.md

# 複数ファイル / glob
./scripts/check-followup-refs.sh /tmp/claude/issues/reply-pr-*.md
```

### 終了コード

- `0`: 先送り表現が無いか、すべてに issue 番号が併記されている
- `1`: 起票忘れ疑いあり（標準出力に該当行、標準エラーに対応方法ヒント）

### テスト

```bash
bash tests/scripts/check-followup-refs.test.sh
```

正規表現の調整時はこのテストで回帰を防ぐ。

### 関連

- `docs/shared-agent-rules.md` 6.4 章（先送り時は issue 化必須）
- `feedback_commander_checklist.md` F 章（メモリ）
