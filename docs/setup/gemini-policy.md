# Setup: Gemini CLI セキュリティポリシー

**いつ読むか**: Gemini CLI で本リポジトリを初めて使う時。

`.gemini/policies/security.toml` には、本リポジトリ用のセキュリティルール（破壊的コマンド禁止・機密ファイル保護等）が定義されています。ただし、Gemini CLI の [issue #18186](https://github.com/google-gemini/gemini-cli/issues/18186) により **ワークスペースティア（`.gemini/policies/`）のポリシーは現在ロードされません**。

そのため、以下のいずれかの手順で **ユーザーティア（`~/.gemini/policies/`）** に同ポリシーを配置する必要があります。

---

## 推奨: シンボリックリンク（リポジトリ更新が自動反映）

```bash
mkdir -p ~/.gemini/policies
ln -sfn "$(git rev-parse --show-toplevel)/.gemini/policies/security.toml" ~/.gemini/policies/security.toml
```

> `$(git rev-parse --show-toplevel)` でリポジトリルートを動的解決するため、コマンド実行時の cwd がリポジトリ内のどのサブディレクトリでも壊れた symlink にならない。

---

## 代替: 静的コピー（手動更新）

```bash
mkdir -p ~/.gemini/policies
cp .gemini/policies/security.toml ~/.gemini/policies/security.toml
```

---

issue #18186 が解消されるまで、本セットアップを行わない場合は `.gemini/policies/security.toml` 内の deny / ask ルールがエージェント実行時に適用されません。詳細は `docs/decisions.md` の [046][050] 参照。
