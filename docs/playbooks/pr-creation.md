# Playbook: PR 作成（ブランチ作成 → 検証 → PR → マージ）

**いつ読むか**: PR 作成タスクを開始する直前 / 親セッションが PR を作る直前 / レビュー対応をまとめる時。

基本ルールは `.agents/rules/common.md` の 6.3 章（PR ベースブランチ）/ 6.4 章（先送り issue 化）も併読すること。

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

# node_modules 整備（新規作成 worktree の場合は必須 / 親 repo root で直接切替えた場合は既存 node_modules があれば skip 可）
npm ci
```

ブランチ名は `<type>/<slug>`（例: `feat/add-tool`, `fix/issue-123-crash`）。issue がある場合は `<type>/issue-<n>-<slug>` 形式を推奨。

> **`npm ci` 補足**: 新規作成 worktree では必須。SessionStart hook は session 開始時のみ fire し、mid-session で `git worktree add` した worktree には適用されないため、worktree 作成直後に手動で実行する。詳細は `docs/playbooks/e2e-validation.md` ステップ 0 補足参照。

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

| #   | チェック項目         | コマンド                                                                                                                                                |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | node_modules 整備    | `npm ci`（新規作成 worktree では必須。SessionStart hook は session 開始時のみ fire し mid-session 作成 worktree には適用されない）                      |
| 1   | develop ベース確認   | `git rev-parse origin/develop` と `git merge-base HEAD origin/develop` が一致                                                                           |
| 2   | 整形チェック         | `npm run format:check`（CI の `test` ジョブが最初に走らせる。`Write` / `Edit` で作成した Markdown の整形漏れを防ぐ。詳細は `e2e-validation.md` 2.1 節） |
| 3   | スコープ外差分の確認 | `git diff origin/develop --name-only` で想定外ファイルがないか確認。aria-\* 削除行（`git diff` の `-` 行）がないか確認                                  |
| 4   | E2E 直列実行         | `npm run test:e2e`（preview 経由・複数 worktree がある場合は同時実行しない、詳細は `e2e-validation.md` 3 章）                                           |
| 5   | PR ベース            | `gh pr create --base develop`                                                                                                                           |

---

## 4. PR 作成コマンド

```bash
gh pr create --base develop --title "..." --body-file "$TMPDIR/pr_body.md"
# Codex:  gh pr create --base develop --title "..." --body-file /tmp/codex/pr_body.md
# または: gh pr create --base develop --title "..." --body-file /tmp/claude/pr_body.md
```

- `--base develop` は **必ず明示**（`gh` のデフォルトは `main`）。
- 本文は **必ず日本語**。
- バックティック含有時は `-F` / `--body-file` 経由で投稿（`.agents/rules/common.md` 6.1）。
- 一時ファイルは Codex では `/tmp/codex/`、Claude Code では `/tmp/claude/` 配下に置く。汎用 fallback として `$TMPDIR` も使用可。

### 4.1 `decisions.md` の `本 PR:` 行は PR 作成直後に番号置換する

新規エントリ追加時に `本 PR: 実装時に番号置換` のような placeholder を残しておくと、PR がマージされた後に永続的な記録（`docs/decisions.md`）から本 PR を辿れなくなる。**`gh pr create` で PR 番号が確定した直後に、未 push の修正 commit として置換する** こと。

```bash
# PR 作成
PR_URL=$(gh pr create --base develop --title "..." --body-file "$TMPDIR/pr_body.md")
PR_NUM=$(echo "$PR_URL" | grep -oE '[0-9]+$')

# decisions.md の placeholder を即時置換
sed -i.bak "s|本 PR: 実装時に番号置換|本 PR: [#${PR_NUM}](${PR_URL})|" docs/decisions.md
rm docs/decisions.md.bak

git add docs/decisions.md && git commit -m "docs(decisions): [NNN] 関連 PR 番号 (#${PR_NUM}) を置換"
git push
```

過去 PR で残置した placeholder（`grep -n "実装時に番号置換" docs/decisions.md` で検出可能）が見つかったら次回触る PR で retrofit する運用とする（採用根拠: [065] PR #251 レビュー M-1）。

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

> 補足: `Bash(gh pr view*)` は allow、`Bash(gh api *)` は ask。行単位のレビューコメントが本当に必要な場合のみユーザーに断ってから `gh api` を使う（`.agents/rules/common.md` 6.6）。

---

## 6. squash マージ時のコミットメッセージ

`gh pr merge --squash`（および GitHub UI の "Squash and merge"）で develop に乗る squash コミットは、**件名・本文の両方を整える**。squash 後の develop は「1 PR = 1 コミット」になり、後から `git log` で経緯を追う際はこのコミットだけが手がかりになるため。

### 件名

- 通常のコミットと同じ規約に従う（`.agents/rules/common.md` 1 章）: **日本語必須** かつ **Conventional Commits 形式必須**（`feat:` / `fix:` / `docs:` / `chore:` / `refactor:` / `test:` / `style:` / `perf:` / `build:` / `ci:` / `revert:` の 11 種）
- 末尾に PR 番号を付ける: `chore: Codex 用リポジトリ設定を追加 (#542)`

**注意（事故が起きている箇所）**: GitHub の squash は件名の **デフォルトが PR タイトル**。PR タイトルに prefix が無いと prefix なしコミットがそのまま develop に入る。さらに **ローカル `.githooks/commit-msg` は GitHub 上の squash には効かない**（フックはローカル commit 時のみ）ため規約違反が検知されず通る。対策は次のどちらか:

1. PR タイトル自体を Conventional Commits 形式の日本語で書く（squash 件名がそのまま規約準拠になる）
2. squash マージ実行時に件名を手で `<prefix>: <日本語要約> (#<PR番号>)` に直す

### 本文

GitHub の squash はデフォルトで **ブランチ内の全コミットメッセージを箇条書きで丸ごと連結** する（`* feat: ...` / `* refactor: レビュー対応` / `---------` / 重複した `Co-authored-by` が並ぶ）。レビュー往復の途中経過まで永久に残るノイズなので、**この自動連結は消して PR 概要を 1〜5 行に要約** したものに置き換える:

- PR 説明文（概要セクション）を数行に要約する。検証コマンドや scratch なやり取りは含めない
- `---------` 区切りや重複した `Co-authored-by` 行は残さない（必要なら `Co-authored-by` は 1 つに集約）
- ❌ 避ける: コミット列の機械連結をそのまま残す / PR 説明文を全文貼り付ける

### 実行例

```bash
gh pr merge <PR> --squash --delete-branch \
  --subject "chore: Codex 用リポジトリ設定を追加 (#<PR>)" \
  --body-file /tmp/claude/squash_body.md
```

`--body-file` を使うのは、本文がほぼ常に複数行になるため（理由は `.agents/rules/common.md` 6.1 と同じ）。

### リリース PR のマージ（develop → main）

release PR（develop → main）は **`--merge`** を使う（squash しない）。develop に積み上げた squash コミット群をそのまま main に引き継ぐため。

```bash
gh pr merge <PR> --merge --delete-branch
```

squash merge と異なり `--subject` / `--body-file` の指定は不要（merge commit のメッセージは GitHub が自動生成する `Merge pull request #N ...` で十分）。

## 7. マージ後の worktree 後始末

`gh pr merge --delete-branch` を打つ前に worktree を unlock + remove する。`worktree-agent-<id>` の内部 branch も別途 `git branch -D` で削除（記憶: feedback_worktree_merge_order）。
