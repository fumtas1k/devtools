# `#176` B 案 PR 9 follow-up — `#309` / `#308` decision メモ化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR 10 (#305) 着手前に `#309` (FOUC option A 採用) と `#308` (sheet 再利用 (ii) 実装見送り) の decision を memo 化する PR を作成する。

**Architecture:** decision-only PR。実装変更は最小限 (JSDoc 1 箇所 + decisions.md 追記 + SoT 更新) で 1 commit に集約。`useDynamicStyleSheet` hook の behavioral change ゼロ、既存 test 5 件すべて pass する想定。

**Tech Stack:** Markdown (docs)、TypeScript JSDoc、git/gh CLI、prettier (pre-commit hook)、astro check / vitest / Playwright (verification)。

**Spec:** `docs/superpowers/specs/2026-05-08-issue-309-308-pr9-followup-decisions-design.md` (commit `6981d6b`)

**Branch:** `chore/issue-309-pr9-followup-decisions` (本 plan 着手前に既に切り替え済、spec commit 1 件 ahead of `develop`)

---

## File Structure

| ファイル                                     | 変更                                                                                                                       | 想定行数 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| `src/hooks/useDynamicStyleSheet.ts`          | 既存 JSDoc に FOUC expected behavior + `decisions.md [067] Follow-up decisions` 参照を 4 行追記                            | +4       |
| `docs/decisions.md`                          | `[067]` PR 9 outcome の直後 (line 2539 と 2540 の間) に "Follow-up decisions (PR 10 着手前、2026-05-08)" subsection を新設 | +約 35   |
| `docs/projects/issue-176-b-plan-progress.md` | PR 9 entry 末尾に follow-up 1 行追加 + PR 10 entry の前提リストに 1 行追加                                                 | +2       |

## TDD Note

本 PR は behavioral 変更ゼロの **decision-only PR** のため、新規 test 追加は不要。検証は以下の preservation check で行う:

- `astro check`: 型変更なし → 既存通り pass
- `npm run test`: `useDynamicStyleSheet` の既存 5 件すべて pass (JSDoc 改修のみ、ロジック無変更)
- `npm run test:e2e`: PR 9 で導入した `csp-constructable-stylesheet.spec.ts` 永続検出網に違反なし

---

### Task 1: `useDynamicStyleSheet.ts` JSDoc に FOUC expected behavior を追記

**Files:**

- Modify: `src/hooks/useDynamicStyleSheet.ts` (現 line 1-12 が既存 JSDoc)

**目的:** Constructable Stylesheets 経路の `useEffect` 内 attach に伴う FOUC が **expected behavior** であることを hook レベルで明記し、callsite ごとの重複コメント追加を回避する。

- [ ] **Step 1: 既存 JSDoc を確認**

Run: `Read /Users/fumta/projects/devtools/src/hooks/useDynamicStyleSheet.ts` (full file)
Expected: line 10-12 に "SSR-safe: ... `useEffect` 内で行うため client-side のみ実行される。" の記述がある。

- [ ] **Step 2: Edit で FOUC expected behavior を 4 行追記**

`old_string` (line 10-12 を含む既存 JSDoc 末尾、唯一マッチ):

```ts
 * SSR-safe: `useId()` ベースで stable な class 名を返すため SSR / CSR で
 * markup mismatch しない。`adoptedStyleSheets` への attach は `useEffect`
 * 内で行うため client-side のみ実行される。
```

`new_string`:

```ts
 * SSR-safe: `useId()` ベースで stable な class 名を返すため SSR / CSR で
 * markup mismatch しない。`adoptedStyleSheets` への attach は `useEffect`
 * 内で行うため client-side のみ実行される。
 *
 * SSR HTML → hydration 1 frame は dynamic style 未適用 (FOUC)。callsite が
 * hard-coded literal (例: ResultTable の minWidth='42rem') の場合は許容方針
 * (`docs/decisions.md [067] Follow-up decisions` 参照、option A)。callsite が
 * user input 経由 / props 動的変化を持つ場合は別途検討が必要。
```

- [ ] **Step 3: 型変更ないことを確認**

Run: `astro check`
Expected: 既存と同等 (warnings/errors の件数増加ゼロ)。本ファイルは JSDoc のみ改修のため diagnostics 影響なし。

- [ ] **Step 4: 既存 unit test pass を確認**

Run: `npm run test -- useDynamicStyleSheet`
Expected: 5 件すべて pass。

- [ ] **Step 5: ファイル状態確認 (commit はまだしない)**

Run: `git status -s`
Expected: ` M src/hooks/useDynamicStyleSheet.ts` の 1 行のみ。

---

### Task 2: `docs/decisions.md [067]` に "Follow-up decisions" subsection を追加

**Files:**

- Modify: `docs/decisions.md` (line 2539 と 2540 の間 = "PR 9 outcome (2026-05-08)" section の直後 / "### 関連 PR / issue" section の直前)

**目的:** `#309` と `#308` の decision を repo SoT として記録。PR 10 spec 起草時に既決事項として参照される。

- [ ] **Step 1: 挿入アンカーを再確認**

Run: `grep -n "^### " docs/decisions.md | tail -3`
Expected: 末尾 3 つは `### PR 9 outcome (2026-05-08)` / `### 関連 PR / issue` / (それ以外 [067] は終端)。最新セクションは `[067]` 内に閉じている。

- [ ] **Step 2: Edit で Follow-up decisions subsection を挿入**

`old_string` ([067] の "PR 9 outcome" 末尾と "### 関連 PR / issue" 見出し開始の間。本 string は decisions.md 全体で唯一マッチする):

```markdown
- PR 9 完了判定は「React 経由 setProperty 0 件 + Phase 0 spec PASS + 全既存 e2e (`withProductionCsp` 通常 run) PASS」に縮小、Phase 2 strict CSP 検証は PR 10 に統合

### 関連 PR / issue
```

`new_string` (本ブロック全体を Edit に貼り付ける、prettier の MD table 整形は自動補正されるので手動調整不要):

```markdown
- PR 9 完了判定は「React 経由 setProperty 0 件 + Phase 0 spec PASS + 全既存 e2e (`withProductionCsp` 通常 run) PASS」に縮小、Phase 2 strict CSP 検証は PR 10 に統合

### Follow-up decisions (PR 10 着手前、2026-05-08)

PR 9 merge 後の review で 2 件の follow-up issue が起票され、PR 10 着手前に方針を確定した。

#### #309 ResultTable FOUC → option A (現状容認)

**現象**: `useDynamicStyleSheet` は `useEffect` 内で `adoptedStyleSheets` に attach するため、SSR HTML → hydration 1 frame だけ dynamic style 未適用 (`min-width` / `width` が auto)。

**評価した解**:

| 案  | 仕組み                                   | 採否                                       |
| --- | ---------------------------------------- | ------------------------------------------ |
| A   | 現状容認 + JSDoc 明記                    | ✅ **採用**                                |
| B   | `global.css` に「型代表値」fallback 復元 | 不採用 (callsite 固有値で代表値原理的不在) |
| C   | SSR `style="..."` 属性経路 (Astro hash)  | 不採用 (CSP3 strict 化と非互換)            |

**A 採用根拠**:

- callsite 2 箇所 (`UuidV7Generator` minWidth=42rem / `UlidGenerator` minWidth=36rem) すべて hard-coded literal、props 動的変化なし → FOUC は「初回画面の 1 frame」限定
- `ToggleGroup` `var(--toggle-cols, 2)` の dimensionless 整数 fallback とは異なり、`ResultTable` の `min-width` / `width` は callsite 固有値で 1 つの代表値が原理的に存在しない (option B が常に乖離)
- PR 10 VRT は `toHaveScreenshot` が networkidle + hydration 後撮影 → FOUC frame は捕捉しない

**対応**: `useDynamicStyleSheet.ts` JSDoc に FOUC expected behavior 明記 (本 PR で実装)、issue `#309` を close。

#### #308 useDynamicStyleSheet sheet 再利用最適化 → (ii) 実装見送り

**現状**: rules 変更ごとに `new CSSStyleSheet()` 生成、cleanup で `adoptedStyleSheets` を filter 走査して取り外す。

**API 設計意図との乖離**: Constructable Stylesheets API は本来 sheet を retain して `replaceSync(newRules)` で in-place 更新できる設計。`useRef<CSSStyleSheet>` で sheet 保持 → 初回のみ attach、以降 `replaceSync` のみで更新の最適化が可能。

**評価**:

| 案                             | 採否                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------- |
| (i) 今 PR で `useRef` 化実装   | 不採用 (rules 変化頻度ゼロで実害なし、YAGNI)                                      |
| (ii) decision メモのみ実装見送 | ✅ **採用**                                                                       |
| (iii) close as won't-fix       | 不採用 (将来 dynamic rules 利用時に再起票より open 維持の方が context 保全に優位) |

**(ii) 採用根拠**:

- 現 callsite (`ResultTable` / `ToggleGroup`) は rules 変化頻度ほぼゼロ (props で columns / minWidth が変わるユースケースなし) → 最適化 ROI 低い
- API 非整合は事実だが、将来 dynamic な rules 利用が出た時に再評価で十分

**再評価条件**: `useDynamicStyleSheet` callsite で props に応じて rules が頻繁に変化するユースケースが追加された時 / `adoptedStyleSheets` 配列が観測可能なほど肥大化した時。

**対応**: 本 entry に decision 記録、issue `#308` は **open のまま** (future enhancement として残置)、本 PR では実装変更なし。

### 関連 PR / issue
```

- [ ] **Step 3: ファイル状態確認**

Run: `git diff --stat docs/decisions.md`
Expected: `+33` 前後の追加行 (prettier 整形で +1〜+2 程度の差は許容)。削除行ゼロ。

---

### Task 3: SoT (`docs/projects/issue-176-b-plan-progress.md`) を更新

**Files:**

- Modify: `docs/projects/issue-176-b-plan-progress.md` (PR 9 entry 末尾 line 130 / PR 10 entry 前提 line 138)

**目的:** PR 9 follow-up が「実施済」「PR 10 の前提として確定済」であることを SoT に反映。次セッション / 次 PC / 協業者が PR 10 spec 起草時に本 follow-up を見落とさない。

- [ ] **Step 1: PR 9 entry 末尾に follow-up 1 行追加**

`old_string` (line 130、SoT 全体で唯一マッチ):

```markdown
- **後続**: PR 10 ([#305]) で `_headers` / `<meta>` strict 化 + `stripMetaStyleSrc` 撤去 + Astro island style hash 取り込み + test 群 strict 化 (PR 8 rebase で削除した 3 commit 再投入)

### PR 10 (issue [#305](https://github.com/fumtas1k/devtools/issues/305)、新規) — B 案最終 flip
```

`new_string`:

```markdown
- **後続**: PR 10 ([#305]) で `_headers` / `<meta>` strict 化 + `stripMetaStyleSrc` 撤去 + Astro island style hash 取り込み + test 群 strict 化 (PR 8 rebase で削除した 3 commit 再投入)
- **PR 9 follow-up (本 PR、`#312` の後続)**: `#309` (FOUC option A) close / `#308` (sheet 再利用 (ii) 実装見送り) open 維持、`docs/decisions.md [067] Follow-up decisions` で記録 + `useDynamicStyleSheet.ts` JSDoc 補強

### PR 10 (issue [#305](https://github.com/fumtas1k/devtools/issues/305)、新規) — B 案最終 flip
```

- [ ] **Step 2: PR 10 entry 前提リストに 1 行追加**

`old_string` (line 138、SoT 全体で唯一マッチ):

```markdown
- **前提**: PR 9 完了 (ResultTable refactor merge)
- **検証**: 親直接 E2E (`npm run test:e2e`) で violation ゼロ + VRT diff ゼロ
```

`new_string`:

```markdown
- **前提**: PR 9 完了 (ResultTable refactor merge) + PR 9 follow-up decision メモ化済 (`#309` close / `#308` 方針確定、`docs/decisions.md [067] Follow-up decisions`)
- **検証**: 親直接 E2E (`npm run test:e2e`) で violation ゼロ + VRT diff ゼロ
```

- [ ] **Step 3: ファイル状態確認**

Run: `git diff --stat docs/projects/issue-176-b-plan-progress.md`
Expected: `+1, -0` × 2 箇所 = 合計 `+2` 追加。

---

### Task 4: 親直接検証 (astro check + unit + E2E) + 1 commit

**目的:** behavioral change ゼロを確認後、Task 1〜3 の差分を 1 commit にまとめる。

- [ ] **Step 1: 全 staged 状態確認**

Run: `git status -s`
Expected: 3 ファイルすべて modified (`useDynamicStyleSheet.ts` / `decisions.md` / `issue-176-b-plan-progress.md`)。other unstaged 変更なし。

- [ ] **Step 2: 型検査**

Run: `astro check`
Expected: 既存と同等 (warnings/errors 件数 unchanged)。

- [ ] **Step 3: unit test (全件)**

Run: `npm run test`
Expected: 全 pass。`useDynamicStyleSheet` 5 件含む既存 test がそのまま green。

- [ ] **Step 4: 親直接 E2E**

Run: `npm run test:e2e`
Expected: 全 pass。PR 9 で導入した `csp-constructable-stylesheet.spec.ts` 永続検出網にも violation なし (本 PR は behavioral change ゼロのため、既存 strict CSP gate も全 pass のまま)。

E2E が CI 環境で長時間化する場合は subagent (sonnet) に委譲して merge 待ち裁量検討、ただし decision-only PR の重要性を踏まえ親直接実行を default とする (memory `feedback_subagent_verification_trust.md` / `feedback_e2e_before_pr.md` 準拠)。

- [ ] **Step 5: 1 commit にまとめる (HEREDOC 経由、CLAUDE.md 必須形式)**

Run:

```bash
git add src/hooks/useDynamicStyleSheet.ts docs/decisions.md docs/projects/issue-176-b-plan-progress.md
git commit -m "$(cat <<'EOF'
chore(docs): #176 B 案 PR 9 follow-up — #309 (FOUC option A) / #308 (sheet 再利用) decision メモ化 + JSDoc 補強

PR 10 (#305) 着手前の前提整備として、PR 9 merge 後 review で起票された
follow-up issue 2 件の方針を確定し repo SoT に記録する。

- src/hooks/useDynamicStyleSheet.ts: FOUC は useEffect 内 attach の
  expected behavior であることを JSDoc に明記。callsite が hard-coded
  literal の場合は許容方針 (option A)、user input / props 動的変化を
  持つ場合は別途検討、と利用条件を分離記述。
- docs/decisions.md [067]: PR 9 outcome 末尾に "Follow-up decisions
  (PR 10 着手前、2026-05-08)" subsection を追加。#309 (option A) と
  #308 ((ii) 実装見送り) の評価表 + 採用根拠 + 再評価条件を記録。
- docs/projects/issue-176-b-plan-progress.md: PR 9 entry 末尾に
  follow-up 1 行追加、PR 10 entry の前提リストに「follow-up decision
  メモ化済」を追加。

検証: 親直接 astro check / npm run test / npm run test:e2e すべて pass、
behavioral change ゼロ。

Closes #309
Refs #308 (open 維持、future enhancement)
EOF
)"
```

Expected: pre-commit hook (prettier + tsc) pass、commit 作成成功。

- [ ] **Step 6: commit 内容確認**

Run: `git log -1 --stat`
Expected: 3 ファイル変更、追加行 ~37、削除行 0。前 commit は `6981d6b` (spec)。

---

### Task 5: push + PR 作成 (CLAUDE.md 必須 4 点遵守)

**目的:** PR を `develop` ベースで作成。

- [ ] **Step 1: pre-create check (base 一致確認)**

Run:

```bash
git merge-base origin/develop HEAD && git diff origin/develop --name-only
```

Expected: `git merge-base` が直近 develop tip hash (≒ `ad698a5` または更新あれば最新) を返す。`git diff` の対象は本 PR で touch する 4 ファイル (spec + 3 implementation files)。aria-\* 削除なし (本 PR は HTML 触らないため自明だが念のため)。

- [ ] **Step 2: branch を origin に push**

Run: `git push -u origin chore/issue-309-pr9-followup-decisions`
Expected: push 成功。pre-push hook (もしあれば E2E 起動) は Task 4 で実行済 → skip 可能、または再実行 OK。

- [ ] **Step 3: PR body を `/tmp/claude/pr_body.md` に書き出し**

Run: `mkdir -p /tmp/claude` (idempotent)、その後 Write tool で以下内容を `/tmp/claude/pr_body.md` に保存:

```markdown
## 概要

`#176` B 案 PR 9 ([#307](https://github.com/fumtas1k/devtools/pull/307), merged `52d6ef3`) merge 後の review で起票された follow-up issue 2 件について、PR 10 ([#305](https://github.com/fumtas1k/devtools/issues/305)) 着手前に方針を確定し repo SoT (`docs/decisions.md` / `docs/projects/issue-176-b-plan-progress.md`) に記録する **decision-only PR**。

## 確定した方針

### `#309` ResultTable FOUC → **option A 採用 (現状容認)**

`useDynamicStyleSheet` は `useEffect` 内で `adoptedStyleSheets` に attach するため SSR HTML → hydration 1 frame だけ dynamic style 未適用。callsite (`UuidV7Generator` / `UlidGenerator`) はすべて hard-coded literal で props 動的変化なし、ToggleGroup の `var(--toggle-cols, 2)` のような dimensionless 整数 fallback と異なり代表値が原理的に存在しないため、option B (fallback 復元) は不採用。option C (SSR `style=""`) は CSP3 strict 化と非互換。

**対応**: `useDynamicStyleSheet.ts` JSDoc に FOUC expected behavior 明記、`docs/decisions.md [067] Follow-up decisions` に記録、issue を close。

### `#308` useDynamicStyleSheet sheet 再利用最適化 → **(ii) 実装見送り**

現 callsite は rules 変化頻度ほぼゼロで実害なし。Constructable Stylesheets API の設計意図 (`useRef` + `replaceSync` 経路) との乖離は認識しているが、最適化 ROI 低く YAGNI で実装見送り。issue は **open のまま** (future enhancement)。再評価条件は decision entry に明記。

## 変更ファイル

- `src/hooks/useDynamicStyleSheet.ts`: JSDoc に FOUC expected behavior + `decisions.md [067]` 参照を追記 (+4 行)
- `docs/decisions.md`: `[067]` PR 9 outcome 末尾に "Follow-up decisions (PR 10 着手前、2026-05-08)" subsection 追加 (+約 33 行)
- `docs/projects/issue-176-b-plan-progress.md`: PR 9 entry / PR 10 entry に follow-up 反映 (+2 行)
- `docs/superpowers/specs/2026-05-08-issue-309-308-pr9-followup-decisions-design.md`: 設計書 (前 commit `6981d6b`)
- `docs/superpowers/plans/2026-05-08-issue-309-308-pr9-followup-decisions-plan.md`: 実装プラン (本 PR の plan、内容は spec 準拠)

## 検証

- 親直接 `astro check` / `npm run test` / `npm run test:e2e` すべて pass
- behavioral change ゼロ (JSDoc + docs のみ、ロジック無変更)
- 既存 `useDynamicStyleSheet` test 5 件すべて green
- PR 9 で導入した `csp-constructable-stylesheet.spec.ts` 永続検出網にも違反なし

## 関連

- 親プロジェクト: `#176` B 案 (`docs/projects/issue-176-b-plan-progress.md`)
- 前段: PR `#307` (PR 9, ResultTable + ToggleGroup refactor)
- 後段: PR 10 (`#305`)
- Closes `#309`
- Refs `#308` (open 維持、future enhancement)
```

Expected: `/tmp/claude/pr_body.md` に上記内容が保存される。

- [ ] **Step 4: gh pr create で PR 作成 (`--base develop` / `--body-file` 必須)**

Run:

```bash
gh pr create \
  --base develop \
  --title "chore(docs): #176 B 案 PR 9 follow-up — #309 (FOUC option A) / #308 (sheet 再利用) decision メモ化 + JSDoc 補強" \
  --body-file /tmp/claude/pr_body.md
```

Expected: PR URL が返る (例: `https://github.com/fumtas1k/devtools/pull/313` あたり)。

- [ ] **Step 5: PR 状態確認 + URL を user に共有**

Run: `gh pr view --json url,baseRefName,title,state | jq .`
Expected: `baseRefName: "develop"`、`state: "OPEN"`、title が日本語で正しく設定されている。

返却された PR URL を user に報告。

---

## Summary

- 5 tasks、すべて bite-sized (各 2-5 分)
- 1 commit (Task 4 でまとめる、spec commit `6981d6b` と合わせ branch 上は計 2 commit)
- 想定総工数: 30〜45 分 (E2E 実行時間が支配的、~10 分)
- 親直接実装 (subagent 委譲不要)
- CLAUDE.md 必須 4 点遵守: `--base develop` / `--body-file` / pre-create check / 日本語

## Self-Review

**Spec coverage:** spec § 4.1 (触るファイル 3 件) → Task 1/2/3。spec § 4.3 (1 commit) → Task 4 Step 5。spec § 6 (検証 4 項目) → Task 4 Step 2/3/4。spec § 8 (branch / PR 命名 / CLAUDE.md 4 点) → Task 5。

**Placeholder scan:** TBD/TODO/「適切に」「以下のように」等の placeholder 表現なし。各 step に exact code / exact command / expected output を記載済。

**Type consistency:** JSDoc は文字列追記のみで型シグネチャ無変更。`Edit` の `old_string` と `new_string` は exact match で記述済。
