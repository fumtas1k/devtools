# Git Hooks

このディレクトリには、プロジェクトの開発フローを支援する Git フックが格納されています。

## セットアップ

Git フックは以下の設定で自動的に有効になります：

```bash
git config core.hooksPath .githooks
```

既に本リポジトリをクローンしている場合は、上記コマンドを実行してください。

## フック一覧

### `pre-commit`

**実行タイミング:** コミット直前

**機能:** 重要ファイル（SPEC.md、docs/decisions.md、README.md など）が変更されているのに関連ドキュメントが未更新の場合、**警告のみ**を出力します（コミットはブロックしません）。

対象となる変更：

| ファイル変更 | 確認するドキュメント |
| --- | --- |
| `package.json` | SPEC.md (2.3節ライブラリ表)、docs/decisions.md |
| `.npmrc` | docs/decisions.md |
| `.github/workflows/` | docs/decisions.md |
| `src/styles/global.css`、`src/utils/styles.ts` | docs/decisions.md |
| 新規ツールページ（`src/pages/tools/*.astro`） | README.md、SPEC.md、docs/decisions.md |

**例:**

```
⚠  docs check: package.json が変更されています。docs/decisions.md の更新を確認してください。
```

このメッセージが表示される場合は、推奨ドキュメントを更新してから再度コミットしてください。

### `commit-msg`

**実行タイミング:** コミットメッセージ確定直前

**機能:** コミットメッセージが日本語で書かれていることを確認します。英語で書かれたメッセージはブロックされます。

**エラー例:**

```
✗ エラー: コミットメッセージが日本語で書かれていません。
必ず日本語でコミットメッセージを書いてください。

例（正しい形式）:
  feat: 新しいツールを追加
  fix: XSS 脆弱性を修正
  refactor: base64url 変換を統合

コミットメッセージ: This is an English message
```

**対応方法:**

このエラーが出たら、コミットメッセージを日本語に修正してください：

```bash
# エディタが開く。メッセージを日本語に修正して保存。
git commit --amend
```

または、コミットを取り消してから修正後に再実行：

```bash
git reset --soft HEAD~1  # 最後のコミットを取り消し（ステージは保持）
git commit -m "fix: 修正内容を日本語で説明"
```

---

## トラブルシューティング

### ホックが実行されない

```bash
# core.hooksPath の設定を確認
git config core.hooksPath

# 設定されていない場合は手動で設定
git config core.hooksPath .githooks
```

### 特定のフックをスキップしたい

**原則として推奨しません。** ただし、緊急時は以下のオプションで回避できます：

```bash
# pre-commit をスキップ（ドキュメント警告を無視）
git commit --no-verify

# 注意: --no-verify は commit-msg チェックもスキップします。
#      そのため、代わりに以下の方法で日本語チェックだけ通す方法はありません。
```

---

## フックの追加・変更

新しいフックを追加する場合は、以下を確認してください：

1. フックスクリプトは実行可能（`chmod +x`）であること
2. `#!/bin/sh` で始まること（bash 固有の機能は避ける）
3. `exit 0` で成功、`exit 1` で失敗を返すこと
4. このファイル（README.md）を更新して新しいフックを説明すること
5. CLAUDE.md があれば、関連セクションも更新すること
