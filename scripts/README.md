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

- `.agents/rules/common.md` 6.4 章（先送り時は issue 化必須）
- `feedback_commander_checklist.md` F 章（メモリ）

---

## rm-tmp.sh

Claude・Codex エージェントが作成した一時ファイルを安全に削除するヘルパー。`/tmp/claude/` および `/tmp/codex/` 配下のみ削除を許可し、それ以外のパス（traversal 含む）は拒否する。

旧 `.claude/scripts/rm-tmp.sh` と `.codex/scripts/rm-tmp.sh` を統合したもの。

### 使い方

```bash
bash scripts/rm-tmp.sh <path>
bash scripts/rm-tmp.sh -f <path>
bash scripts/rm-tmp.sh -r /tmp/claude/somedir/
```

### 終了コード

- `0`: 削除成功
- `1`: 許可外パスへのアクセスを拒否
- `2`: 引数エラー（未サポートオプション・引数なし）

### テスト

```bash
npm run test -- tests/meta/rm-tmp.test.ts
```

### 関連

- `.claude/rules/git-and-fs.md`（Claude Code での使用方法）
- `.codex/rules/default.rules`（Codex での allow ルール）
