# Playbook: PR 作成（ブランチ作成 → 検証 → PR → マージ）

**いつ読むか**: PR 作成タスクを開始する直前 / 親セッションが PR を作る直前 / レビュー対応をまとめる時。

基本ルールは `docs/shared-agent-rules.md` の 6.3 章（PR ベースブランチ）/ 6.4 章（先送り issue 化）も併読すること。

---

## 1. ブランチ作成

### 1.1 完成形コマンド（必ずこれをコピーして実行）

`develop` 起点を明示しないと worktree が `main` を起点にしてしまう既知の問題がある（過去に PR #154, #181 で発生）。サブエージェントを含むすべての実装担当は以下をそのままコピーする。

```bash
# ブランチ作成（develop 起点を必ず明示）
git fetch origin develop
git switch -c <type>/issue-<n>-<slug> origin/develop

# 自己検証（ベース確認）— 2 行の出力が一致しなければ作業を止めてリベースする
git rev-parse origin/develop
git merge-base HEAD origin/develop

# node_modules 整備（subagent isolation worktree では特に必須）
npm ci
```

ブランチ名は `<type>/<slug>`（例: `feat/add-tool`, `fix/issue-123-crash`）。issue がある場合は `<type>/issue-<n>-<slug>` 形式を推奨。

> **`npm ci` 補足**: `.claude/settings.json` の SessionStart hook が条件を満たせば自動実行されるが、明示しておくことで未実行リスクを排除する。subagent isolation worktree では fresh state（node_modules 不在）から始まるため必須。詳細は `docs/playbooks/e2e-validation.md` ステップ 0 補足参照。

### 1.2 ベース不一致時のリベース

`git rev-parse origin/develop` と `git merge-base HEAD origin/develop` が一致しなければ作業を停止して以下でリベース。

```bash
# `merge-base` が `origin/develop` の祖先（典型的には `main` 起点で worktree が切られたケース）で有効
git rebase --onto origin/develop $(git merge-base HEAD origin/develop) HEAD
```

### 1.3 develop に直接コミットしてしまった場合

`git stash` → ブランチ切替 → `git stash pop` で救出する。

---

## 2. rebase 後の force-with-lease push は親セッションが引き取る

サブエージェントが `git rebase --onto` 等で履歴を書き換えた場合、`git push --force-with-lease` は **親セッションで実行する** こと。サブエージェント側は完了報告に「rebase したので親が `--force-with-lease` で push する必要がある旨」を明記する。

理由:

- `git push --force*` は `permissions.deny` または `ask`、サブエージェントから非対話で実行できない
- 親セッションは push 前に `git diff origin/<branch>...HEAD` で履歴の正当性を確認できる立場にある（commander checklist の C 章「スコープ外差分の確認」と整合）

---

## 3. 親 push 前必須チェックリスト

親セッションが直接 push する際は、以下をすべて確認する。

| #   | チェック項目         | コマンド                                                                                                               |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 0   | node_modules 整備    | `npm ci`（worktree 内で push する場合のみ。SessionStart hook で自動実行されるが念のため）                              |
| 1   | develop ベース確認   | `git rev-parse origin/develop` と `git merge-base HEAD origin/develop` が一致                                          |
| 2   | スコープ外差分の確認 | `git diff origin/develop --name-only` で想定外ファイルがないか確認。aria-\* 削除行（`git diff` の `-` 行）がないか確認 |
| 3   | E2E 直列実行         | `npm run test:e2e`（preview 経由・複数 worktree がある場合は同時実行しない、詳細は `e2e-validation.md` 3 章）          |
| 4   | PR ベース            | `gh pr create --base develop`                                                                                          |

---

## 4. PR 作成コマンド

```bash
gh pr create --base develop --title "..." --body-file "$TMPDIR/pr_body.md"
# または: gh pr create --base develop --title "..." --body-file /tmp/claude/pr_body.md
```

- `--base develop` は **必ず明示**（`gh` のデフォルトは `main`）。
- 本文は **必ず日本語**。
- バックティック含有時は `-F` / `--body-file` 経由で投稿（`docs/shared-agent-rules.md` 6.1）。
- 一時ファイルは `$TMPDIR` か `/tmp/claude/` 配下に置く（`Write(/tmp/claude/**)` は allow、`Write(/tmp/**)` は ask）。

---

## 5. 親向けレビュー取得手順（取りこぼし防止）

PR には **2 系統のコメント**があり、両方確認すること。**Issue comments API だけを見ると、GitHub の "Submit review" 機能で投稿された正式レビューを完全に取りこぼす**（過去に PR #187 / #188 / #189 で発生）。

```bash
# (1) Issue comments（`gh pr comment` で投稿されるもの）
gh api "repos/<owner>/<repo>/issues/<n>/comments" --jq '.[].body'

# (2) Pull Request reviews（"Submit review" 機能で投稿されるもの）
gh api "repos/<owner>/<repo>/pulls/<n>/reviews" --jq '.[].body'
```

`gh pr view <n> --json reviews` も内部的に (2) を取得するため、`gh api` を使う場合は両方を読むこと。返信は `gh pr comment <n> --body-file` で OK（Issue comment として投稿される）。

> 関連: issue #193（E2E web-first assertions のテスト記述ガイドライン）

> 補足: `Bash(gh pr view*)` は allow、`Bash(gh api *)` は ask。行単位のレビューコメントが本当に必要な場合のみユーザーに断ってから `gh api` を使う（`docs/shared-agent-rules.md` 6.6）。

---

## 6. マージ後の worktree 後始末

`gh pr merge --delete-branch` を打つ前に worktree を unlock + remove する。`worktree-agent-<id>` の内部 branch も別途 `git branch -D` で削除（記憶: feedback_worktree_merge_order）。
