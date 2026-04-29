# GEMINI.md — Gemini CLI 用プロジェクト指示書

**作業を開始する前に、必ず `docs/shared-agent-rules.md` に記載されたプロジェクト共通の開発規約を確認し、遵守してください。**

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

## セキュリティポリシーのセットアップ（必須）

`.gemini/policies/security.toml` には、本リポジトリ用のセキュリティルール（破壊的コマンド禁止・機密ファイル保護等）が定義されています。ただし、Gemini CLI の [issue #18186](https://github.com/google-gemini/gemini-cli/issues/18186) により **ワークスペースティア（`.gemini/policies/`）のポリシーは現在ロードされません**。

そのため、以下のいずれかの手順で **ユーザーティア（`~/.gemini/policies/`）** に同ポリシーを配置する必要があります:

### 推奨: シンボリックリンク（リポジトリ更新が自動反映）

```bash
mkdir -p ~/.gemini/policies
ln -sfn "$(pwd)/.gemini/policies/security.toml" ~/.gemini/policies/security.toml
```

### 代替: 静的コピー（手動更新）

```bash
mkdir -p ~/.gemini/policies
cp .gemini/policies/security.toml ~/.gemini/policies/security.toml
```

issue #18186 が解消されるまで、本セットアップを行わない場合は `.gemini/policies/security.toml` 内の deny / ask ルールがエージェント実行時に適用されません。詳細は `docs/decisions.md` の [046][050] 参照。
