# GEMINI.md — Gemini CLI 用プロジェクト指示書

**作業を開始する前に、必ず `.agents/rules/common.md` と `.agents/rules/ui-conventions.md` に記載されたプロジェクト共通の開発規約を確認し、遵守してください。**

---

## Gemini CLI 固有の注意事項

- **`conductor/` ディレクトリ**: `.gitignore` 対象の内部ツール用ディレクトリ。変更・削除しないよう注意してください。

### AI による生成物の明示（必須）

Claude Code は コミット／PR／Issue／コメントの末尾に AI 生成である旨のフッターを自動付与します。Gemini CLI でも同等の明示を **必ず** 行うこと（透明性確保・レビュー時の判別容易化のため）。

- **コミットメッセージ**: 本文の最後に **空行を 1 行入れてから** 以下のトレーラー行を追加する。空行が無いと git / GitHub にトレーラーとして認識されないため必須。

  ```
  <コミット本文>
  ↑空行を 1 行入れる↓
  Co-Authored-By: Gemini CLI
  ```

- **PR 本文・Issue 本文・GitHub コメント**: 末尾に以下を追加する。

  ```
  🤖 Generated with [Gemini CLI](https://github.com/google-gemini/gemini-cli)
  ```

省略してはならない。ユーザーから明示的に「フッター不要」と指示された場合のみ省略可。

---

## セキュリティポリシーのセットアップ（必須・初回のみ）

`.gemini/policies/security.toml` を `~/.gemini/policies/` に配置する必要があります（Gemini CLI [issue #18186](https://github.com/google-gemini/gemini-cli/issues/18186) によりワークスペースティアのポリシーは現在ロードされないため）。

セットアップ手順（symlink 推奨 / 静的コピー代替） → **`docs/setup/gemini-policy.md`**

未セットアップだと deny / ask ルールがエージェント実行時に適用されません。
