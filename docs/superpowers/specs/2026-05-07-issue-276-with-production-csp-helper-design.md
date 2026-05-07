# #276 `withProductionCsp` E2E ヘルパ集約 設計書

**作成日**: 2026-05-07
**Issue**: [#276](https://github.com/fumtas1k/devtools/issues/276)
**起源 PR**: [#275](https://github.com/fumtas1k/devtools/pull/275) (#176 B 案 PR 3) review feedback
**位置付け**: `#176` B 案 PR 5 着手前の **独立 infra PR**（Claude memory `feedback_infra_feature_separation.md` 準拠）
**関連 issue**: [#262](https://github.com/fumtas1k/devtools/issues/262) (PR 5 で ulid-generator 追加 + close 予定)

---

## ゴール

`tests/e2e/helpers.ts` に `withProductionCsp(browser, path, fn)` ラッパを追加し、PR 3 で `tests/e2e/uuid-v7.spec.ts` / `tests/e2e/config-converter.spec.ts` に増殖した `browser.newContext() → newPage → applyProductionCsp → goto → waitForReactHydration → ... → guard.assertNoViolations() → context.close` の 9 行 boilerplate を 1 行 (`await withProductionCsp(browser, path, async (page) => { ... })`) に集約する。

完了基準:

1. `tests/e2e/helpers.ts` に `withProductionCsp` を export 追加
2. `tests/e2e/uuid-v7.spec.ts` の **通常 5 件** を `withProductionCsp` 利用形に書換 (陽性対照 1 件は inline 維持)
3. `tests/e2e/config-converter.spec.ts` の `applyProductionCsp` 利用 **通常 1 件** (`JSON Schema 検証パネル: 本番相当 CSP 下でも検証が成功し違反が出ない`) を `withProductionCsp` 利用形に書換 (陽性対照 1 件は inline 維持)
4. `npm run test:e2e` で 2 ファイル分すべて green、特に陽性対照メタテスト 2 件が依然として違反を捕捉する
5. **subagent は commit せず** ファイル編集のみ実施、親 Opus が Phase 1.5 で順次 commit (PR 4 の race 回避方式を踏襲)
6. PR 5 で `tests/e2e/ulid-generator.spec.ts` を新設する際は `withProductionCsp` 利用前提とできる状態にする

非ゴール:

- 陽性対照メタテストの helper 化 (`guard.violations` を fn 内で操作する独自要件があり、ラッパで包むメリットが薄い。inline 維持で「ゲート自体の動作」を生で読める利点を取る)
- `applyProductionCsp` 自体のシグネチャ変更 (既存 `CspGuard` interface はそのまま)
- `waitForReactHydration` の timeout override hook (現行 default 10s でカバー済、必要になったら拡張)
- ulid-generator E2E 追加 (PR 5 スコープ。本 PR は「PR 5 が薄くなる土台」のみ提供し、`#262` close は PR 5)

---

## なぜ独立 PR か

| 観点                         | 説明                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **infra/feature 分離原則**   | testing infra は feature work と別 PR で先行導入、bundle 禁止 (memory `feedback_infra_feature_separation.md`)。VRT 導入 PR `#254` と同じ運用。                     |
| **PR 5 の review unit 圧縮** | PR 5 (`QrReader` + `ConfigConverter` + `JanCode` + `QrCode` + `UlidGenerator` + `ulid-generator.spec.ts` 新設) は本 PR を取り込めば boilerplate 増殖を回避できる。 |
| **review 観点の単純化**      | 本 PR は「ラッパ抽象が破綻していないか」「meta-test が依然として陽性反応するか」のみを問われる小さい diff。混入機能の挙動疑義から切り離せる。                      |
| **race 回避運用の継続検証**  | PR 4 で初採用した「subagent は commit せず親が Phase 1.5 で順次 commit」方式を継承し、運用が安定運用に乗ったかを再確認。                                           |

---

## 採用する設計

### 1. `withProductionCsp` のシグネチャ

`tests/e2e/helpers.ts` に追加:

````ts
import type { Browser, Page } from '@playwright/test';

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
 * メタテストは `guard.violations.length` を fn 内で待ち合わせる必要があり、
 * ラッパが終端で `assertNoViolations()` を呼ぶ設計と整合しない (違反を期待
 * するテストなのに「違反 0」を assert してしまう)。これらは inline pattern
 * を維持する (本 PR で言うと `applyProductionCsp は実際に CSP 違反を捕捉する`
 * テスト 2 件)。
 *
 * **`fn` への引数**: 通常テストでは `page` のみ使う。`guard` は fn 内で
 * 違反件数を観測したい高度な用途のために第 2 引数として露出するが、終端
 * の `assertNoViolations()` 呼び出しはラッパが行うため、利用側で再度呼ぶ
 * 必要はない。
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

設計上の確認事項:

- **fn throw 時の挙動**: `fn` が例外を投げると `assertNoViolations` は呼ばれず、`finally` で `context.close()` のみ実行される。元の例外が伝播しテストが失敗する。これは inline pattern と等価な振る舞い (元の実装も `fn` が throw すれば try ブロック途中で抜け、`assertNoViolations` は到達しない)。
- **`waitFor(label)` の扱い**: PR 3 inline では `goto → waitFor(label) → waitForReactHydration` の順で書かれていたが、`waitForReactHydration` は input/textarea/button のいずれかに `__react*` キーが付くまで待つため、特定 label の DOM 出現と論理的に等価。ラッパでは `waitForReactHydration` のみ呼び出し、label 固有の存在確認が必要なら fn 内で行う方針 (本 PR の対象 6 件は label 確認なしで成立することを実行確認する)。
- **`disposed` 不要**: `context.close()` で route / listener も自動破棄されるため、明示的な `guard.dispose()` は不要 (現 inline pattern も呼んでいない)。

### 2. `tests/e2e/uuid-v7.spec.ts` の書換 (5 件)

各 test の構造:

```ts
// Before (例: line 5-33)
test('UUIDをデフォルト（10件）生成できる（CSP 違反なし）', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const guard = await applyProductionCsp(page);
    await page.goto('/tools/uuid-v7');
    await page.getByLabel('生成数').waitFor();
    await waitForReactHydration(page);

    await page.getByRole('button', { name: '生成' }).click();
    // ... assertions ...

    guard.assertNoViolations();
  } finally {
    await context.close();
  }
});

// After
test('UUIDをデフォルト（10件）生成できる（CSP 違反なし）', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/uuid-v7', async (page) => {
    await page.getByRole('button', { name: '生成' }).click();
    // ... assertions ...
  });
});
```

書換対象 (line 番号は現状):

| #   | テスト名                                                             | line 範囲 |
| --- | -------------------------------------------------------------------- | --------- |
| 1   | `UUIDをデフォルト（10件）生成できる（CSP 違反なし）`                 | 5-33      |
| 2   | `UUIDを複数件一括生成できる（CSP 違反なし）`                         | 35-56     |
| 3   | `クォートスタイルを切り替えられる（CSP 違反なし）`                   | 58-114    |
| 4   | `行をクリックするとフィールド分解パネルが表示される（CSP 違反なし）` | 116-141   |
| 5   | `クリアボタンでリストをリセットできる（CSP 違反なし）`               | 143-168   |

inline 維持 (1 件):

- `applyProductionCsp は実際に CSP 違反を捕捉する（ゲート自体の動作確認）` (line 171-203) — `guard.violations.length` を fn 内で polling するため withProductionCsp の終端 assert と整合しない。コメント追記は不要 (helper の JSDoc に「メタテストは inline 維持」を明記済)

import 行 (line 2): `applyProductionCsp` は陽性対照テスト 1 件で依然必要なので残す。`waitForReactHydration` は通常テスト 5 件すべてで使われなくなるが陽性対照内で使われるか要確認 → 使われていない (line 187-192 は goto 後に直接 evaluate)。よって `waitForReactHydration` import は **削除**、`withProductionCsp` を追加。最終 import:

```ts
import { applyProductionCsp, withProductionCsp } from './helpers';
```

### 3. `tests/e2e/config-converter.spec.ts` の書換 (1 件)

書換対象:

| #   | テスト名                                                                                    | line 範囲 |
| --- | ------------------------------------------------------------------------------------------- | --------- |
| 1   | `JSON Schema 検証パネル: 本番相当 CSP 下でも検証が成功し違反が出ない（リグレッション防止）` | 194-240   |

inline 維持 (1 件):

- `applyProductionCsp は実際に CSP 違反を捕捉する（ゲート自体の動作確認）` (line 242-275)

`waitForReactHydration` import の扱い: 通常テスト群 (line 4-192) の `beforeEach` (line 5-10) で `waitForReactHydration(page)` を呼んでいるため import 削除不可。よって最終 import:

```ts
import { applyProductionCsp, waitForReactHydration, withProductionCsp } from './helpers';
```

書換例:

```ts
// Before (line 194-240)
test('JSON Schema 検証パネル: 本番相当 CSP 下でも検証が成功し違反が出ない（リグレッション防止）', async ({
  browser,
}) => {
  // 過去に Ajv (...) の事故を防ぐコメント (保持)
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const guard = await applyProductionCsp(page);
    await page.goto('/tools/config-converter');
    await page.getByLabel('JSON').waitFor();
    await waitForReactHydration(page);

    await page
      .getByRole('group', { name: '変換先フォーマット' })
      .getByRole('button', { name: 'JSON' })
      .click();
    // ... 略 ...
    await expect(page.getByText('スキーマ検証成功')).toBeVisible();
    guard.assertNoViolations();
  } finally {
    await context.close();
  }
});

// After
test('JSON Schema 検証パネル: 本番相当 CSP 下でも検証が成功し違反が出ない（リグレッション防止）', async ({
  browser,
}) => {
  // 過去に Ajv (...) の事故を防ぐコメント (保持)
  await withProductionCsp(browser, '/tools/config-converter', async (page) => {
    await page
      .getByRole('group', { name: '変換先フォーマット' })
      .getByRole('button', { name: 'JSON' })
      .click();
    // ... 略 ...
    await expect(page.getByText('スキーマ検証成功')).toBeVisible();
  });
});
```

説明コメント (line 195-208) は `withProductionCsp` 採用後も意義が残るため残置。ただし「`browser.newContext()` で完全に新規のコンテキストを作る」記述は helper の JSDoc に移っているため簡素化可能 (本コメントは保持しつつ、boilerplate の理由付け部分のみコンパクト化)。

### 4. ファイル変更一覧

| ファイル                                     | 変更内容                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tests/e2e/helpers.ts`                       | `withProductionCsp` を新規 export 追加 (約 30 行 + JSDoc)                                                                        |
| `tests/e2e/uuid-v7.spec.ts`                  | 通常 5 件を `withProductionCsp` 利用形に書換、`waitForReactHydration` import 削除、`withProductionCsp` import 追加               |
| `tests/e2e/config-converter.spec.ts`         | 通常 1 件を `withProductionCsp` 利用形に書換、`withProductionCsp` import 追加 (`waitForReactHydration` は beforeEach で使用継続) |
| `docs/projects/issue-176-b-plan-progress.md` | `#276` 行を「✅ closed (PR #XXX で対応)」に更新、PR 5 前段 infra PR 完了の旨を追記                                               |

---

## 実装フロー (subagent 並列分担)

### Phase 1 (親 Opus、sequential)

1. feature ブランチ作成: `git checkout -b feature/issue-276-with-production-csp-helper origin/develop`
2. `tests/e2e/helpers.ts` に `withProductionCsp` を追加 (JSDoc 含む)
3. astro check で型エラーがないことを確認
4. Phase 1 commit (subagent 起動前):
   ```
   feat(test): #276 withProductionCsp ラッパを追加
   ```

### Phase 1.5 (sonnet 並列、subagent は commit しない)

並列 dispatch 候補 (disjoint files、`isolation: "worktree"` 不要、helper 追加済み helpers.ts を read 参照):

- **Subagent A (sonnet)**: `tests/e2e/uuid-v7.spec.ts` の通常 5 件を書換、import 整理
- **Subagent B (sonnet)**: `tests/e2e/config-converter.spec.ts` の通常 1 件を書換、import 整理

各 subagent は:

- `npx prettier --check tests/e2e/<file>` 自走で format 整合確認
- 自身の担当ファイルのみ編集、commit/push は禁止
- 完了報告に「変更行 line 範囲」「import 整形結果」「prettier pass 状況」を含める

### Phase 1.6 (親 Opus、sequential)

1. 各 subagent 完了後、git diff で実改変を確認 (memory `feedback_subagent_verification_trust.md`)
2. 順次 commit:
   - `refactor(test): #276 uuid-v7.spec.ts を withProductionCsp に集約`
   - `refactor(test): #276 config-converter.spec.ts を withProductionCsp に集約`
3. `npm run test:e2e` をローカル実行 (memory `feedback_e2e_before_pr.md`)。特に確認すべき:
   - `chromium > UUID v7 生成（production CSP 適用）` 全 6 件 pass (5 件は新ラッパ、1 件は inline 陽性対照)
   - `chromium > 設定ファイル相互変換 > applyProductionCsp は実際に CSP 違反を捕捉する` (陽性対照) 依然 pass = ゲート空回りなし
   - `chromium > 設定ファイル相互変換 > JSON Schema 検証パネル: 本番相当 CSP 下でも...` 新ラッパ経由でも pass
4. `docs/projects/issue-176-b-plan-progress.md` の `#276` 行を更新する commit

### Phase 2 (PR 作成、親 Opus)

1. push: `git push -u origin feature/issue-276-with-production-csp-helper`
2. PR 作成 (memory `feedback_commander_checklist.md`、`docs/playbooks/pr-creation.md`):
   - `--base develop` 明示
   - `--body-file /tmp/claude/pr_body.md`
   - 本文: 「PR 5 着手前の独立 infra PR、ulid-generator 追加時の boilerplate 増殖を防ぐ」「メタテスト 2 件は inline 維持」「変更ファイル 4 個 (helpers / 2 spec / progress doc)」
   - 関連 issue link: `#276` (close), `#275` (起源), `#262` (PR 5 で close、本 PR は前段)
3. push 前確認: develop ベース一致 / aria 削除なし (本 PR は test only なので aria は対象外だが check 実施)

---

## risk / 関連メモ

| risk                                                                        | 対策                                                                                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `waitFor(label)` を削除したことで hydration timing 起因の flake が出る      | `waitForReactHydration` の `__react*` キー存在チェックで実質カバー。万一 flake したら fn 冒頭に `waitFor(label)` 追加               |
| 陽性対照メタテストが silently pass し続けるが実は ゲート空回り              | 本 PR は陽性対照 2 件を改変しないため、PR 3 で確認済みの violation 検知能力は無傷 (memory `feedback_positive_control_for_gates.md`) |
| 通常テストで `guard` を fn 内で参照する書換漏れ                             | コードレビュー + `npm run test:e2e` で違反 0 を実機確認                                                                             |
| subagent が commit してしまい race 発生 (PR 3 反省)                         | subagent prompt に「commit/push 禁止」を明示 (memory `feedback_commander_checklist.md`、`feedback_subagent_workflow.md`)            |
| `applyProductionCsp` import の取りこぼし (uuid-v7.spec.ts は陽性対照で必要) | spec §2 で明示。subagent A の prompt にも import を残す旨を含める                                                                   |

memory 参照:

- `project_b_plan_progress.md` (pointer; SoT は repo `docs/projects/issue-176-b-plan-progress.md`)
- `feedback_infra_feature_separation.md`
- `feedback_subagent_verification_trust.md`
- `feedback_subagent_workflow.md`
- `feedback_subagent_model.md`
- `feedback_commander_checklist.md`
- `feedback_e2e_before_pr.md`
- `feedback_positive_control_for_gates.md`
- `feedback_pr_size.md`
- `feedback_heredoc_no_escape.md`

---

## 進捗追跡更新

PR merge 後、`docs/projects/issue-176-b-plan-progress.md` の `#276` 行を「✅ closed (PR #XXX)」に更新する commit を本 PR 内に含める (本 PR の最終 commit)。`PR 6 必須チェックリスト` セクションの `#276` 言及も同時に「✅ closed」マークに更新。
