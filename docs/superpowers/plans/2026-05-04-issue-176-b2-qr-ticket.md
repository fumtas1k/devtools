# #176 B 案 PR 2 実装計画書

**作成日**: 2026-05-04
**Spec**: `docs/superpowers/specs/2026-05-04-issue-176-b2-qr-ticket-design.md`
**ブランチ**: `feature/issue-176-b2-qr-ticket`
**Worktree**: `.claude/worktrees/issue-176-b2`
**Base**: `origin/develop` (45deda6 — `#270` merged 後)

---

## 進行モデル

`feedback_subagent_model.md` / `feedback_subagent_workflow.md` / `feedback_subagent_verification_trust.md` 準拠。

| Phase | 担当                  | 内容                                                                                  |
| ----- | --------------------- | ------------------------------------------------------------------------------------- |
| 0     | 親 Opus               | spec / plan 作成、worktree 作成、global.css foundation commit                         |
| 1     | sonnet 並列 (3 track) | Track A / B / C の実装（独立ファイルに閉じる範囲のみ）                                |
| 2     | 親 Opus               | `MIGRATED_FILES` 追加、ローカル必須ゲート 3 件直接実行、aria diff 確認、push、PR 作成 |

## Phase 0 — 親 Opus 直接実行（本コミット）

- [x] spec 作成 (`docs/superpowers/specs/2026-05-04-issue-176-b2-qr-ticket-design.md`)
- [x] worktree 作成 (`git worktree add .claude/worktrees/issue-176-b2 origin/develop -b feature/issue-176-b2-qr-ticket`)
- [x] worktree で `npm ci` 実行（subagent の test 実行に必要）
- [x] plan 作成（本ファイル）
- [x] `src/styles/global.css` に PR 2 用 `@layer components` 追記
  - `.text-error` / `.text-error-text` / `.text-success` / `.text-primary`
  - `.alert-success` / `.alert-error`
  - `.qr-file-picker-label` / `.qr-file-picker-label[data-enabled='true']`
  - `.badge-category`
  - `.btn-row-remove` / `.btn-row-remove:disabled`
  - `.qr-result-grid`
- [x] commit 1: `chore(spec): #176 B 案 PR 2 spec / plan / global.css foundation`

## Phase 1 — 並列 sonnet subagent dispatch

### Track A: `GenerateTab.tsx` migration（最大、27 styles）

- [ ] inline style 全除去 + import 整理（`caption` / `bodyEmphasis` / `colors` 削除）
- [ ] commit: `refactor(qr-ticket): GenerateTab.tsx inline style 撤去`
- [ ] 必要なら sub-commit に分割 (4-1: 鍵 textarea / 4-2: チケットリスト / 4-3: 生成結果)
- [ ] 自己検証: `npm run test -- src/components/tools/qr-ticket` + `npx astro check` （subagent 内で実行）

### Track B: `VerifyTab.tsx` migration（12 styles）

- [ ] inline style 全除去 + import 整理
- [ ] `hidden` HTML 属性で video / canvas の表示切替、`sr-only` で file input
- [ ] `data-enabled` 属性で file picker label の動的状態を表現
- [ ] `alert-success` / `alert-error` で検証結果ボックス
- [ ] commit: `refactor(qr-ticket): VerifyTab.tsx inline style 撤去`
- [ ] 自己検証: `npm run test -- src/components/tools/qr-ticket` + `npx astro check`

### Track C: `TicketDetail.tsx` migration + 3 hook (#225 同梱)

- [ ] `TicketDetail.tsx` inline style 撤去 + import 整理
- [ ] `useTicketKeyPair.ts` 戻り値 `useMemo` 化
- [ ] `useTicketGeneration.ts` 戻り値 `useMemo` 化
- [ ] `useTicketVerification.ts` `verify` に `AbortController` 追加
- [ ] `__tests__/useTicketVerification.test.tsx` に unmount 後 abort 陽性対照 1 件追加
- [ ] commit: `refactor(qr-ticket): TicketDetail + 3 hook (#225)`
- [ ] 自己検証: `npm run test -- src/components/tools/qr-ticket` + `npx astro check`

## Phase 2 — 親 Opus 直接実行（統合）

- [ ] subagent 完了後の差分検証（`git diff origin/develop --name-only` で想定外ファイル無し）
- [ ] `src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array に 3 件追加
  - `'src/components/tools/qr-ticket/GenerateTab.tsx'`
  - `'src/components/tools/qr-ticket/VerifyTab.tsx'`
  - `'src/components/tools/qr-ticket/TicketDetail.tsx'`
- [ ] commit: `test(migration): MIGRATED_FILES に qr-ticket 3 件追加`
- [ ] **ローカル必須ゲート (subagent 報告は信頼せず親が直接実行)**
  - [ ] `npm run test` (vitest) 全 pass、migration test pass 含む
  - [ ] `npx astro check` 0 errors
  - [ ] `npm run test:e2e` 全 spec pass
- [ ] **a11y 退化検知**
  - [ ] `git diff origin/develop -- src/components/tools/qr-ticket/ | grep -E '^-.*aria-' | grep -vE '^---|^\+\+\+'` が空
  - [ ] `git diff origin/develop -- src/components/tools/qr-ticket/ | grep -E '^-.*role=' | grep -vE '^---|^\+\+\+'` が空（role 属性削除なし）
- [ ] `git push -u origin feature/issue-176-b2-qr-ticket`
- [ ] PR 作成（`gh pr create --base develop --body-file /tmp/claude/pr_body_b2.md`）
  - タイトル: `refactor(ui): #176 B 案 PR 2 — qr-ticket inline style 撤去 + #225 useMemo/abort 対応`
  - 言語: 日本語
  - 検証ログを本文に明記

## Phase 3 — review サイクル

- [ ] PR 作成後は **自発的な修正 push を控える** (memory `feedback_hold_push_during_review.md`)
- [ ] レビュー完了後にまとめて対応
- [ ] CI green + reviewer LGTM 後に user に merge を依頼
- [ ] merge 後に `project_b_plan_progress.md` の進捗テーブル更新（PR 2 を ✅ merged に）
- [ ] worktree 削除順序: `gh pr merge --delete-branch` 前に `git worktree remove .claude/worktrees/issue-176-b2` (memory `feedback_worktree_merge_order.md`)

## Subagent 用 prompt template

各 subagent には以下要素を必ず含める:

1. 作業ディレクトリ: `/Users/fumta/projects/devtools/.claude/worktrees/issue-176-b2`
2. 担当ファイル list（変更可能なもの／触ってはいけないもの）
3. spec 該当 section の reference (`docs/superpowers/specs/2026-05-04-issue-176-b2-qr-ticket-design.md` § N.M)
4. global.css の新規 class 一覧（Phase 0 で commit 済）
5. 自己検証コマンド: `npm run test -- src/components/tools/qr-ticket` + `npx astro check`
6. **やってはいけないこと**: `git push`、PR 作成、`npm run test:vrt` 実行、他 Track のファイル変更
7. 完了報告フォーマット: 変更ファイル list + 自己検証結果 + 残課題

## メモリ参照

- `project_b_plan_progress.md` (バッチ全体 SoT)
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

## Phase 1 開始判定

Phase 0 commit 完了 + worktree の `npm ci` 完了を確認したら Phase 1 dispatch。
