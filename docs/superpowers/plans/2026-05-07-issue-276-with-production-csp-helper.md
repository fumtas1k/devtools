# #276 `withProductionCsp` E2E ヘルパ集約 実装計画書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**: `tests/e2e/helpers.ts` に `withProductionCsp(browser, path, fn)` ラッパを追加し、PR 3 で導入された 9 行 boilerplate (`browser.newContext` ... `context.close`) を 1 行に集約。`uuid-v7.spec.ts` 通常 5 件 + `config-converter.spec.ts` 通常 1 件をラッパ利用形に書換、陽性対照メタテスト 2 件は inline 維持。

**Architecture**: Phase 0 (親 Opus) で feature branch 作成 + ヘルパ追加 commit、Phase 1 で sonnet subagent 2 並列 (uuid-v7 / config-converter の disjoint files、commit せず)、Phase 1.5 で親 Opus が順次 stage + commit (PR 4 で確立した race 完全回避方式)、Phase 2 で E2E 直接実行 + progress doc 更新 + PR 作成。

**Tech Stack**: TypeScript / Playwright

**作成日**: 2026-05-07
**Spec**: `docs/superpowers/specs/2026-05-07-issue-276-with-production-csp-helper-design.md`
**ブランチ**: `feature/issue-276-with-production-csp-helper`
**Base**: `origin/develop` (PR 4 #277 merge 後の最新)
**Worktree**: 不要 (本 PR は `tests/e2e/` 配下のみで親作業ディレクトリ非汚染、subagent も isolation 不要 disjoint files)

---

## 進行モデル

`feedback_subagent_model.md` / `feedback_subagent_workflow.md` / `feedback_subagent_verification_trust.md` / `feedback_infra_feature_separation.md` 準拠。

| Phase | 担当                  | 内容                                                                                        |
| ----- | --------------------- | ------------------------------------------------------------------------------------------- |
| 0     | 親 Opus               | feature branch 作成、spec/plan 配置 commit、`helpers.ts` に `withProductionCsp` 追加 commit |
| 1     | sonnet 並列 (2 track) | Track A (uuid-v7) / Track B (config-converter) の編集 + self-verification (commit せず)     |
| 1.5   | 親 Opus               | Track A / B の変更を順次 stage + commit                                                     |
| 2     | 親 Opus               | `npm run test:e2e` 直接実行、progress doc 更新 commit、push、PR 作成                        |
| 3     | 親 Opus + reviewer    | review → merge → SoT 反映                                                                   |

---

## File Structure

| File                                                        | Phase | 担当    | 変更内容                                                                                                                                                                                      |
| ----------------------------------------------------------- | ----- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/superpowers/specs/2026-05-07-issue-276-...-design.md` | 0     | 親 Opus | spec を最初の commit で配置                                                                                                                                                                   |
| `docs/superpowers/plans/2026-05-07-issue-276-....md`        | 0     | 親 Opus | plan を spec と同 commit で配置                                                                                                                                                               |
| `tests/e2e/helpers.ts`                                      | 0     | 親 Opus | `withProductionCsp` を JSDoc 付きで export 追加 (約 30 行)                                                                                                                                    |
| `tests/e2e/uuid-v7.spec.ts`                                 | 1     | Track A | 通常 5 件を `withProductionCsp` に書換、`waitForReactHydration` import 削除、`withProductionCsp` import 追加。陽性対照メタテスト 1 件は **不変**                                              |
| `tests/e2e/config-converter.spec.ts`                        | 1     | Track B | 通常 1 件 (line 194-240) を `withProductionCsp` に書換、`withProductionCsp` import 追加。`waitForReactHydration` import は **保持** (`beforeEach` で使用)、陽性対照メタテスト 1 件は **不変** |
| `docs/projects/issue-176-b-plan-progress.md`                | 2     | 親 Opus | `#276` 行を「✅ closed (PR #XXX)」、PR 3 follow-up 表 / PR 6 必須チェックリストの該当箇所も同期                                                                                               |

**触らない**:

- `src/utils/csp.ts` (`PRODUCTION_CSP` 定数、本 PR は import 経路を変えない)
- `tests/e2e/helpers.ts` の既存 `applyProductionCsp` / `waitForReactHydration` / `CspGuard` (シグネチャ不変)
- 他 spec ファイル (helper 利用は対象 2 ファイルのみ、grep で確認済)
- 陽性対照メタテスト 2 件 (`uuid-v7.spec.ts` line 171-203、`config-converter.spec.ts` line 242-275)

---

## Phase 0 — 親 Opus 直接実行

### Task 0.1: Feature branch 作成

- [ ] **Step 1**: clean state 確認

```bash
git status
git branch --show-current
# Expected: clean / develop
```

- [ ] **Step 2**: origin/develop の最新を fetch

```bash
git fetch origin develop
git rev-parse origin/develop HEAD
# Expected: 同じ SHA (PR 4 #277 merge 後 = 495f60e 以降)
```

- [ ] **Step 3**: feature branch 作成

```bash
git checkout -b feature/issue-276-with-production-csp-helper origin/develop
```

### Task 0.2: spec / plan を初手 commit

- [ ] **Step 1**: spec / plan が両方存在することを確認

```bash
ls docs/superpowers/specs/2026-05-07-issue-276-with-production-csp-helper-design.md
ls docs/superpowers/plans/2026-05-07-issue-276-with-production-csp-helper.md
```

- [ ] **Step 2**: stage + commit

```bash
git add docs/superpowers/specs/2026-05-07-issue-276-with-production-csp-helper-design.md \
        docs/superpowers/plans/2026-05-07-issue-276-with-production-csp-helper.md
git commit -m "docs(test): #276 withProductionCsp ヘルパ集約の spec / plan を追加"
```

### Task 0.3: `withProductionCsp` を `helpers.ts` に追加

- [ ] **Step 1**: `tests/e2e/helpers.ts` の末尾 (line 143 の `}` 直後) に以下を追加

````ts
import type { Browser } from '@playwright/test';
// ↑ 既に line 1 で `import type { ConsoleMessage, Page, Route } from '@playwright/test';`
//   があるため、`Browser` を同 import 行にマージする (`Browser, ConsoleMessage, Page, Route`)。

/**
 * `applyProductionCsp` + `browser.newContext` + `goto` + `waitForReactHydration`
 * + 終端 `guard.assertNoViolations()` + `context.close` を一括で集約するラッパ。
 *
 * 通常の "本番 CSP 下で機能が動作する" 系テストは本ラッパで包めば 1 行で済む:
 *
 * ```ts
 * test('UUIDを生成できる', async ({ browser }) => {
 *   await withProductionCsp(browser, '/tools/uuid-v7', async (page) => {
 *     await page.getByRole('button', { name: '生成' }).click();
 *     await expect(page.getByText('10 件生成')).toBeVisible();
 *   });
 * });
 * ```
 *
 * **陽性対照メタテスト (gate 自体の動作確認) には使わないこと**:
 * メタテストは `guard.violations.length` を fn 内で polling する必要があり、
 * ラッパが終端で `assertNoViolations()` を呼ぶ設計と整合しない (違反を期待
 * するテストなのに「違反 0」を assert してしまう)。これらは inline pattern
 * を維持する (`tests/e2e/uuid-v7.spec.ts` / `tests/e2e/config-converter.spec.ts`
 * に各 1 件存在)。
 *
 * **`fn` への引数**: 通常テストでは `page` のみ使う。`guard` は fn 内で
 * 違反件数を観測したい高度な用途のために第 2 引数として露出するが、終端
 * の `assertNoViolations()` 呼び出しはラッパが行うため、利用側で再度呼ぶ
 * 必要はない。
 *
 * **fn throw 時の挙動**: `fn` が例外を投げると `assertNoViolations` は
 * 呼ばれず、`finally` で `context.close()` のみ実行される。元の例外が
 * 伝播しテストが失敗する (inline pattern と等価)。
 */
export async function withProductionCsp(
  browser: Browser,
  path: string,
  fn: (page: Page, guard: CspGuard) => Promise<void>
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const guard = await applyProductionCsp(page);
    await page.goto(path);
    await waitForReactHydration(page);
    await fn(page, guard);
    guard.assertNoViolations();
  } finally {
    await context.close();
  }
}
````

- [ ] **Step 2**: 型チェック

```bash
npx astro check 2>&1 | tail -20
# Expected: 0 errors
```

- [ ] **Step 3**: prettier format

```bash
npx prettier --write tests/e2e/helpers.ts
```

- [ ] **Step 4**: commit

```bash
git add tests/e2e/helpers.ts
git commit -m "feat(test): #276 withProductionCsp ラッパを helpers.ts に追加"
```

---

## Phase 1 — sonnet 並列 (2 track、commit せず)

両 Track は disjoint files で edit 競合なし、`isolation: "worktree"` 不要。各 subagent は self-verification (prettier --check / astro check / 自身の担当 spec の test:e2e single file 実行) のみ実施し、**commit / push は行わない**。

### Track A (sonnet): `uuid-v7.spec.ts` 通常 5 件を書換

`feedback_subagent_model.md`: `model: "sonnet"` 明示。

prompt 骨子 (詳細は親 Opus が `Agent` ツール呼び出し時に組み立てる):

- 担当ファイル: `tests/e2e/uuid-v7.spec.ts` のみ
- 仕様: spec §2 「`tests/e2e/uuid-v7.spec.ts` の書換 (5 件)」と File Structure 表に従う
- import 整理: `applyProductionCsp` / `withProductionCsp` を残し、`waitForReactHydration` を削除
- 各書換テスト本体は spec §2 の Before/After を参照 (assertions の中身は **完全保持**)
- 陽性対照テスト (line 171-203) は **不変** (line 番号は書換後の最終形を基準にしてよい)
- 自走 verification:
  - `npx prettier --check tests/e2e/uuid-v7.spec.ts`
  - `npx astro check 2>&1 | tail -20`
  - `npx playwright test tests/e2e/uuid-v7.spec.ts --project=chromium --reporter=list 2>&1 | tail -30`
    - Expected: 6 passed (5 件新ラッパ + 1 件陽性対照)
- **禁止**: `git add` / `git commit` / `git push` / 他ファイルの編集
- 完了報告: 変更行範囲、import 整形結果、test 6 件すべて pass の出力末尾

### Track B (sonnet): `config-converter.spec.ts` 通常 1 件を書換

`feedback_subagent_model.md`: `model: "sonnet"` 明示。

prompt 骨子:

- 担当ファイル: `tests/e2e/config-converter.spec.ts` のみ
- 仕様: spec §3 「`tests/e2e/config-converter.spec.ts` の書換 (1 件)」と File Structure 表に従う
- 書換対象: `JSON Schema 検証パネル: 本番相当 CSP 下でも検証が成功し違反が出ない（リグレッション防止）` (line 194-240) のみ
- import 整理: `applyProductionCsp` / `waitForReactHydration` / `withProductionCsp` 全て保持 (waitForReactHydration は beforeEach で使用継続、applyProductionCsp は陽性対照で使用継続)
- 説明コメント (line 195-208) は **保持** (helper の JSDoc に移った内容と重複する箇所はコンパクト化可だが、Ajv 経緯の段落は保持)
- 陽性対照テスト (line 242-275) は **不変**
- 通常テスト (default `page` fixture 使用、line 5-192 + 277-313) は **不変**
- 自走 verification:
  - `npx prettier --check tests/e2e/config-converter.spec.ts`
  - `npx astro check 2>&1 | tail -20`
  - `npx playwright test tests/e2e/config-converter.spec.ts --project=chromium --reporter=list 2>&1 | tail -40`
    - Expected: 11 passed (既存 9 件 + リグレッション防止 1 件新ラッパ + 陽性対照 1 件)
- **禁止**: `git add` / `git commit` / `git push` / 他ファイルの編集
- 完了報告: 変更行範囲、import 整形結果、test 11 件すべて pass の出力末尾

---

## Phase 1.5 — 親 Opus 順次 commit

PR 4 で確立した race 回避方式 (`feedback_subagent_verification_trust.md`)。

### Task 1.5.1: Track A の差分確認 + commit

- [ ] **Step 1**: subagent 完了報告と git diff を突き合わせて確認

```bash
git status
git diff tests/e2e/uuid-v7.spec.ts | head -80
git diff --stat
# Expected: tests/e2e/uuid-v7.spec.ts のみ変更
```

- [ ] **Step 2**: prettier 巻き込みなしを確認、stage + commit

```bash
git add tests/e2e/uuid-v7.spec.ts
git commit -m "refactor(test): #276 uuid-v7.spec.ts の通常 5 件を withProductionCsp に集約"
```

### Task 1.5.2: Track B の差分確認 + commit

- [ ] **Step 1**: 差分確認

```bash
git status
git diff tests/e2e/config-converter.spec.ts | head -80
git diff --stat
# Expected: tests/e2e/config-converter.spec.ts のみ変更
```

- [ ] **Step 2**: stage + commit

```bash
git add tests/e2e/config-converter.spec.ts
git commit -m "refactor(test): #276 config-converter.spec.ts のリグレッション防止 1 件を withProductionCsp に集約"
```

---

## Phase 2 — 親 Opus 直接実行 (検証 + PR 作成)

### Task 2.1: ローカル E2E 全実行

- [ ] **Step 1**: 親 Opus が直接実行 (memory `feedback_e2e_before_pr.md`)

```bash
npm run test:e2e 2>&1 | tail -40
# Expected: All tests passed
# 重点確認:
#   - chromium > UUID v7 生成（production CSP 適用）: 6 passed
#   - chromium > 設定ファイル相互変換: 11 passed (陽性対照メタテスト含む)
```

- [ ] **Step 2**: 陽性対照メタテスト 2 件が pass = ゲート空回りなしを確認

```bash
npx playwright test --project=chromium --reporter=list -g "applyProductionCsp は実際に CSP 違反を捕捉する" 2>&1 | tail -10
# Expected: 2 passed
```

### Task 2.2: progress doc 更新 commit

- [ ] **Step 1**: `docs/projects/issue-176-b-plan-progress.md` を編集

更新箇所:

- `### PR 3 (#275)` の `PR review 由来 follow-up: #276` 行: 「PR 5 前段の独立 infra PR で対応推奨」→ 「**✅ closed (PR #XXX で対応)**」
- 「PR 1 / PR 1.5 / PR 2 / PR 3 / PR 4 follow-up issue 処理タイミング表」の `#276` 行: 状態を「✅ closed」、備考に「PR #XXX で対応 (2026-05-07)」
- 「PR 6 必須チェックリスト」内の `PR 3 由来` 列の `#276` 言及も「✅ closed」に同期

(PR 番号は push 後に発行されるため、本 commit は push 後に PR 番号を確定してから or プレースホルダ `#XXX` で commit して push 後に amend 等で確定。下記 Step 2 では push 前に commit するため、PR 番号が決まり次第 amend)

- [ ] **Step 2**: 「PR 番号未確定」状態で進めるため、本 step では progress doc 更新を**保留**し、PR 作成後に追記 commit を別途行う方針に変更。よって本 Task 2.2 は **PR 作成後** (Phase 2 後段) に再着手する。

### Task 2.3: pre-create check (memory `feedback_commander_checklist.md`)

- [ ] **Step 1**: develop ベース一致確認

```bash
git fetch origin develop
test "$(git rev-parse origin/develop)" = "$(git merge-base HEAD origin/develop)" && echo OK || echo "BASE MISMATCH"
# Expected: OK
```

- [ ] **Step 2**: スコープ確認 (想定外ファイルなし)

```bash
git diff origin/develop --name-only
# Expected:
#   docs/superpowers/specs/2026-05-07-issue-276-with-production-csp-helper-design.md
#   docs/superpowers/plans/2026-05-07-issue-276-with-production-csp-helper.md
#   tests/e2e/helpers.ts
#   tests/e2e/uuid-v7.spec.ts
#   tests/e2e/config-converter.spec.ts
```

- [ ] **Step 3**: aria 削除なし確認 (本 PR は test only だが念のため、`docs/shared-agent-rules.md` 9.6)

```bash
git diff origin/develop -- 'src/**' | grep -E '^\-.*aria-' || echo "OK: no aria removal"
# Expected: OK: no aria removal
```

### Task 2.4: push + PR 作成

- [ ] **Step 1**: push

```bash
git push -u origin feature/issue-276-with-production-csp-helper
```

- [ ] **Step 2**: PR 本文を `/tmp/claude/pr_body.md` に書き出し (`feedback_heredoc_no_escape.md`: 素のバッククォートで書く)

PR 本文の骨子:

- 概要: PR 5 着手前の独立 infra PR、`withProductionCsp` ラッパで `applyProductionCsp` boilerplate を集約
- 変更ファイル一覧 (4 個 + spec/plan 2 個 = 6 個)
- メタテスト 2 件は inline 維持の理由 (guard.violations を fn 内で polling するため)
- 関連 issue: closes #276 / 起源 #275 / PR 5 で close 予定 #262
- テスト結果: ローカル `npm run test:e2e` 全 pass (陽性対照メタテスト 2 件も pass = ゲート空回りなし)
- 関連 spec: `docs/superpowers/specs/2026-05-07-issue-276-with-production-csp-helper-design.md`

- [ ] **Step 3**: PR 作成

```bash
gh pr create --base develop \
  --title "test(e2e): #276 withProductionCsp ラッパで applyProductionCsp boilerplate を集約" \
  --body-file /tmp/claude/pr_body.md
# Expected: PR URL 出力
```

### Task 2.5: progress doc 更新 commit (PR 番号確定後)

- [ ] **Step 1**: PR 番号を取得

```bash
PR_NUM=$(gh pr view --json number -q .number)
echo "PR_NUM=$PR_NUM"
```

- [ ] **Step 2**: `docs/projects/issue-176-b-plan-progress.md` の以下 3 箇所を更新 (`#XXX` を実 PR 番号に置換)

1. `### PR 3 (#275)` セクション内 `PR review 由来 follow-up: #276` 行
2. 「PR 1 / PR 1.5 / PR 2 / PR 3 / PR 4 follow-up issue 処理タイミング表」の `#276` 行
3. 「PR 6 必須チェックリスト」内 `PR 3 由来` の `#276` 言及

- [ ] **Step 3**: commit + push

```bash
git add docs/projects/issue-176-b-plan-progress.md
git commit -m "chore(docs): #276 progress tracker を closed 状態に更新 (#${PR_NUM})"
git push
```

---

## Phase 3 — review → merge → SoT 反映

### Task 3.1: review 待ち中は push 控える (memory `feedback_hold_push_during_review.md`)

- [ ] レビュー中に追加修正したくなっても自発 push せず、レビュー完了後にまとめて push

### Task 3.2: merge 後の SoT 整合性確認

- [ ] **Step 1**: `gh pr merge --delete-branch --squash` (memory `feedback_worktree_merge_order.md`、本 PR は worktree なしのため worktree cleanup 不要)
- [ ] **Step 2**: develop に切り戻し、最新 pull

```bash
git checkout develop
git pull origin develop
git branch -d feature/issue-276-with-production-csp-helper
```

- [ ] **Step 3**: progress doc が反映されているか確認

```bash
grep -n "#276" docs/projects/issue-176-b-plan-progress.md | head -10
# Expected: ✅ closed 表記が 3 箇所に反映済
```

---

## risk / 失敗時の rollback

| 状況                                                              | 対応                                                                                                                                                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 で subagent A/B が同 commit を打って race                 | `feedback_commander_checklist.md` の禁止指示が prompt に含まれていれば原則発生しない。発生したら親が `git reset --soft origin/develop` で巻き戻し再 stage                                          |
| Track A 完了報告は green だが親の `git diff` で予想外の改変       | subagent に diff 提示で差し戻し (memory `feedback_subagent_verification_trust.md`)                                                                                                                 |
| Phase 2 で `npm run test:e2e` 失敗 (`waitForReactHydration` 不足) | 該当 test の fn 冒頭に `await page.getByLabel('xxx').waitFor()` を追加し、新 commit (修正は既存 commit に挟み込まず追加で積む方針、`docs/shared-agent-rules.md` 6.x)                               |
| 陽性対照メタテスト 2 件が突然 fail                                | `applyProductionCsp` 経路に副作用がないかを確認。本 PR は helper の export 追加のみで既存関数は変えていないため、fail したら helper の `withProductionCsp` 内部で context state を壊している可能性 |

---

## 参照 memory 一覧

- `project_b_plan_progress.md` (pointer; SoT は repo `docs/projects/issue-176-b-plan-progress.md`)
- `feedback_infra_feature_separation.md`
- `feedback_subagent_model.md`
- `feedback_subagent_workflow.md`
- `feedback_subagent_verification_trust.md`
- `feedback_commander_checklist.md`
- `feedback_e2e_before_pr.md`
- `feedback_positive_control_for_gates.md`
- `feedback_pr_size.md`
- `feedback_heredoc_no_escape.md`
- `feedback_hold_push_during_review.md`
- `feedback_worktree_merge_order.md`
