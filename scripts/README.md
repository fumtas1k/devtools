# scripts/

このディレクトリには、開発・CI 運用を補助する bash スクリプトを配置します。

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

### 関連

- `docs/shared-agent-rules.md` 6.4 章（先送り時は issue 化必須）
- `feedback_commander_checklist.md` F 章（メモリ）
