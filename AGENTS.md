# AGENTS.md

**作業を始める前に `.agents/rules/common.md`（全エージェント共通規約の正本）を読み、UI を変更する場合は `.agents/rules/ui-conventions.md` と `.agents/skills/dads-design-system` も読むこと。** コマンド・検証義務・コミット / PR 規約・ツール追加手順はそちらに集約しており、本ファイルには重複して書かない。

## プロジェクトの前提

- ブラウザ内で完結する開発者ツール集（Astro 7 + React 19 + Tailwind CSS v4）。**ユーザー入力データを外部送信する処理を追加しない**。
- `public/_headers` の strict CSP を前提にしており、inline `style` は使えない（色・状態は `global.css` の semantic class で表現する）。

## Codex 固有の注意事項

- 初回 clone 後に `git config core.hooksPath .githooks` を 1 回実行して git hook を有効化する。
- `.codex/hooks.json` の SessionStart / PreToolUse hook は初回起動時に trust の確認が出る。trust しないと依存インストールとテスト編集時のガード注入が働かないため、内容を確認して承認する。
- 一時ファイルは `/tmp/codex/` 配下に作り、削除は `bash scripts/rm-tmp.sh <path>` を使う。
- ステージングは `bash .codex/scripts/git-add-files.sh <path>...` を使う（`git add` の直接実行はパス指定でも `.codex/rules/default.rules` と PreToolUse hook で拒否される）。
