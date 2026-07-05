# retro スキル Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR マージ後の振り返りを構造化する手動起動スキル `retro`（第1弾 MVP）を、全エージェント共通のスキルとして追加する。

**Architecture:** 単一 `SKILL.md`（A案）に5ステップ手順・分類基準・停止ゲートを直書きし、`.claude/skills/retro` symlink で Claude Code から discoverable にする。`.agents/skills/README.md` の自作スキル行に登録。コード変更なし（Markdown + symlink のみ）。

**Tech Stack:** Markdown（スキル本体）、シンボリックリンク、既存自作スキル test-gates と同一構成。

**前提:** 作業ブランチ `chore/retro-skill`（origin/develop 起点、作成済み）。設計スペック = `docs/superpowers/specs/2026-07-05-retro-skill-design.md`。未コミットの `.claude/settings.json` 変更（`model`/`defaultMode`、ユーザー承認済み）が同ブランチに存在し、最終PRに同梱する。

---

## File Structure

- Create: `.agents/skills/retro/SKILL.md` — スキル本体（フロントマター + 5ステップ手順 + 分類表）
- Create: `.claude/skills/retro` — symlink → `../../.agents/skills/retro`（Claude Code discovery 用）
- Modify: `.agents/skills/README.md` — 自作スキル行に `retro` を追記

---

## Task 1: スキル本体 SKILL.md を作成

**Files:**

- Create: `.agents/skills/retro/SKILL.md`

参考にする既存フォーマット: `.agents/skills/test-gates/SKILL.md`（フロントマターは `name` + `description` の2キーのみ、`---` で囲む）。

- [ ] **Step 1: `.agents/skills/retro/SKILL.md` を以下の内容で作成**

```markdown
---
name: retro
description: PR マージ後の振り返り（retro / レトロ / 振り返り）。対象PRの作業から気づき（手戻り・レビュー指摘・つまずき）を、レビューコメント・docs/agent-lessons.md・会話履歴の3ソースから抽出し、CLAUDE.md 11章の基準で5分類に仕分けして、承認された分だけドキュメント改善PRを作る。ユーザーが `/retro`、「振り返り」「レトロ」「retro して」等と言ったとき発動。手動起動が主で、対象PRは引数指定または直近マージPR。
---

# retro: PR マージ後の振り返りをドキュメント改善に落とす

PR マージ後に、そのPRの作業から得られた気づきを抽出し、CLAUDE.md 11章の基準で仕分けして、
**再発防止に値するものだけ**をドキュメント改善PRに落とす手順。

自動分析が暴走して無関係な変更を提案しないよう、判定基準は厳格に。過剰な提案は形骸化を招くため
YAGNI 寄りに倒し、Step 4 で必ず停止してユーザー承認を挟む。

## Step 1 — 対象PRの特定

- `/retro [PR番号]` の引数があればそれを対象にする。
- 引数省略時は直近マージPR（`gh pr list --state merged --limit 1 --json number,title`）を取得し、
  **「PR #N（タイトル）を対象にします。よいですか？」と確認してから**進む（誤爆防止）。

## Step 2 — 3ソース収集（会話履歴は best-effort）

- **レビューコメント（主軸）**: `gh pr view <N> --comments`
- **既存教訓（主軸）**: `docs/agent-lessons.md` を読み、繰り返し出ている教訓を把握
- **会話履歴（best-effort）**: 同一セッションに実装ログが残っていれば手戻り・訂正を抽出。
  別セッション起動で空ならスキップし、「会話履歴は取得できなかった」と明示（欠落を隠さない）。

## Step 3 — 仕分け判定（CLAUDE.md 11章準拠、最終反映先へ直接ルーティング）

各気づきを次の5分類に振り分ける。11章の「バッファ→昇格」モデルと二重化しないよう、
**最終反映先へ直接**振り分ける（全部を agent-lessons バッファに通さない）。

| 分類                             | 反映先                          | 判定基準                                    |
| -------------------------------- | ------------------------------- | ------------------------------------------- |
| (a) 再発防止に値する共通規約     | `.agents/rules/common.md`       | 全エージェント・全開発に適用される          |
| (b) Claude 固有の運用改善        | `CLAUDE.md` / `.claude/rules/*` | Claude Code の harness 挙動・権限に紐づく   |
| (c) 手順が複雑・再利用性が高い   | 新規 skill 化提案               | 3ステップ以上の定型手順、覚えにくいフラグ群 |
| (d) 特定ツール紐付きの実装メモ   | `docs/agent-lessons.md` 追記    | 個別コンポーネントのリスク・実装知見        |
| (e) 一度限りの TIP／既に強制済み | 破棄                            | コード・Hook・lint で既に担保               |

## Step 4 — 提案の提示（ここで必ず停止）

仕分け結果を表で提示する（各行: 気づき / 分類 / 反映先ファイル / 変更概要）。
**(e) 破棄も含めて判定理由を明示**する。ここで停止し、ユーザーが承認/却下を選ぶ。
判定に迷うものは (e) 側（破棄）に倒し、過剰提案を避ける。

## Step 5 — 承認分のPR作成

承認された変更のみ `chore/retro-<topic>` ブランチ（**origin/develop 起点**を明示）で実装し、
`--base develop` で PR を作成する（CLAUDE.md 6章／`docs/playbooks/pr-creation.md` 準拠）。
本文は必ずファイル経由（`--body-file`）で渡す。
(c) skill 化提案が承認された場合は `writing-skills` スキルに委譲する。

## やらないこと

- マージ検知の自動化（PostToolUse フック等）は第1弾スコープ外。設計上の留保は
  `docs/superpowers/specs/2026-07-05-retro-skill-design.md` を参照。
```

- [ ] **Step 2: フロントマターの妥当性を確認**

Run: `head -3 .agents/skills/retro/SKILL.md`
Expected: 1行目 `---`、2行目 `name: retro`、3行目が `description:` で始まる（test-gates と同一構造）。

- [ ] **Step 3: コミット**

```bash
git add .agents/skills/retro/SKILL.md
git commit -m "feat: retro スキル本体を追加（PR マージ後の振り返り手順）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Claude Code discovery 用 symlink を作成

**Files:**

- Create: `.claude/skills/retro` → `../../.agents/skills/retro`

既存の symlink 実例: `.claude/skills/test-gates -> ../../.agents/skills/test-gates`（相対パス）。

- [ ] **Step 1: symlink を作成**

```bash
ln -s ../../.agents/skills/retro .claude/skills/retro
```

- [ ] **Step 2: symlink が本体を指すことを検証**

```bash
ls -l .claude/skills/retro
cat .claude/skills/retro/SKILL.md | head -3
```

Expected: `retro -> ../../.agents/skills/retro` と表示され、`head` が Task 1 のフロントマター（`name: retro`）を出力する（＝解決成功）。

- [ ] **Step 3: コミット**

```bash
git add .claude/skills/retro
git commit -m "feat: retro スキルの Claude Code discovery 用 symlink を追加

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 自作スキル出典表に retro を追記

**Files:**

- Modify: `.agents/skills/README.md`

- [ ] **Step 1: 該当行を確認**

Run: `grep -n "本リポジトリ自作" .agents/skills/README.md`
Expected: `dads-design-system / test-gates | 本リポジトリ自作 | 本リポジトリのライセンスに従う` の行が見つかる。

- [ ] **Step 2: その行のスキル名リストに `retro` を追記**

`dads-design-system / test-gates` を `dads-design-system / test-gates / retro` に変更する（Edit tool で該当セル文字列のみ置換。表の桁揃えは Markdown レンダリング上不問だが、既存の空白パディングは崩さない）。

- [ ] **Step 3: 追記を確認**

Run: `grep -n "retro" .agents/skills/README.md`
Expected: 上記行に `retro` が含まれる。

- [ ] **Step 4: コミット**

```bash
git add .agents/skills/README.md
git commit -m "docs: 自作スキル出典表に retro を追記

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 最終検証

**Files:** なし（検証のみ）

- [ ] **Step 1: Markdown 整形チェック**

Run: `npm run format:check`
Expected: PASS（新規 SKILL.md・README 追記・spec/plan が prettier 準拠）。失敗したら `npm run format` で整形し、`git add` + `git commit -m "style: prettier 整形"` する。

- [ ] **Step 2: meta テストが壊れていないこと**

Run: `npm run test`
Expected: PASS（スキル参照の meta テストは無いが、docs-section-references 等の既存 meta テストに影響がないことを確認）。

- [ ] **Step 3: symlink 経由でスキル本体が読めることを最終確認**

Run: `test -f .claude/skills/retro/SKILL.md && echo OK`
Expected: `OK`

---

## Self-Review 結果

- **Spec coverage**: 配置3成果物（本体/symlink/README）= Task 1-3、インターフェース（フロントマター description・引数省略時確認）= Task 1 Step 1 本文、5ステップ手順 = Task 1 本文、検証方針 = Task 4。settings.json 同梱は既存の未コミット変更で本plan外（PR段階で同梱）。網羅済み。
- **Placeholder scan**: TBD/TODO/「適切に」等なし。全 Step に実コマンド/実内容を記載。
- **Type consistency**: パス `.agents/skills/retro/SKILL.md` / symlink `../../.agents/skills/retro` は全 Task で一貫。
