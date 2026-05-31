# UI Conventions Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.agents/rules/ui-conventions.md` を正本として扱い、参照元と Claude 設定を新パスに揃える。

**Architecture:** UI 規約は共通ルール群の一部として `.agents/rules/` に集約する。移動後は旧パス参照をすべて新パスへ置換し、`CLAUDE.md` / `GEMINI.md` / skills / 過去の設計記録も含めてリンク切れを残さない。

**Tech Stack:** Markdown, JSON, git

---

### Task 1: 規約ファイルを移動する

**Files:**

- Move: `docs/ui-conventions.md` -> `.agents/rules/ui-conventions.md`
- Modify: `.agents/rules/common.md`

- [ ] **Step 1: 既存内容をそのまま新パスへ移す**

```bash
git mv docs/ui-conventions.md .agents/rules/ui-conventions.md
```

- [ ] **Step 2: 共通規約からの参照を新パスに更新する**

```md
共通コンポーネント・ホバー処理・ボタン高さ揃え・レスポンシブ・ToggleGroup リセット要否・Playwright 撮影手順・目視確認チェックリスト等の詳細 → **`.agents/rules/ui-conventions.md`**
```

- [ ] **Step 3: 移動後のファイル先頭と本文を確認する**

Run: `sed -n '1,40p' .agents/rules/ui-conventions.md`
Expected: 既存の内容が保持され、参照先が新パス表記になっている。

### Task 2: 参照リンクを一括更新する

**Files:**

- Modify: `CLAUDE.md`
- Modify: `GEMINI.md`
- Modify: `.agents/skills/dads-design-system/SKILL.md`
- Modify: `.agents/skills/dads-design-system/references/components.md`
- Modify: `docs/superpowers/plans/2026-05-02-issue-231-download-button-refactor.md`
- Modify: `docs/superpowers/plans/2026-05-03-issue-176-b1-foundation-and-ui-simple.md`
- Modify: `docs/superpowers/specs/2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md`
- Modify: `docs/superpowers/specs/2026-05-04-issue-176-b1-5-ui-complex-design.md`
- Modify: `docs/superpowers/specs/2026-05-04-issue-176-b2-qr-ticket-design.md`
- Modify: `docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md`
- Modify: `.agents/rules/common.md`

- [ ] **Step 1: 旧パス文字列を新パスへ置換する**

```text
.agents/rules/ui-conventions.md
```

- [ ] **Step 2: `@` インポート表記を使っているファイルは、既存の `@.agents/rules/common.md` と同じ流儀で書き換える**

```md
@.agents/rules/ui-conventions.md
```

- [ ] **Step 3: 置換漏れを確認する**

Run: `rg -n "docs/ui-conventions\\.md" .`
Expected: 0 hits

### Task 3: Claude 設定を更新する

**Files:**

- Modify: `.claude/settings.json`

- [ ] **Step 1: `.agents` 配下の prettier 実行を allow に追加する**

```json
"Bash(npx prettier --write .agents/*)"
```

- [ ] **Step 2: 設定ファイルを整形して構文を保つ**

Run: `npx prettier --write .claude/settings.json`
Expected: JSON が整形され、差分が最小限になる。

### Task 4: 検証してコミットする

**Files:**

- Modify: all changed files

- [ ] **Step 1: 参照が残っていないことを確認する**

Run: `rg -n "docs/ui-conventions\\.md" .`
Expected: 0 hits

- [ ] **Step 2: 差分を確認する**

Run: `git diff --stat`
Expected: 移動 + 参照更新 + `.claude/settings.json` 追加のみに収まる。

- [ ] **Step 3: コミットする**

```bash
git add .agents/rules/ui-conventions.md .agents/rules/common.md CLAUDE.md GEMINI.md .agents/skills/dads-design-system/SKILL.md .agents/skills/dads-design-system/references/components.md docs/superpowers/plans/2026-05-02-issue-231-download-button-refactor.md docs/superpowers/plans/2026-05-03-issue-176-b1-foundation-and-ui-simple.md docs/superpowers/specs/2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md docs/superpowers/specs/2026-05-04-issue-176-b1-5-ui-complex-design.md docs/superpowers/specs/2026-05-04-issue-176-b2-qr-ticket-design.md docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md .claude/settings.json
git commit -m "docs: UI 規約の配置を移動"
```
