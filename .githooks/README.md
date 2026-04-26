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

**機能:**

#### 1. 自動フォーマット (lint-staged 経由)

ステージ済みのフォーマット対象拡張子（`.js / .ts / .tsx / .jsx / .css / .md / .json / .astro`）を Prettier で整形し、再ステージします。lint-staged が内部で未ステージ変更を一時退避するため、partial-commit（同一ファイル内の staged 変更と unstaged 変更を分けてコミットする運用）を壊しません。

対象拡張子と整形コマンドは `package.json` の `"lint-staged"` 設定で管理しています。

#### 2. ドキュメント更新チェック

重要ファイル（SPEC.md、docs/decisions.md、README.md など）が変更されているのに関連ドキュメントが未更新の場合、**警告のみ**を出力します（コミットはブロックしません）。

対象となる変更：

| ファイル変更                                   | 確認するドキュメント                           |
| ---------------------------------------------- | ---------------------------------------------- |
| `package.json`                                 | SPEC.md (2.3節ライブラリ表)、docs/decisions.md |
| `.npmrc`                                       | docs/decisions.md                              |
| `.github/workflows/`                           | docs/decisions.md                              |
| `src/styles/global.css`、`src/utils/styles.ts` | docs/decisions.md                              |
| 新規ツールページ（`src/pages/tools/*.astro`）  | README.md、SPEC.md、docs/decisions.md          |

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

### フックが実行されない

```bash
# core.hooksPath の設定を確認
git config core.hooksPath

# 設定されていない場合は手動で設定
git config core.hooksPath .githooks
```

### 特定のフックをスキップしたい

**原則として推奨しません。** ただし、緊急時は以下のオプションで回避できます：

```bash
# pre-commit / commit-msg の両方をスキップ
git commit --no-verify
```

`--no-verify` は `pre-commit`（ドキュメント警告）と `commit-msg`（日本語チェック）の両方をスキップします。日本語チェックだけを個別に無効化する手段は用意していません。

---

## フックの追加・変更

新しいフックを追加する場合は、以下を確認してください：

1. フックスクリプトは実行可能（`chmod +x`）であること
2. `#!/bin/sh` で始まること（bash 固有の機能は避ける）
3. `exit 0` で成功、`exit 1` で失敗を返すこと
4. このファイル（README.md）を更新して新しいフックを説明すること
5. CLAUDE.md があれば、関連セクションも更新すること
