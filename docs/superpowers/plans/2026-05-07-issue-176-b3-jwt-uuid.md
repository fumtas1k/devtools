# #176 B 案 PR 3 実装計画書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**: `JwtDecoder.tsx` (21 件) + `UuidV7Generator.tsx` (20 件) の inline style 撤去と #262 partial 対応 (`tests/e2e/uuid-v7.spec.ts` への applyProductionCsp gate 追加) を独立 PR として完了する。

**Architecture**: PR 1 / 1.5 / 2 で確立した「`@layer components` への意味クラス追加 + Tailwind utility」pattern を継承。Phase 0 (親 Opus) で foundation commit、Phase 1 で sonnet subagent 2 並列 (Track A: JwtDecoder / Track B: UuidV7Generator + uuid-v7 E2E)、Phase 2 で親 Opus が MIGRATED_FILES 追加 + 検証 + PR 作成。

**Tech Stack**: TypeScript / React 19 / Astro 5 / Tailwind CSS 4 / Vitest / Playwright

**作成日**: 2026-05-07
**Spec**: `docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md`
**ブランチ**: `feature/issue-176-b3-jwt-uuid`
**Worktree**: `.claude/worktrees/issue-176-b3`
**Base**: `origin/develop` (26a8c67 — `#274` merged 後)

---

## 進行モデル

`feedback_subagent_model.md` / `feedback_subagent_workflow.md` / `feedback_subagent_verification_trust.md` 準拠。

| Phase | 担当                  | 内容                                                                                  |
| ----- | --------------------- | ------------------------------------------------------------------------------------- |
| 0     | 親 Opus               | spec / plan 作成、worktree 作成、global.css foundation commit                         |
| 1     | sonnet 並列 (2 track) | Track A (JwtDecoder) / Track B (UuidV7Generator + uuid-v7 E2E) の実装                 |
| 2     | 親 Opus               | `MIGRATED_FILES` 追加、ローカル必須ゲート 3 件直接実行、aria diff 確認、push、PR 作成 |
| 3     | 親 Opus + reviewer    | review サイクル（review 中は push 控える）                                            |

---

## File Structure

| File                                                 | Phase | 担当    | 変更内容                                                        |
| ---------------------------------------------------- | ----- | ------- | --------------------------------------------------------------- |
| `docs/superpowers/specs/2026-05-07-...-design.md`    | 0     | 親 Opus | spec をブランチ最初の commit として配置                         |
| `docs/superpowers/plans/2026-05-07-...-jwt-uuid.md`  | 0     | 親 Opus | plan を spec と同 commit で配置                                 |
| `src/styles/global.css`                              | 0     | 親 Opus | `@layer components` に PR 3 用 class 17 件追記                  |
| `src/components/tools/JwtDecoder.tsx`                | 1     | Track A | inline style 21 件除去 + Section variant 化 + import 整理       |
| `src/components/tools/UuidV7Generator.tsx`           | 1     | Track B | inline style 20 件除去 + FIELD_CLASSES 化 + import 整理         |
| `tests/e2e/uuid-v7.spec.ts`                          | 1     | Track B | applyProductionCsp gate 全 test 適用 + 陽性対照 1 件追加 (#262) |
| `src/utils/__tests__/inline-style-migration.test.ts` | 2     | 親 Opus | `MIGRATED_FILES` array に 2 件追加                              |

**触らない**:

- `src/components/tools/__tests__/JwtDecoder.test.ts` (logic test のみで Section の DOM レンダリング非依存)
- `src/utils/styles.ts` (PR 6 で削除、本 PR では import 削除のみ)
- `src/utils/csp.ts` / `public/_headers` (PR 6 でstrict 化)

---

## Phase 0 — 親 Opus 直接実行

### Task 0.1: Worktree 作成

- [ ] **Step 1**: 現在のブランチが `develop` で clean state であることを確認

```bash
git status
git branch --show-current
# Expected: clean / develop
```

- [ ] **Step 2**: worktree を作成（`origin/develop` ベースを **明示**、memory `feedback_worktree_base_branch.md`）

```bash
git worktree add .claude/worktrees/issue-176-b3 origin/develop -b feature/issue-176-b3-jwt-uuid
```

- [ ] **Step 3**: worktree で `npm ci` 実行（subagent の test 実行に必要、SessionStart hook で自動実行されるが念のため確認）

```bash
cd .claude/worktrees/issue-176-b3 && npm ci
```

Expected: `node_modules` が worktree に存在し vitest / playwright が解決可能。

### Task 0.2: spec / plan ファイル配置

- [ ] **Step 1**: develop 側で書いた spec / plan を worktree にコピー

```bash
cp docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md \
   .claude/worktrees/issue-176-b3/docs/superpowers/specs/
cp docs/superpowers/plans/2026-05-07-issue-176-b3-jwt-uuid.md \
   .claude/worktrees/issue-176-b3/docs/superpowers/plans/
```

- [ ] **Step 2**: develop 側の untracked spec / plan を削除（worktree のみで保持）

```bash
rm docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md
rm docs/superpowers/plans/2026-05-07-issue-176-b3-jwt-uuid.md
```

### Task 0.3: global.css に @layer components 追記

worktree で作業（以下すべて `.claude/worktrees/issue-176-b3` 内）。

- [ ] **Step 1**: `src/styles/global.css` の末尾 `@layer components { ... }` ブロックの閉じ `}` の **直前** に下記を追記（spec §4 と完全一致）

```css
/* === PR 3: JwtDecoder + UuidV7Generator migration helpers === */

/* JwtDecoder: Section accent borders */
.section-jwt-header {
  border-left: 4px solid var(--color-error);
}
.section-jwt-payload {
  border-left: 4px solid #9333ea;
}
.section-jwt-signature {
  border-left: 4px solid var(--color-primary);
}

/* JwtDecoder: JSON syntax colors (not UI tokens, kept local) */
.jwt-json-key {
  color: var(--color-link);
}
.jwt-json-value {
  color: #6e4f0e;
}

/* JwtDecoder: <pre> (decoded JSON) typography */
.jwt-pre {
  font-size: 0.75rem;
  line-height: 1.33;
  letter-spacing: -0.12px;
}

/* Checkbox accent (link color) */
.accent-link {
  accent-color: var(--color-link);
}

/* Warning semantic palette (expBadge no-exp 用) */
.text-warning {
  color: var(--color-warning);
}
.bg-warning-tint {
  background: var(--color-warning-bg);
}

/* UuidV7Generator: 5 field colors (UUID hex parts) */
.uuid-field-ts {
  color: var(--color-primary);
}
.uuid-field-ver {
  color: #7c3aed;
}
.uuid-field-rand-a {
  color: #059669;
}
.uuid-field-var {
  color: #d97706;
}
.uuid-field-rand-b {
  color: #0891b2;
}

/* UuidV7Generator: field key label typography (caption の font-size override) */
.uuid-field-key {
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.7;
  letter-spacing: 0.02em;
}
.uuid-field-bits {
  font-size: 0.7rem;
  opacity: 0.7;
}
```

**重要**: `.uuid-field-key` は `.caption` の **後** に定義すること（CSS source 順位で `.caption` の font-size 0.875rem を 0.75rem に override するため）。同 `@layer components` 内なら specificity 同等のため source 順位が有効。

- [ ] **Step 2**: 既存 commit の class と重複していないか確認

```bash
grep -n "section-jwt-header\|jwt-json-key\|accent-link\|text-warning\|bg-warning-tint\|uuid-field-" src/styles/global.css | head -20
# Expected: 各 class が 1 件ずつ（重複なし）
```

- [ ] **Step 3**: vitest 一部実行で global.css 読み込みが壊れていないか確認

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts
# Expected: 既存 16 ファイルの migration test pass
```

### Task 0.4: Phase 0 commit

- [ ] **Step 1**: stage + commit

```bash
git add docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md \
        docs/superpowers/plans/2026-05-07-issue-176-b3-jwt-uuid.md \
        src/styles/global.css

git commit -m "$(cat <<'EOF'
chore(spec): #176 B 案 PR 3 spec / plan / global.css foundation

Phase 0: spec / plan 配置 + global.css @layer components に
JwtDecoder + UuidV7Generator migration 用 class 17 件を追加。

追加 class:
- section-jwt-{header,payload,signature}
- jwt-json-{key,value}
- jwt-pre / accent-link
- text-warning / bg-warning-tint
- uuid-field-{ts,ver,rand-a,var,rand-b}
- uuid-field-{key,bits}

Phase 1 (sonnet 並列) で JwtDecoder / UuidV7Generator + uuid-v7 E2E
の migration を進める。

ref: docs/projects/issue-176-b-plan-progress.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2**: 確認

```bash
git log --oneline -1
git status
# Expected: 1 件の commit、clean state
```

---

## Phase 1 — 並列 sonnet subagent dispatch

**重要**: Track A / Track B は **完全に独立** したファイルを触る（cross-file dependency なし）。並列 dispatch して OK。

### Track A: `JwtDecoder.tsx` migration（21 styles）

- [ ] **Step 1**: subagent prompt 作成（下記 §Subagent prompt template 参照）
- [ ] **Step 2**: Agent dispatch (`model: "sonnet"`)
- [ ] **Step 3**: 完了報告受領後、親 Opus が `git diff --name-only HEAD~1..HEAD` で変更範囲確認

**Track A 完了基準**:

- [ ] `src/components/tools/JwtDecoder.tsx` の `style={{` ヒット 0、`element.style.X = Y` 形式 0
- [ ] `import { ... } from '@/utils/styles'` 削除（残 import なし）
- [ ] `Section` component が `variant: 'header' | 'payload' | 'signature'` prop に変更
- [ ] `expBadge` / `sigBadge` の `style: CSSProperties` が `badgeClass: string` に変更
- [ ] commit 1 件: `refactor(tools): #176 B 案 PR 3 — JwtDecoder.tsx inline style 撤去`
- [ ] subagent 自己検証: `npm run test -- src/components/tools/__tests__/JwtDecoder.test.ts` pass + `npx astro check` 0 errors

### Track B: `UuidV7Generator.tsx` migration（20 styles）+ `tests/e2e/uuid-v7.spec.ts` (#262 partial)

- [ ] **Step 1**: subagent prompt 作成（下記 §Subagent prompt template 参照）
- [ ] **Step 2**: Agent dispatch (`model: "sonnet"`)
- [ ] **Step 3**: 完了報告受領後、親 Opus が `git diff --name-only HEAD~2..HEAD` で変更範囲確認

**Track B 完了基準**:

- [ ] `src/components/tools/UuidV7Generator.tsx` の `style={{` ヒット 0、`element.style.X = Y` 形式 0
- [ ] `import { ... } from '@/utils/styles'` 削除
- [ ] `FIELD_COLORS` const → `FIELD_CLASSES` const へ refactor
- [ ] `tests/e2e/uuid-v7.spec.ts` の全 test が `browser.newContext()` pattern で `applyProductionCsp(page)` を使用
- [ ] 陽性対照 1 件追加 (script-src 違反による gate 動作確認)
- [ ] commit 2 件:
  - `refactor(tools): #176 B 案 PR 3 — UuidV7Generator.tsx inline style 撤去`
  - `test(e2e): #176 B 案 PR 3 — uuid-v7 spec に applyProductionCsp gate 追加 (#262 partial)`
- [ ] subagent 自己検証: `npm run test -- src/utils/__tests__/uuid-v7.test.ts` pass + `npx astro check` 0 errors

**Track B の順序制約**: UuidV7Generator.tsx の inline style 撤去を **先** に commit してから uuid-v7.spec.ts の gate 追加を commit する（gate を先に入れて migration が後だと CSP 違反で fail する可能性、spec §10 R3）。

---

## Phase 2 — 親 Opus 直接実行（統合 + 検証 + PR）

### Task 2.1: Phase 1 完了確認

- [ ] **Step 1**: subagent 完了報告 2 件を受領
- [ ] **Step 2**: 想定外ファイル変更が無いことを確認

```bash
git diff origin/develop --name-only | sort
# Expected:
# docs/superpowers/plans/2026-05-07-issue-176-b3-jwt-uuid.md
# docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md
# src/components/tools/JwtDecoder.tsx
# src/components/tools/UuidV7Generator.tsx
# src/styles/global.css
# tests/e2e/uuid-v7.spec.ts
```

- [ ] **Step 3**: 各対象ファイルの inline style 残存ゼロ確認

```bash
grep -c "style={{" src/components/tools/JwtDecoder.tsx
grep -c "style={{" src/components/tools/UuidV7Generator.tsx
# Expected: 0 / 0
```

### Task 2.2: MIGRATED_FILES 追加

- [ ] **Step 1**: `src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array に 2 件追加

`'src/components/tools/qr-ticket/TicketDetail.tsx',` の **後** に下記を追加:

```ts
  // PR 3 で追加
  'src/components/tools/JwtDecoder.tsx',
  'src/components/tools/UuidV7Generator.tsx',
```

- [ ] **Step 2**: migration test pass 確認

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts
# Expected: 18 ファイルの migration test 全 pass + 陽性対照 3 件 pass
```

- [ ] **Step 3**: commit

```bash
git add src/utils/__tests__/inline-style-migration.test.ts
git commit -m "$(cat <<'EOF'
test(migration): MIGRATED_FILES に PR 3 対象 2 件追加

JwtDecoder.tsx / UuidV7Generator.tsx の inline style 撤去完了に
伴い progressive migration tracker に追加。

ref: docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md §5

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 2.3: ローカル必須ゲート（subagent 報告は信頼せず親が直接実行、`feedback_subagent_verification_trust.md`）

- [ ] **Step 1**: vitest 全 pass

```bash
npm run test
# Expected: 全 unit test pass、migration test 18 件 pass、陽性対照 3 件 pass
```

- [ ] **Step 2**: TypeScript 型チェック

```bash
npx astro check
# Expected: 0 errors
```

- [ ] **Step 3**: E2E 全 pass（`feedback_e2e_before_pr.md`、PR 作成前必須）

```bash
npm run test:e2e
# Expected: jwt-decoder.spec.ts / uuid-v7.spec.ts (CSP gate 含む 陽性対照含む) 全 pass
```

E2E は build + preview を直列起動するため数分かかる。フォアグラウンドで実行して全 pass を確認する。

### Task 2.4: a11y 退化検知（`feedback_commander_checklist.md`）

- [ ] **Step 1**: aria-\* 削除行が無いこと

```bash
git diff origin/develop -- src/components/tools/JwtDecoder.tsx src/components/tools/UuidV7Generator.tsx \
  | grep -E '^-.*aria-' | grep -vE '^---|^\+\+\+'
# Expected: 出力 0 行
```

- [ ] **Step 2**: role / data-testid 削除行が無いこと

```bash
git diff origin/develop -- src/components/tools/JwtDecoder.tsx src/components/tools/UuidV7Generator.tsx \
  | grep -E '^-.*(role=|data-testid=)' | grep -vE '^---|^\+\+\+'
# Expected: 出力 0 行
```

- [ ] **Step 3**: `htmlFor` / `<label>` 構造が維持されていること（目視）

```bash
git diff origin/develop -- src/components/tools/JwtDecoder.tsx src/components/tools/UuidV7Generator.tsx \
  | grep -E '^[+-].*htmlFor='
# 削除のみがあれば NG (label 構造の意図しない変更)
```

### Task 2.5: PR 作成前 final check (`docs/playbooks/pr-creation.md` 4 点)

- [ ] **Step 1**: develop ベース一致確認

```bash
[ "$(git rev-parse origin/develop)" = "$(git merge-base HEAD origin/develop)" ] && echo OK
# Expected: OK
```

- [ ] **Step 2**: `_headers` / `astro.config.mjs` / `src/utils/styles.ts` を **触っていない** こと（PR 6 スコープ）

```bash
git diff origin/develop --name-only | grep -E "_headers|astro.config|src/utils/styles\.ts"
# Expected: 出力 0 行
```

### Task 2.6: push + PR 作成

- [ ] **Step 1**: PR 本文を `/tmp/claude/pr_body_b3.md` に書き出し

```bash
mkdir -p /tmp/claude
cat > /tmp/claude/pr_body_b3.md <<'EOF'
## 概要

`#176` B 案バッチの PR 3。`JwtDecoder.tsx` (21 件) と `UuidV7Generator.tsx` (20 件) の JSX inline style を `@layer components` の意味クラス + Tailwind utility に置換し、同時に `tests/e2e/uuid-v7.spec.ts` に `applyProductionCsp(page)` E2E gate を挿入して issue #262 の uuid-v7 部分を partial 対応する。

- spec: `docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md`
- plan: `docs/superpowers/plans/2026-05-07-issue-176-b3-jwt-uuid.md`
- バッチ進捗: `docs/projects/issue-176-b-plan-progress.md`

## 主要な変更

### `src/styles/global.css` 追加 class (17 件)

- JwtDecoder 用: `.section-jwt-{header,payload,signature}` / `.jwt-json-{key,value}` / `.jwt-pre` / `.accent-link`
- UuidV7Generator 用: `.uuid-field-{ts,ver,rand-a,var,rand-b}` / `.uuid-field-{key,bits}`
- 汎用 (PR 4-5 で再利用見込): `.text-warning` / `.bg-warning-tint`

### `JwtDecoder.tsx` (21 件 → 0)

- `Section` component の `accentColor` prop を `variant: 'header' | 'payload' | 'signature'` の discriminated union に変更
- `expBadge` / `sigBadge` の `style: CSSProperties` を `badgeClass: string` に変更
- `<pre>` typography (`font-size: 0.75rem; line-height: 1.33; letter-spacing: -0.12px`) を `.jwt-pre` に集約
- checkbox の `accentColor` を `.accent-link` class に置換
- `import { bodyEmphasis, caption, colors } from '@/utils/styles'` を削除

### `UuidV7Generator.tsx` (20 件 → 0)

- `FIELD_COLORS` const を `FIELD_CLASSES` const に refactor
- `ColoredUuid` / `FieldBreakdownPanel` で動的色を class 切替で表現
- `import { bodyEmphasis, caption, colors } from '@/utils/styles'` を削除

### `tests/e2e/uuid-v7.spec.ts` への applyProductionCsp gate (#262 partial)

- 全 test を `browser.newContext()` pattern に変更し `applyProductionCsp(page)` を `goto` 前に挿入
- 陽性対照 1 件追加 (script-src 違反で gate 動作確認、`config-converter.spec.ts` 既存 pattern 踏襲)
- ulid-generator 部分は PR 5 で対応して #262 close 予定

## 検証

- [x] `npm run test` 全 pass (migration test 18 件 + 陽性対照 3 件含む)
- [x] `npx astro check` 0 errors
- [x] `npm run test:e2e` 全 pass (uuid-v7 CSP gate + 陽性対照含む)
- [x] a11y 退化なし (`aria-*` / `role=` / `data-testid=` 削除行 0)
- [x] inline style 残存ゼロ (`grep -c "style={{"` = 0 for both files)

## VRT

`visual-regression.yml` で baseline 比較 (non-required check)。意図的差分があれば PR ブランチで `update-visual-baseline.yml` を `workflow_dispatch` trigger。

## 関連

- 起源 issue: #176 (アプローチ B)
- 部分対応 issue: #262 (uuid-v7 部分のみ、ulid-generator は PR 5 へ)
- 前提 PR: #249 (A-1) / #254 (VRT) / #256 (PR 1) / #261 (PR 1.5) / #272 (PR 2)
- 後続: PR 4 (Gs1Databar + EncodingConverter + DummyText) / PR 5 (QrReader + 残り tools + #262 close) / PR 6 (flip + cleanup)
EOF
```

- [ ] **Step 2**: push

```bash
git push -u origin feature/issue-176-b3-jwt-uuid
```

- [ ] **Step 3**: PR 作成（`--base develop` を **必ず** 明示、`--body-file` で本文渡し）

```bash
gh pr create --base develop \
  --title "refactor(ui,tools): #176 B 案 PR 3 — JwtDecoder + UuidV7Generator inline style 撤去 + #262 partial" \
  --body-file /tmp/claude/pr_body_b3.md
```

Expected: PR URL を user に提示。

---

## Phase 3 — review サイクル

- [ ] **Step 1**: PR 作成後は **自発的な修正 push を控える** (memory `feedback_hold_push_during_review.md`)
- [ ] **Step 2**: CI green + reviewer LGTM 後に user に merge を依頼
- [ ] **Step 3**: merge 後に `docs/projects/issue-176-b-plan-progress.md` の進捗テーブル更新（PR 3 を ✅ merged に）→ chore PR
- [ ] **Step 4**: worktree 削除順序（memory `feedback_worktree_merge_order.md`）

```bash
# 順序: gh pr merge --delete-branch の **前** に worktree remove
git worktree remove .claude/worktrees/issue-176-b3
git branch -D feature/issue-176-b3-jwt-uuid  # ローカルにブランチ参照が残れば削除
```

---

## Subagent prompt template

各 subagent には以下要素を **必ず** 含める:

1. **作業ディレクトリ**: `/Users/fumta/projects/devtools/.claude/worktrees/issue-176-b3`
2. **担当ファイル list**（変更可能なもの／触ってはいけないもの）
3. **spec 該当 section の reference** (`docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md` § N.M)
4. **global.css の新規 class 一覧**（Phase 0 で commit 済、§4 参照）
5. **自己検証コマンド**: `npm run test -- <該当 test path>` + `npx astro check`
6. **やってはいけないこと**:
   - `git push`（親が実行）
   - `gh pr create`（親が実行）
   - `npm run test:vrt` 実行（memory `feedback_vrt_ci_only.md`、ローカル baseline 不在）
   - 他 Track のファイル変更
   - `src/utils/styles.ts` の削除（PR 6 スコープ）
   - `src/styles/global.css` の編集（Phase 0 で foundation commit 済、追加 class 不要）
7. **完了報告フォーマット**:
   - 変更ファイル list (`git diff --name-only HEAD~N..HEAD`)
   - commit list (`git log --oneline HEAD~N..HEAD`)
   - 自己検証結果 (vitest / astro check の出力要約)
   - 残課題（あれば）

### Track A subagent prompt 骨子

```
作業ディレクトリ: /Users/fumta/projects/devtools/.claude/worktrees/issue-176-b3

タスク: src/components/tools/JwtDecoder.tsx の inline style を spec §1 に従い撤去する。

参照:
- spec: docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md (特に §1.1〜1.7)
- 既存パターン: src/components/tools/qr-ticket/VerifyTab.tsx (PR 2 で migrate 済、参考)
- global.css: PR 3 用 class は §4 で commit 済 (HEAD~1)

変更可能なファイル:
- src/components/tools/JwtDecoder.tsx (本体)

触ってはいけないファイル:
- src/components/tools/__tests__/JwtDecoder.test.ts (logic test、Section DOM 非依存のため astro check で型互換確認のみ)
- src/utils/styles.ts (PR 6 スコープ)
- src/styles/global.css (Phase 0 commit 済)
- src/components/tools/UuidV7Generator.tsx (Track B)
- tests/e2e/* (Track B)

完了基準:
- grep -c "style={{" src/components/tools/JwtDecoder.tsx → 0
- import { bodyEmphasis, caption, colors } from '@/utils/styles' を削除
- Section component が variant: 'header' | 'payload' | 'signature' prop に変更
- 局所定数 jsonKeyColor / jsonValueColor 削除
- npm run test -- src/components/tools/__tests__/JwtDecoder.test.ts pass
- npx astro check 0 errors
- 1 件の commit を作成 (タイトル: "refactor(tools): #176 B 案 PR 3 — JwtDecoder.tsx inline style 撤去")

やってはいけないこと:
- git push / gh pr create
- npm run test:vrt
- 上記の "触ってはいけないファイル" の変更
- src/styles/global.css への class 追加 (Phase 0 で完了済、不足あれば親 Opus に報告)

完了後 報告: 変更ファイル list + commit list + 自己検証結果。
```

### Track B subagent prompt 骨子

```
作業ディレクトリ: /Users/fumta/projects/devtools/.claude/worktrees/issue-176-b3

タスク: 2 つの作業を 1 subagent で連続実行 (commit は分ける):
1. src/components/tools/UuidV7Generator.tsx の inline style 撤去 (spec §2)
2. tests/e2e/uuid-v7.spec.ts に applyProductionCsp gate を全 test 適用 + 陽性対照 1 件追加 (spec §3)

順序制約: 1 を先に commit してから 2 に進む (gate を先に入れて migration が後だと CSP 違反で fail するため)。

参照:
- spec: docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md (§2 と §3)
- 既存パターン (E2E): tests/e2e/config-converter.spec.ts line 200-275
- helper API: tests/e2e/helpers.ts (CspGuard interface line 83-87、必須 browser.newContext() 制約 line 40-60)
- global.css: PR 3 用 class は §4 で commit 済 (HEAD~1)

変更可能なファイル:
- src/components/tools/UuidV7Generator.tsx (commit 1)
- tests/e2e/uuid-v7.spec.ts (commit 2)

触ってはいけないファイル:
- src/utils/__tests__/uuid-v7.test.ts (logic test、変更不要)
- src/utils/styles.ts (PR 6 スコープ)
- src/styles/global.css (Phase 0 commit 済)
- src/components/tools/JwtDecoder.tsx (Track A)
- tests/e2e/ulid-generator.spec.ts (PR 5 スコープ、#262 残部分)

完了基準:
- grep -c "style={{" src/components/tools/UuidV7Generator.tsx → 0
- FIELD_COLORS const → FIELD_CLASSES const に refactor 済
- import { bodyEmphasis, caption, colors } from '@/utils/styles' を削除
- tests/e2e/uuid-v7.spec.ts の全 test が browser.newContext() pattern + applyProductionCsp(page)
- 陽性対照 1 件追加 (script-src 違反、config-converter.spec.ts line 242-275 と同 pattern)
- npm run test -- src/utils/__tests__/uuid-v7.test.ts pass
- npx astro check 0 errors
- 2 件の commit を作成:
  - "refactor(tools): #176 B 案 PR 3 — UuidV7Generator.tsx inline style 撤去"
  - "test(e2e): #176 B 案 PR 3 — uuid-v7 spec に applyProductionCsp gate 追加 (#262 partial)"

やってはいけないこと:
- git push / gh pr create
- npm run test:vrt
- npm run test:e2e (時間かかる、E2E 全 pass は親が Phase 2 で確認)
- 上記の "触ってはいけないファイル" の変更
- src/styles/global.css への class 追加
- 陽性対照を inline style 違反で起こす (style-src 'unsafe-inline' は PR 6 まで残存のため、必ず script-src 違反で起こす)

完了後 報告: 変更ファイル list + commit list + 自己検証結果。
```

---

## メモリ参照

- `project_b_plan_progress.md` (pointer; SoT は repo `docs/projects/issue-176-b-plan-progress.md`)
- `feedback_subagent_model.md` (sonnet 明示)
- `feedback_subagent_workflow.md` (subagent は allow リスト内 Bash のみ)
- `feedback_subagent_verification_trust.md` (親が直接検証)
- `feedback_subagent_testing.md` (E2E は親が実行)
- `feedback_commander_checklist.md` (PR 作成前チェック)
- `feedback_e2e_before_pr.md` (E2E は PR 作成前)
- `feedback_hold_push_during_review.md` (review 中は push 控える)
- `feedback_branch_workflow.md` (`--base develop` 明示)
- `feedback_pr_language.md` (PR 日本語)
- `feedback_heredoc_no_escape.md` (HEREDOC で backtick エスケープしない)
- `feedback_worktree_base_branch.md` (worktree は origin/develop -b 明示)
- `feedback_worktree_location.md` (`.claude/worktrees/<name>` または `$TMPDIR/<name>`)
- `feedback_worktree_merge_order.md` (worktree remove → branch delete の順)
- `feedback_vrt_ci_only.md` (ローカル test:vrt 走らせない)
- `feedback_followup_routing.md` (PR 後の離散タスクは issue 化)
- `feedback_prod_parity_csp.md` (本番 CSP 制約を E2E で再現)
- `feedback_positive_control_for_gates.md` (gate には陽性対照を併設)

---

## Phase 1 開始判定

Phase 0 commit 完了 + worktree の `npm ci` 完了を確認したら Phase 1 dispatch。両 Track が独立ファイルに閉じるため **同時並列 dispatch** で OK。
