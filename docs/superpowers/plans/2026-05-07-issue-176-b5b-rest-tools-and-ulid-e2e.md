# #176 B 案 PR 5b 実装計画書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**: `Base64Codec.tsx` (2 件) + `JsonCsv.tsx` (1 件 + dead import) + `JsonXml.tsx` (1 件) + `QrCode.tsx` (7 件) + `UlidGenerator.tsx` (2 件) = 計 13 件 inline style 撤去 + `QrTicket.tsx` (root) / `UrlEncoder.tsx` の zero-style 登録 + `tests/e2e/ulid-generator.spec.ts` 既存 5 件を `withProductionCsp` で包んで陽性対照メタテスト 1 件を追加 (#262 close)。

**Architecture**: PR 1〜5a で確立した「`@layer components` への意味クラス追加 + Tailwind utility」pattern を継承。**新規 class 追加ゼロ** (PR 1〜5a 資産で 100% カバー)。Phase 0 (親 Opus) で spec / plan 配置 commit、Phase 1 で sonnet subagent 3 並列、**Phase 1.5 で親 Opus が順次 commit (PR 4 / 5a で確立した運用継承)**、Phase 2 で MIGRATED_FILES + 検証 + PR 作成。

**Tech Stack**: TypeScript / React 19 / Astro 5 / Tailwind CSS 4 / Vitest / Playwright

**作成日**: 2026-05-07
**Spec**: `docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md`
**ブランチ**: `feature/issue-176-b5b-rest-tools-and-ulid-e2e`
**Worktree**: `.claude/worktrees/issue-176-b5b`
**Base**: `origin/develop` (PR 5a #283 merge 後の最新)

---

## 進行モデル

`feedback_subagent_model.md` / `feedback_subagent_workflow.md` / `feedback_subagent_verification_trust.md` 準拠。

| Phase | 担当                  | 内容                                                                                         |
| ----- | --------------------- | -------------------------------------------------------------------------------------------- |
| 0     | 親 Opus               | spec / plan 配置、worktree 作成、spec/plan commit                                            |
| 1     | sonnet 並列 (3 track) | Track A / B / C の **編集 + self-verification のみ** (commit せず)                           |
| 1.5   | 親 Opus               | Track A / B / C の変更を順次 stage + commit (race 完全回避、3 commit)                        |
| 2     | 親 Opus               | `MIGRATED_FILES` 追加 (7 件)、ローカル必須ゲート 3 件直接実行、aria diff 確認、push、PR 作成 |
| 3     | 親 Opus + reviewer    | review サイクル → merge → SoT 更新 → worktree cleanup                                        |

---

## File Structure

| File                                                 | Phase | 担当    | 変更内容                                                                       |
| ---------------------------------------------------- | ----- | ------- | ------------------------------------------------------------------------------ |
| `docs/superpowers/specs/2026-05-07-...-design.md`    | 0     | 親 Opus | spec をブランチ最初の commit として配置                                        |
| `docs/superpowers/plans/2026-05-07-...-ulid-e2e.md`  | 0     | 親 Opus | plan を spec と同 commit で配置                                                |
| `src/components/tools/Base64Codec.tsx`               | 1     | Track A | inline style 2 件除去 + import 整理                                            |
| `src/components/tools/JsonCsv.tsx`                   | 1     | Track A | inline style 1 件除去 + dead import 削除                                       |
| `src/components/tools/JsonXml.tsx`                   | 1     | Track A | inline style 1 件除去                                                          |
| `src/components/tools/QrCode.tsx`                    | 1     | Track B | inline style 7 件除去 + import 整理                                            |
| `src/components/tools/UlidGenerator.tsx`             | 1     | Track B | inline style 2 件除去 + import 整理                                            |
| `tests/e2e/ulid-generator.spec.ts`                   | 1     | Track C | 既存 5 件を `withProductionCsp` 化 + 陽性対照メタテスト 1 件追加               |
| `src/utils/__tests__/inline-style-migration.test.ts` | 2     | 親 Opus | `MIGRATED_FILES` array に 7 件追加 (5 migration + 2 zero-style、合計 31 件)    |
| `docs/projects/issue-176-b-plan-progress.md`         | 2     | 親 Opus | PR 5b 状態を current 化 + ulid-generator.spec.ts 表記訂正 (新設→既存 refactor) |

**触らない**:

- `src/components/tools/__tests__/*.test.ts` (logic test、本 PR の class 化は DOM 構造非変更)
- `src/utils/styles.ts` (PR 6 で削除、本 PR は import 削除のみ)
- `src/utils/csp.ts` / `public/_headers` (PR 6 で strict 化)
- `src/styles/global.css` (新規 class 追加なし、確認のみ)
- `tests/e2e/uuid-v7.spec.ts` (PR 3 で対応済)
- `tests/e2e/{base64,json-csv,json-xml,qr-code,qr-ticket,url-encode}.spec.ts` (#234 17 spec 横展開は別 PR)
- `src/components/tools/QrTicket.tsx` / `src/components/tools/UrlEncoder.tsx` (zero-style、コード変更不要、Phase 2 で MIGRATED_FILES のみ追加)

---

## Phase 0 — 親 Opus 直接実行

### Task 0.1: Worktree 作成

- [ ] **Step 1**: 現在のブランチが `develop` で clean state であることを確認

```bash
git status
git branch --show-current
# Expected: clean / develop
```

- [ ] **Step 2**: origin/develop の最新を fetch (PR 5a #283 merge 済確認)

```bash
git fetch origin develop
git rev-parse origin/develop HEAD
# Expected: 同じ SHA、HEAD が #283 (46abcb5) 以降
```

- [ ] **Step 3**: worktree を作成 (`origin/develop` ベースを **明示**)

```bash
git worktree add .claude/worktrees/issue-176-b5b origin/develop -b feature/issue-176-b5b-rest-tools-and-ulid-e2e
```

- [ ] **Step 4**: worktree で `npm ci` 実行 (SessionStart hook が自動実行する想定だが、手動でも確認)

```bash
cd .claude/worktrees/issue-176-b5b && npm ci
```

Expected: `node_modules` が worktree に存在し vitest / playwright が解決可能。

### Task 0.2: spec / plan ファイル配置

- [ ] **Step 1**: develop 側で書いた spec / plan を worktree にコピー

```bash
cp docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md \
   .claude/worktrees/issue-176-b5b/docs/superpowers/specs/
cp docs/superpowers/plans/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e.md \
   .claude/worktrees/issue-176-b5b/docs/superpowers/plans/
```

- [ ] **Step 2**: develop 側の untracked spec / plan を削除

```bash
rm docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md
rm docs/superpowers/plans/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e.md
```

### Task 0.3: 事前 grep 確認 (worktree 内、spec §6 の grep を実行)

worktree で作業 (以下すべて `.claude/worktrees/issue-176-b5b` 内)。

- [ ] **Step 1**: JsonCsv.tsx の dead import 確認

```bash
grep -n "caption\|colors" src/components/tools/JsonCsv.tsx
# Expected: import 文 (line 7) のみヒット (本文での使用なし = dead import 確定)
```

- [ ] **Step 2**: zero-style 登録対象に inline style がないこと

```bash
grep -n "style={{" src/components/tools/QrTicket.tsx src/components/tools/UrlEncoder.tsx
# Expected: 0 hit
```

- [ ] **Step 3**: ulid-generator URL slug 確認

```bash
grep -rn "/tools/ulid" src/pages/
# Expected: /tools/ulid-generator が正規 (ファイル名 ulid-generator.astro)
```

- [ ] **Step 4**: ulid-generator E2E spec の現状確認 (CSP gate 未適用であること)

```bash
grep -n "withProductionCsp\|applyProductionCsp" tests/e2e/ulid-generator.spec.ts
# Expected: 0 hit (本 PR で初導入)
```

- [ ] **Step 5**: 利用予定の既存 class が global.css に存在すること

```bash
grep -E "^\s*\.(caption|body-emphasis|text-default|text-muted|text-primary|bg-default|bg-subtle|border-default)" src/styles/global.css
# Expected: 各 class 1 行以上ヒット
```

- [ ] **Step 6**: UlidGenerator が CSP 違反を起こす経路を grep (E2E gate 化前確認)

```bash
grep -n "setProperty\|eval\|new Function\|dangerouslySetInnerHTML" src/components/tools/UlidGenerator.tsx
# Expected: dangerouslySetInnerHTML / eval / new Function なし
# setProperty は ResultTable consumer 経路で許容 (CSSOM API、CSP OK)
```

### Task 0.4: Phase 0 commit (spec / plan のみ)

- [ ] **Step 1**: stage + commit (PR 5a と異なり global.css 変更なし)

```bash
git add docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md \
        docs/superpowers/plans/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e.md

git commit -m "$(cat <<'EOF'
chore(spec): #176 B 案 PR 5b spec / plan 追加

Phase 0: spec / plan 配置のみ (global.css への追加なし、PR 1〜5a の class
資産で 100% カバー)。

スコープ:
- migration: Base64Codec (2) + JsonCsv (1 + dead import) + JsonXml (1)
  + QrCode (7) + UlidGenerator (2) = 計 13 inline style 撤去
- zero-style 登録: QrTicket (root) + UrlEncoder の MIGRATED_FILES 追加
- E2E gate 拡張: tests/e2e/ulid-generator.spec.ts を withProductionCsp 化
  + 陽性対照メタテスト 1 件追加 (#262 close)

進行: Phase 1 (sonnet 並列 × 3 Track) で Track A (alignItems 系小物 3
ファイル + JsonCsv dead import) / Track B (QrCode + UlidGenerator) /
Track C (ulid-generator E2E refactor) を並列実装。Race 回避のため
subagent は commit せず、Phase 1.5 で親 Opus が順次 commit する
運用 (PR 4 / 5a 継承)。

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

## Phase 1 — 並列 sonnet subagent dispatch (commit せず)

**重要**: 3 Track を **同時並列** dispatch して OK (独立ファイルに閉じる + commit しないので race 不可能)。各 subagent は ファイル編集 + self-verification のみ実施。

### Track A: `Base64Codec.tsx` + `JsonCsv.tsx` + `JsonXml.tsx` (4 件 + dead import)

- [ ] **Step 1**: subagent prompt 作成 (下記 §Subagent prompt template の Track A 参照)
- [ ] **Step 2**: Agent dispatch (`model: "sonnet"`)
- [ ] **Step 3**: 完了報告受領 (status / 変更ファイル list / self-verification 結果)

**Track A 完了基準**:

- [ ] `grep -c "style={{" src/components/tools/Base64Codec.tsx` → **0**
- [ ] `grep -c "style={{" src/components/tools/JsonCsv.tsx` → **0**
- [ ] `grep -c "style={{" src/components/tools/JsonXml.tsx` → **0**
- [ ] `grep "from '@/utils/styles'" src/components/tools/Base64Codec.tsx` → 0
- [ ] `grep "from '@/utils/styles'" src/components/tools/JsonCsv.tsx` → 0 (dead import 削除)
- [ ] JsonXml.tsx の import 文に変更なし (もとから styles import なし)
- [ ] subagent が `npm run test` (関連 unit test) で pass を確認
- [ ] subagent が `npx astro check` で 0 errors 確認
- [ ] **commit していないこと** (`git log --oneline -1` が Phase 0 commit のままであること)

### Track B: `QrCode.tsx` + `UlidGenerator.tsx` (9 件)

- [ ] **Step 1**: subagent prompt 作成 (下記 §Subagent prompt template の Track B 参照)
- [ ] **Step 2**: Agent dispatch (`model: "sonnet"`)
- [ ] **Step 3**: 完了報告受領

**Track B 完了基準**:

- [ ] `grep -c "style={{" src/components/tools/QrCode.tsx` → **0**
- [ ] `grep -c "style={{" src/components/tools/UlidGenerator.tsx` → **0**
- [ ] `grep "from '@/utils/styles'" src/components/tools/QrCode.tsx` → 0
- [ ] `grep "from '@/utils/styles'" src/components/tools/UlidGenerator.tsx` → 0
- [ ] QrCode の `data-testid="qr-code-container"` 維持
- [ ] QrCode SVG 描画コンテナが `className="w-50 h-50"` (200x200px Tailwind 標準)
- [ ] UlidGenerator の `text-primary` 適用箇所が ULID 先頭 10 文字
- [ ] subagent が astro check / 関連 test の pass 確認
- [ ] **commit していないこと**

### Track C: `tests/e2e/ulid-generator.spec.ts` CSP gate 化

- [ ] **Step 1**: subagent prompt 作成 (下記 §Subagent prompt template の Track C 参照)
- [ ] **Step 2**: Agent dispatch (`model: "sonnet"`)
- [ ] **Step 3**: 完了報告受領

**Track C 完了基準**:

- [ ] `tests/e2e/ulid-generator.spec.ts` の describe 名が「ULID生成（production CSP 適用）」
- [ ] 既存 5 件すべてが `withProductionCsp(browser, '/tools/ulid-generator', async (page) => {...})` で包まれている
- [ ] 各 test 名末尾に `（CSP 違反なし）` 付与
- [ ] 陽性対照メタテスト 1 件追加 (`browser.newContext()` + `applyProductionCsp` inline pattern、`expect.poll(() => guard.violations.length).toBeGreaterThan(0)`)
- [ ] `import { applyProductionCsp, withProductionCsp } from './helpers';` に変更
- [ ] `test.beforeEach` 削除 (`withProductionCsp` 内部で goto + hydration 待ちを実行)
- [ ] subagent が `npx astro check` で 0 errors 確認 (E2E spec の TypeScript 型)
- [ ] subagent は **`npm run test:e2e` を実行しない** (時間がかかる、親が Phase 2 で実行)
- [ ] **commit していないこと**

---

## Phase 1.5 — 親 Opus が順次 commit (race 完全回避)

Phase 1 の 3 Track が全て完了報告を出した後、親 Opus が下記を実行。

### Task 1.5.1: 状態確認

- [ ] **Step 1**: 6 ファイル (5 migration + 1 E2E spec) が modified、commit はまだ Phase 0 のままであることを確認

```bash
git status
# Expected:
#   modified: src/components/tools/Base64Codec.tsx
#   modified: src/components/tools/JsonCsv.tsx
#   modified: src/components/tools/JsonXml.tsx
#   modified: src/components/tools/QrCode.tsx
#   modified: src/components/tools/UlidGenerator.tsx
#   modified: tests/e2e/ulid-generator.spec.ts

git log --oneline -2
# Expected: HEAD = Phase 0 chore(spec) commit
```

- [ ] **Step 2**: 各ファイルの inline style 残存ゼロ確認

```bash
grep -c "style={{" src/components/tools/Base64Codec.tsx \
                   src/components/tools/JsonCsv.tsx \
                   src/components/tools/JsonXml.tsx \
                   src/components/tools/QrCode.tsx \
                   src/components/tools/UlidGenerator.tsx
# Expected: 全て 0
```

### Task 1.5.2: Track A (Base64Codec + JsonCsv + JsonXml) commit

- [ ] **Step 1**: Track A 3 ファイルのみ stage

```bash
git add src/components/tools/Base64Codec.tsx \
        src/components/tools/JsonCsv.tsx \
        src/components/tools/JsonXml.tsx
```

- [ ] **Step 2**: 想定通りのファイルのみ staged であることを確認

```bash
git status --short
# Expected: M (staged) 3 件 + M (unstaged) 3 件 (QrCode / UlidGenerator / ulid-generator.spec.ts)
```

- [ ] **Step 3**: commit

```bash
git commit -m "$(cat <<'EOF'
refactor(tools): #176 B 案 PR 5b — Base64Codec + JsonCsv + JsonXml inline style 撤去

inline style 4 件 (Base64: 2 / JsonCsv: 1 / JsonXml: 1) + JsonCsv の
dead import (caption / colors を import するが本文で未使用) を撤去。

- Base64: 形式ラベルを `caption text-muted`、wrapper alignItems を
  `items-start` (Tailwind 標準) に置換。
- JsonCsv: wrapper alignItems を `items-start` に置換、本文で使われて
  いない `import { caption, colors }` を削除。
- JsonXml: wrapper alignItems を `items-start` に置換。styles.ts import
  はもとから不在 (alignItems のみで color 不使用)。

新規 class 追加なし、PR 1〜5a 既存資産でカバー。

ref: docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md §1〜§3

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

### Task 1.5.3: Track B (QrCode + UlidGenerator) commit

- [ ] **Step 1**: Track B 2 ファイルのみ stage

```bash
git add src/components/tools/QrCode.tsx \
        src/components/tools/UlidGenerator.tsx
```

- [ ] **Step 2**: commit

```bash
git commit -m "$(cat <<'EOF'
refactor(tools): #176 B 案 PR 5b — QrCode + UlidGenerator inline style 撤去

inline style 9 件 (QrCode: 7 / UlidGenerator: 2) を撤去し、
@layer components の意味クラス + Tailwind utility に置換。

- QrCode: 誤り訂正レベル/プレビュー/復元率を caption / body-emphasis /
  text-default / text-muted で表現。プレビューカード wrapper を
  `border border-default overflow-hidden`、header を `bg-subtle border-b
  border-default`、SVG 描画コンテナを `bg-default w-50 h-50` (200x200px)
  で構成。data-testid="qr-code-container" は維持。
- UlidGenerator: ULID 先頭 10 文字の primary 強調を `.text-primary`
  (PR 2)、件数表示ヘッダーを `body-emphasis text-default` で表現。

両ファイルから `import { ... } from '@/utils/styles'` を削除。

ref: docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md §4〜§5

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

### Task 1.5.4: Track C (ulid-generator E2E) commit

- [ ] **Step 1**: Track C ファイルのみ stage

```bash
git add tests/e2e/ulid-generator.spec.ts
```

- [ ] **Step 2**: commit

```bash
git commit -m "$(cat <<'EOF'
test(e2e): #176 B 案 PR 5b — ulid-generator.spec.ts を withProductionCsp 化 + 陽性対照メタテスト追加 (#262 partial)

PR #278 で導入された withProductionCsp ラッパで既存 5 件を包み、
ulid-generator ページに本番相当の CSP を注入した状態で E2E 検証を
行うように refactor。test.beforeEach は削除し、各 test が
withProductionCsp(browser, '/tools/ulid-generator', async (page) =>
{...}) の 1 行で hydration 待ち + assertNoViolations 自動呼出を
内包する形式に統一 (uuid-v7.spec.ts と同 pattern)。

末尾に陽性対照メタテスト 1 件を追加: browser.newContext() で新規
context を作り applyProductionCsp 直接利用の inline pattern で
意図的な CSP 違反 (外部 origin <script src>) を発生させ、
guard.violations.length が増えることを expect.poll で確認する。
helper 改修時の保険 (memory feedback_positive_control_for_gates.md)。

uuid-v7 (PR 3 で対応済) + ulid-generator (本 PR) で「generator
ページ全体に CSP gate」が成立し、#262 close 条件達成。
#234 の 19 spec チェックリストでも該当 2 件を消込。

ref: docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md §7

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3**: 3 commit に正しく split されたか確認

```bash
git log --oneline -5
# Expected:
# <SHA> test(e2e): #176 B 案 PR 5b — ulid-generator.spec.ts を withProductionCsp 化 + 陽性対照メタテスト追加 (#262 partial)
# <SHA> refactor(tools): #176 B 案 PR 5b — QrCode + UlidGenerator inline style 撤去
# <SHA> refactor(tools): #176 B 案 PR 5b — Base64Codec + JsonCsv + JsonXml inline style 撤去
# <SHA> chore(spec): #176 B 案 PR 5b spec / plan 追加
# 46abcb5 refactor(tools): #176 B 案 PR 5a — ConfigConverter + QrReader + JanCode inline style 撤去 (#283)

git show --stat HEAD HEAD~1 HEAD~2 | head -40
# Each commit が想定ファイルのみ変更していることを確認
```

---

## Phase 2 — 親 Opus 直接実行 (統合 + 検証 + PR)

### Task 2.1: MIGRATED_FILES 追加 (7 件: 5 migration + 2 zero-style)

- [ ] **Step 1**: `src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array に 7 件追加

`'src/components/tools/JanCode.tsx',` の **後** (PR 5a で追加した最終行の後) に下記を追加:

```ts
  // PR 5b で追加 (5 migration + 2 zero-style)
  'src/components/tools/Base64Codec.tsx',
  'src/components/tools/JsonCsv.tsx',
  'src/components/tools/JsonXml.tsx',
  'src/components/tools/QrCode.tsx',
  'src/components/tools/UlidGenerator.tsx',
  'src/components/tools/QrTicket.tsx',
  'src/components/tools/UrlEncoder.tsx',
```

- [ ] **Step 2**: migration test pass 確認

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts
# Expected: 31 ファイルの migration test 全 pass + 陽性対照 3 件 pass = 計 65 件 pass
```

- [ ] **Step 3**: commit

```bash
git add src/utils/__tests__/inline-style-migration.test.ts
git commit -m "$(cat <<'EOF'
test(migration): MIGRATED_FILES に PR 5b 対象 7 件追加 (5 migration + 2 zero-style)

Base64Codec / JsonCsv / JsonXml / QrCode / UlidGenerator の inline style
撤去完了 + QrTicket (root) / UrlEncoder の zero-style 登録 (PR 6 で
全件 glob 化する前の検出網に乗せる) で progressive migration tracker に
7 件追加 (24 → 31 件)。

QrTicket (root) / UrlEncoder はもとから style={{ ヒット数 0、コード
変更不要。MIGRATED_FILES に追加することで PR 6 で
await glob('src/components/**/*.tsx') 等で全件カバー化したときの
delta を真の migration 対象 (まだ手付かずのファイル) のみに絞れる。

ref: docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md §5〜§6

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 2.2: SoT (progress doc) 更新

- [ ] **Step 1**: `docs/projects/issue-176-b-plan-progress.md` を更新

進捗状況テーブルの PR 5b 行を更新:

```markdown
| PR 5b | Base64Codec + JsonCsv + JsonXml + QrCode + UlidGenerator + zero-style 登録 (QrTicket / UrlEncoder) + `tests/e2e/ulid-generator.spec.ts` CSP gate 化 (#262 close) | 🔄 PR open | [#XXX](https://github.com/fumtas1k/devtools/pull/XXX) |
```

(`#XXX` は Task 2.6 で取得した PR 番号、後で書き換え)

着手済 PR 履歴に PR 5b section を追加:

```markdown
### PR 5b (#XXX)

- **新規 class**: なし (PR 1〜5a の class 資産で 100% カバー)
- **再利用**: caption / body-emphasis / text-default / text-muted / text-primary / bg-default / bg-subtle / border-default を活用
- **zero-style 登録**: `QrTicket.tsx` (root) / `UrlEncoder.tsx` をコード変更なしで `MIGRATED_FILES` に追加 (PR 6 全件 glob 化前の検出網)
- **dead import 発見**: `JsonCsv.tsx` の `import { caption, colors } from '@/utils/styles'` が本文未使用 (PR 1〜5a の削減過程で削除漏れ)、本 PR で削除
- **E2E gate 拡張**: `tests/e2e/ulid-generator.spec.ts` 既存 5 件を `withProductionCsp` で包み、陽性対照メタテスト 1 件を追加 → uuid-v7 (PR 3 で対応済) + ulid-generator (本 PR) で「generator 全体に CSP gate」が成立し **#262 close**
- **#234 部分消込**: 19 spec 横展開のチェックリストで uuid-v7 + ulid-generator の 2 件を消込
- **race 回避運用**: PR 4 / 5a で確立した「subagent 非 commit + 親で順次 commit」を 3 回目運用、安定運用確認
- **進捗 doc 訂正**: ulid-generator.spec.ts は「新設」ではなく「既存 spec の refactor + 陽性対照追加」と訂正
```

ulid-generator.spec.ts の表記を「新設」→「既存 spec の refactor + 陽性対照追加」に訂正:

```bash
# 進捗状況テーブルの該当行と「PR 5b 着手時の memo」セクションで表記修正
# - 「`tests/e2e/ulid-generator.spec.ts` 新設 (#262 close)」
# → 「`tests/e2e/ulid-generator.spec.ts` を withProductionCsp 化 + 陽性対照追加 (#262 close)」
```

- [ ] **Step 2**: 一旦 PR 番号未確定で commit せず、Task 2.7 で実施。

### Task 2.3: ローカル必須ゲート (subagent 報告は信頼せず親が直接実行)

- [ ] **Step 1**: vitest 全 pass

```bash
npm run test
# Expected: 全 unit test pass、migration test 31 件 × 2 + 陽性対照 3 件 = 65 件 pass 含む
```

- [ ] **Step 2**: TypeScript 型チェック

```bash
npx astro check
# Expected: 0 errors, 0 warnings
```

- [ ] **Step 3**: E2E 全 pass (`feedback_e2e_before_pr.md`、PR 作成前必須)

```bash
npm run test:e2e
# Expected: 全 spec pass (base64 / json-csv / json-xml / qr-code / ulid-generator (CSP gate 化済) 含む)
```

E2E は build + preview を直列起動するため数分かかる。フォアグラウンドで実行して全 pass を確認する。**特に `ulid-generator.spec.ts` の 6 件 (5 既存 + 1 陽性対照) が新規 CSP gate 経路で pass することを確認**。

### Task 2.4: a11y 退化検知

- [ ] **Step 1**: aria-\* / role= / data-testid= / htmlFor= 削除行が無いこと

```bash
git diff origin/develop -- \
  src/components/tools/Base64Codec.tsx \
  src/components/tools/JsonCsv.tsx \
  src/components/tools/JsonXml.tsx \
  src/components/tools/QrCode.tsx \
  src/components/tools/UlidGenerator.tsx \
  | grep -E '^-.*(aria-|role=|data-testid=|htmlFor=)' | grep -vE '^---|^\+\+\+'
# Expected: 出力 0 行
```

- [ ] **Step 2**: 万が一何か "削除" 行が出た場合、現コードで存在を grep 確認

```bash
grep -n "data-testid\|aria-label\|aria-live\|role=" \
  src/components/tools/Base64Codec.tsx \
  src/components/tools/JsonCsv.tsx \
  src/components/tools/JsonXml.tsx \
  src/components/tools/QrCode.tsx \
  src/components/tools/UlidGenerator.tsx | head -30
# Expected: PR 3-5a と同じく diff の "削除行" が現コードに維持されていれば OK
# 特に QrCode の data-testid="qr-code-container" 維持
```

### Task 2.5: PR 作成前 final check

- [ ] **Step 1**: develop ベース一致確認

```bash
[ "$(git rev-parse origin/develop)" = "$(git merge-base HEAD origin/develop)" ] && echo OK
# Expected: OK
```

- [ ] **Step 2**: PR 6 スコープ侵害なし確認

```bash
git diff origin/develop --name-only | grep -cE "_headers|astro.config|src/utils/styles\.ts" || echo "0 (PR 6 スコープに触れていない = OK)"
# Expected: 0
```

- [ ] **Step 3**: 想定外ファイル変更がないこと

```bash
git diff origin/develop --name-only | sort
# Expected:
# docs/projects/issue-176-b-plan-progress.md (Task 2.7 で追加予定)
# docs/superpowers/plans/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e.md
# docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md
# src/components/tools/Base64Codec.tsx
# src/components/tools/JsonCsv.tsx
# src/components/tools/JsonXml.tsx
# src/components/tools/QrCode.tsx
# src/components/tools/UlidGenerator.tsx
# src/utils/__tests__/inline-style-migration.test.ts
# tests/e2e/ulid-generator.spec.ts
```

(進捗 doc 更新は Task 2.7 で PR 番号確定後に commit)

### Task 2.6: push + PR 作成

- [ ] **Step 1**: PR 本文を `/tmp/claude/pr_body_b5b.md` に書き出し (CLAUDE.md 6.1: `--body-file` 必須)

```bash
mkdir -p /tmp/claude
cat > /tmp/claude/pr_body_b5b.md <<'EOF'
## 概要

`#176` B 案バッチの PR 5b。残ツール 5 つ (`Base64Codec` / `JsonCsv` / `JsonXml` / `QrCode` / `UlidGenerator`) の inline style を撤去 + zero-style 2 ファイル (`QrTicket` (root) / `UrlEncoder`) を progressive migration tracker に登録 + `tests/e2e/ulid-generator.spec.ts` を `withProductionCsp` でラップして陽性対照メタテストを追加し、**#262 を close** する。これで migration 段階 (PR 1〜5b) が完了し、PR 6 (flip + cleanup) で `style-src 'unsafe-inline'` を削除する最終 phase へ移行可能になる。

PR 5 全体 (9 ツール) を 5a (大物 3 つ、#283 で merge 済) と 5b (本 PR、残り 7 つ + ulid-generator E2E + #262 close) に分割した後半。

- spec: `docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md`
- plan: `docs/superpowers/plans/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e.md`
- バッチ進捗: `docs/projects/issue-176-b-plan-progress.md`

Closes #262

## 主要な変更

### `src/styles/global.css` 追加 class

**なし**。PR 1〜5a で導入済の class (`caption` / `body-emphasis` / `text-default` / `text-muted` / `text-primary` / `bg-default` / `bg-subtle` / `border-default` 等) で 100% カバー。

### `Base64Codec.tsx` (2 件 → 0)

- 形式ラベルを `caption text-muted` で表現
- wrapper alignItems を `items-start` (Tailwind 標準) に置換
- `import { caption, colors } from '@/utils/styles'` を削除

### `JsonCsv.tsx` (1 件 + dead import → 0)

- wrapper alignItems を `items-start` に置換
- **dead import 発見**: `caption` / `colors` を import するが本文で未使用 (PR 1〜5a の削減過程で削除漏れ)、本 PR で削除

### `JsonXml.tsx` (1 件 → 0)

- wrapper alignItems を `items-start` に置換
- styles.ts import はもとから不在 (alignItems のみで color 不使用、進捗 doc で flag されていた「styles.ts import 不在の理由」確定)

### `QrCode.tsx` (7 件 → 0)

- 誤り訂正レベル/プレビュー/復元率を `caption` / `body-emphasis` / `text-default` / `text-muted` で表現
- プレビューカード wrapper を `border border-default overflow-hidden` (Tailwind 1px + .border-default の組合わせ、PR 5a §1.6 / §3.1 と同 pattern)
- header を `bg-subtle border-b border-default`、SVG 描画コンテナを `bg-default w-50 h-50` (200x200px、Tailwind 標準計算 `50 * 0.25rem = 12.5rem = 200px`)
- `data-testid="qr-code-container"` 維持
- `import { bodyEmphasis, caption, colors } from '@/utils/styles'` を削除

### `UlidGenerator.tsx` (2 件 → 0)

- ULID 先頭 10 文字の primary 強調を `.text-primary` (PR 2 既存) で表現
- 件数表示ヘッダーを `body-emphasis text-default` で表現
- `import { bodyEmphasis, colors } from '@/utils/styles'` を削除

### zero-style 登録 (`QrTicket.tsx` (root) / `UrlEncoder.tsx`)

両ファイルとも元から `style={{` ヒット数 0 (調査 §0 で grep 確認)。コード変更なしで `MIGRATED_FILES` array に追加することで、PR 6 で全件 glob 化したときの delta を真の migration 対象のみに絞れる検出網として機能。

### `tests/e2e/ulid-generator.spec.ts` CSP gate 化 (#262 close)

PR #278 で導入された `withProductionCsp` ラッパで既存 5 件を包み、ulid-generator ページに本番相当の CSP (`PRODUCTION_CSP`) を注入した状態で E2E 検証を行うように refactor:

- `test.beforeEach` を削除し、各 test が `withProductionCsp(browser, '/tools/ulid-generator', async (page) => {...})` の 1 行で hydration 待ち + `assertNoViolations` 自動呼出を内包する形式に統一 (`uuid-v7.spec.ts` と同 pattern)
- 末尾に陽性対照メタテスト 1 件を追加: `browser.newContext()` で新規 context を作り `applyProductionCsp` 直接利用の inline pattern で意図的な CSP 違反 (外部 origin `<script src>`) を発生させ、`guard.violations.length` が増えることを `expect.poll` で確認する。helper 改修時の保険 (memory `feedback_positive_control_for_gates.md`)
- 本 PR で `uuid-v7` (PR 3 で対応済) + `ulid-generator` (本 PR) で「generator ページ全体に CSP gate」が成立し **#262 close 条件達成**
- `#234` の 19 spec 横展開チェックリストでも uuid-v7 + ulid-generator の 2 件を消込

**進捗 doc 訂正**: SoT (`docs/projects/issue-176-b-plan-progress.md`) で `ulid-generator.spec.ts` を「新設」と表記していたが、調査の結果既存 spec として存在し CSP gate 未適用の状態だったため、「既存 spec の refactor + 陽性対照追加」に表記訂正。

## Race 回避運用 (PR 4 / 5a で確立した運用継承)

PR 3 で sonnet 並列 dispatch 時に commit 結合 race が発生 → PR 4 で「subagent 非 commit」運用を初採用 → PR 5a で 2 回目運用、本 PR で 3 回目運用として継承:

- subagent は **ファイル編集 + self-verification (vitest, astro check) のみ** 実施
- subagent は `git add` / `git commit` を実行しない
- 親 Opus が Phase 1.5 で Track 単位 (1 commit / Track) で順次 stage + commit (3 commit)

結果: commit message と内容が完全一致、prettier 巻き込みも親が制御、3 Track 並列実装で時間効率も維持。

## 検証ログ (親 Opus 直接実行)

- [x] `npm run test` 全 pass (migration test 31 件 × 2 + 陽性対照 3 件 = 65 件 pass 含む)
- [x] `npx astro check` → 0 errors, 0 warnings
- [x] `npm run test:e2e` 全 pass (base64 / json-csv / json-xml / qr-code / ulid-generator (CSP gate 化済 6 件) 含む)
- [x] a11y 退化なし (`aria-*` / `role=` / `data-testid=` / `htmlFor=` 削除行 0)
- [x] inline style 残存ゼロ (`grep -c "style={{"` = 0 × 5 ファイル)
- [x] PR 6 スコープ未侵害 (`_headers` / `astro.config.mjs` / `src/utils/styles.ts` 未変更)
- [x] zero-style 登録対象 (`QrTicket` (root) / `UrlEncoder`) はコード変更なし (MIGRATED_FILES 追加のみ)

## VRT

`visual-regression.yml` で baseline 比較 (non-required check)。すべての置換が CSS variable 参照経由で同じ値を取るため、VRT 差分 0 が期待される (詳細は spec §7.4)。

## #262 close 条件達成

PR 1.5 で `setProperty('--var', value)` を導入したため、CSP strict 化 (`'unsafe-inline'` 削除) 後に CSP 違反 (実際にはなし、setProperty は CSSOM API 経由で許容) を能動検出する E2E が必要だった。VRT は pixel diff のみで CSP 違反を silent pass しうる (memory `feedback_prod_parity_csp.md`)。

本 PR で `ulid-generator.spec.ts` を CSP gate 化したことで:

- `tests/e2e/uuid-v7.spec.ts` (PR 3 #275 で対応済)
- `tests/e2e/ulid-generator.spec.ts` (本 PR)

の 2 spec が generator ページ全体をカバー = `#262` の前段必須条件が PR 6 着手前に整う。

## #234 部分消込

19 spec 横展開のチェックリストで本 PR が消込する spec:

- [x] `tests/e2e/ulid-generator.spec.ts` (本 PR で対応)
- [x] `tests/e2e/uuid-v7.spec.ts` (PR 3 で対応済)

残 17 spec は別 PR で対応 (本 PR スコープ外)。

## コミット粒度

```

<SHA> docs(progress): #176 B 案 PR 5b (#XXX) の状態と特記事項を反映 + ulid spec 表記訂正
<SHA> test(migration): MIGRATED_FILES に PR 5b 対象 7 件追加 (5 migration + 2 zero-style)
<SHA> test(e2e): #176 B 案 PR 5b — ulid-generator.spec.ts を withProductionCsp 化 + 陽性対照メタテスト追加 (#262 partial)
<SHA> refactor(tools): #176 B 案 PR 5b — QrCode + UlidGenerator inline style 撤去
<SHA> refactor(tools): #176 B 案 PR 5b — Base64Codec + JsonCsv + JsonXml inline style 撤去
<SHA> chore(spec): #176 B 案 PR 5b spec / plan 追加

```

## 関連

- 起源 issue: #176 (アプローチ B)
- 本 PR で close される issue: #262 (ulid-generator + uuid-v7 で generator E2E gate 完成)
- 本 PR で部分消込される issue: #234 (19 spec 横展開のうち 2 件)
- 前提 PR: #249 (A-1) / #254 (VRT) / #256 (PR 1) / #261 (PR 1.5) / #272 (PR 2) / #275 (PR 3) / #277 (PR 4) / #278 (前段 infra) / #283 (PR 5a)
- 後続: PR 6 (flip + cleanup、`style-src 'unsafe-inline'` 削除 + `decisions.md` [067] 一括記録)
EOF
```

- [ ] **Step 2**: push

```bash
git push -u origin feature/issue-176-b5b-rest-tools-and-ulid-e2e
```

- [ ] **Step 3**: PR 作成 (`--base develop` を **必ず** 明示、`--body-file` で本文渡し)

```bash
gh pr create --base develop \
  --title "refactor(tools): #176 B 案 PR 5b — 残ツール inline style 撤去 + ulid-generator E2E CSP gate 化 (#262 close)" \
  --body-file /tmp/claude/pr_body_b5b.md
```

Expected: PR URL を取得 → user に提示 + `#XXX` を Task 2.7 に渡す。

### Task 2.7: progress doc 更新 (PR 番号確定後)

- [ ] **Step 1**: PR 番号 (`#XXX`) を反映して `docs/projects/issue-176-b-plan-progress.md` を更新
  - 進捗状況テーブル: PR 5b 行を `🔄 PR open + #XXX link` に
  - 着手済 PR 履歴: PR 5b (#XXX) section を追加 (新規 class なし / dead import 発見 / E2E gate 化 / #262 close 条件達成 / #234 部分消込)
  - ulid-generator.spec.ts 表記を「新設」→「既存 spec の refactor + 陽性対照追加」に訂正
  - PR 6 必須チェックリスト末尾の「PR 5a (#283) 由来」を「PR 5a (#283) / PR 5b (#XXX) 由来」に更新

- [ ] **Step 2**: prettier 自動 fix

```bash
npx prettier --write docs/projects/issue-176-b-plan-progress.md
```

- [ ] **Step 3**: commit

```bash
git add docs/projects/issue-176-b-plan-progress.md
git commit -m "$(cat <<'EOF'
docs(progress): #176 B 案 PR 5b (#XXX) の状態と特記事項を反映 + ulid spec 表記訂正

PR 3-5a 経験を踏まえ merge 待ちの間も SoT を current 化する運用。

更新内容:
- 進捗状況テーブル: PR 5b を 🔄 PR open + #XXX link に変更
- 着手済 PR 履歴: PR 5b (#XXX) section を追加
  - 新規 class 追加なし (PR 1〜5a 資産で 100% カバー)
  - JsonCsv の dead import 発見・削除
  - ulid-generator.spec.ts CSP gate 化で #262 close 条件達成
  - #234 19 spec チェックリストで該当 2 件消込
  - subagent 非 commit 運用 3 回目、安定運用確認
- ulid-generator.spec.ts 表記訂正: 「新設」→「既存 spec の
  refactor + 陽性対照追加」(調査結果、既存 spec として存在を確認)

ref: https://github.com/fumtas1k/devtools/pull/XXX

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4**: push

```bash
git push
```

---

## Phase 3 — review サイクル

- [ ] **Step 1**: PR 作成後は **自発的な修正 push を控える** (memory `feedback_hold_push_during_review.md`)
- [ ] **Step 2**: CI green + reviewer LGTM 後に user に merge を依頼
- [ ] **Step 3**: review 指摘があればまとめて対応 commit を 1 件 push (PR 3-5a 同様)
- [ ] **Step 4**: merge 後の cleanup (memory `feedback_worktree_merge_order.md` に従う)

```bash
# 順序: gh pr merge --delete-branch の **前** に worktree remove
cd /Users/fumta/projects/devtools
git worktree remove .claude/worktrees/issue-176-b5b
git branch -D feature/issue-176-b5b-rest-tools-and-ulid-e2e 2>&1 || true  # 既に消えている場合あり
gh pr merge XXX --squash --delete-branch
git checkout develop && git pull origin develop
```

merge 完了後、PR 6 着手前の準備:

- [ ] PR 6 spec 起草前に `#281` (`withProductionCsp` meta-test) を再確認 (issue 本文に「PR 5 完了後 or options 拡張時」と明記、PR 5b 完了で再判断タイミング到来)
- [ ] 進捗 doc の PR 6 必須チェックリストを TaskList の最初の task として展開する準備

---

## Subagent prompt template

各 subagent には以下要素を **必ず** 含める:

1. **作業ディレクトリ**: `/Users/fumta/projects/devtools/.claude/worktrees/issue-176-b5b`
2. **担当ファイル list** (変更可能 / 触ってはいけない)
3. **spec 該当 section の reference** (`docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md` § N)
4. **既存 class 一覧** (PR 1〜5a で導入済、新規追加なし)
5. **自己検証コマンド**: `npm run test -- <該当 test path>` + `npx astro check`
6. **やってはいけないこと**:
   - `git add` / `git commit` (親が Phase 1.5 で実施)
   - `git push` / `gh pr create`
   - `npm run test:vrt` (memory `feedback_vrt_ci_only.md`)
   - `npm run test:e2e` (時間かかる、親が Phase 2 で確認)
   - 他 Track のファイル変更
   - `src/utils/styles.ts` 削除 (PR 6 スコープ)
   - `src/styles/global.css` 編集 (新規 class 追加なし、変更不要)
7. **完了報告フォーマット**:
   - status: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
   - 変更ファイル list (`git diff --name-only`)
   - 自己検証結果 (vitest / astro check)
   - 残課題

### Track A subagent prompt 骨子

```
作業ディレクトリ: /Users/fumta/projects/devtools/.claude/worktrees/issue-176-b5b

タスク: src/components/tools/Base64Codec.tsx (2 件) + src/components/tools/JsonCsv.tsx (1 件 + dead import) + src/components/tools/JsonXml.tsx (1 件) の inline style を spec §1〜§3 に従い撤去する。

参照:
- spec: docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md (§1.1〜§3.1)
- 既存パターン: src/components/tools/EncodingConverter.tsx / src/components/tools/DummyText.tsx (PR 4 で migration 済の wrapper alignItems → items-start pattern)
- 利用可能な既存 class (PR 1〜5a で導入済): caption / text-muted 等
- 新規 class 追加は不要 (本 PR では新規ゼロ方針)

変更可能なファイル:
- src/components/tools/Base64Codec.tsx
- src/components/tools/JsonCsv.tsx
- src/components/tools/JsonXml.tsx

触ってはいけないファイル:
- src/components/tools/__tests__/* (logic test、変更不要)
- src/utils/styles.ts (PR 6 スコープ)
- src/styles/global.css (新規 class 不要)
- src/components/tools/QrCode.tsx (Track B)
- src/components/tools/UlidGenerator.tsx (Track B)
- tests/e2e/* (Track C)

完了基準:
- grep -c "style={{" src/components/tools/Base64Codec.tsx → 0
- grep -c "style={{" src/components/tools/JsonCsv.tsx → 0
- grep -c "style={{" src/components/tools/JsonXml.tsx → 0
- grep "from '@/utils/styles'" src/components/tools/Base64Codec.tsx → 0
- grep "from '@/utils/styles'" src/components/tools/JsonCsv.tsx → 0 (dead import 削除)
- JsonXml.tsx の import に変更なし (もとから styles import 不在)
- npm run test (関連 unit test) で pass
- npx astro check → 0 errors

特記事項:
- JsonCsv は事前 grep で `caption` / `colors` が本文で使われていない (dead import) ことが確認済。spec §2.2 参照
- 3 ファイルとも変更箇所は alignItems: 'flex-start' → items-start 系の wrapper 1 箇所が共通、Base64 はさらに 1 箇所 (caption + text-muted) を追加対応

やってはいけないこと:
- git add / git commit (親が Phase 1.5 で実施、subagent は commit せず)
- git push / gh pr create
- npm run test:vrt
- npm run test:e2e (親が Phase 2 で実行)
- 上記の "触ってはいけないファイル" の変更
- src/styles/global.css への class 追加 (新規不要)

完了後 報告: status + 変更ファイル list + 自己検証結果 (vitest / astro check 出力要約) + 残課題
```

### Track B subagent prompt 骨子

```
作業ディレクトリ: /Users/fumta/projects/devtools/.claude/worktrees/issue-176-b5b

タスク: src/components/tools/QrCode.tsx (7 件) + src/components/tools/UlidGenerator.tsx (2 件) の inline style を spec §4〜§5 に従い撤去する。

参照:
- spec: docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md (§4.1〜§5.3)
- 既存パターン:
  - QrCode wrapper の border + border-default は PR 5a §1.6 / §3.1 (ConfigConverter / JanCode) と同 pattern
  - UlidGenerator の text-primary は PR 2 で導入済 class
- 利用可能な既存 class (PR 1〜5a で導入済): caption / body-emphasis / text-default / text-muted / text-primary / bg-default / bg-subtle / border-default
- Tailwind 4 標準: w-50 (= 200px = 12.5rem)、h-50、border (1px)、border-b、overflow-hidden、mb-1

変更可能なファイル:
- src/components/tools/QrCode.tsx
- src/components/tools/UlidGenerator.tsx

触ってはいけないファイル:
- src/components/tools/__tests__/* (logic test、変更不要)
- src/utils/styles.ts (PR 6 スコープ)
- src/styles/global.css (新規 class 不要)
- src/components/tools/Base64Codec.tsx / JsonCsv.tsx / JsonXml.tsx (Track A)
- tests/e2e/* (Track C)
- src/components/ui/ResultTable.tsx (UlidGenerator が consumer で使うが本 PR は ResultTable 自体の変更不要)

完了基準:
- grep -c "style={{" src/components/tools/QrCode.tsx → 0
- grep -c "style={{" src/components/tools/UlidGenerator.tsx → 0
- grep "from '@/utils/styles'" src/components/tools/QrCode.tsx → 0
- grep "from '@/utils/styles'" src/components/tools/UlidGenerator.tsx → 0
- QrCode の data-testid="qr-code-container" 維持
- QrCode SVG 描画コンテナが className="w-50 h-50" (200x200px Tailwind 標準)
- UlidGenerator の text-primary 適用箇所が ULID 先頭 10 文字 (row.id.slice(0, 10))
- npm run test (関連 unit test) で pass
- npx astro check → 0 errors

特記事項:
- QrCode のプレビューカード wrapper は border (Tailwind 1px) + border-default (PR 1) の組合わせ、PR 5a §1.6 と同 pattern
- QrCode の SVG コンテナ width/height 200px は Tailwind 標準 w-50/h-50 で表現可能 (50 * 0.25rem = 12.5rem = 200px)
- UlidGenerator の bodyEmphasis spread + text 強調は body-emphasis text-default で表現

やってはいけないこと:
- git add / git commit (親が Phase 1.5 で実施)
- git push / gh pr create
- npm run test:vrt
- npm run test:e2e
- 上記の "触ってはいけないファイル" の変更
- src/styles/global.css への class 追加 (新規不要)
- ResultTable / consumer 経由の logic 変更

完了後 報告: status + 変更ファイル list + 自己検証結果 + 残課題
```

### Track C subagent prompt 骨子

```
作業ディレクトリ: /Users/fumta/projects/devtools/.claude/worktrees/issue-176-b5b

タスク: tests/e2e/ulid-generator.spec.ts の既存 5 件を withProductionCsp で包み、陽性対照メタテスト 1 件を末尾に追加する。spec §7 参照。

参照:
- spec: docs/superpowers/specs/2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md (§7.1〜§7.3)
- 既存パターン: tests/e2e/uuid-v7.spec.ts (PR 3 #275 で同 pattern を確立)
- helper: tests/e2e/helpers.ts (withProductionCsp / applyProductionCsp、PR #278 で導入)
- 陽性対照 inline pattern: tests/e2e/uuid-v7.spec.ts line 116-148 (browser.newContext() + applyProductionCsp 直接利用 + expect.poll)
- URL slug: /tools/ulid-generator (事前 grep で確認済)

変更可能なファイル:
- tests/e2e/ulid-generator.spec.ts

触ってはいけないファイル:
- tests/e2e/helpers.ts (PR #278 で導入済、本 PR は consumer 側のみ)
- tests/e2e/uuid-v7.spec.ts (PR 3 で対応済、参照のみ)
- tests/e2e/* 他の spec (#234 横展開は別 PR)
- src/components/tools/UlidGenerator.tsx (Track B)
- src/utils/csp.ts (PR 6 スコープ)

完了基準:
- import 文に `applyProductionCsp` と `withProductionCsp` を含める (`import { applyProductionCsp, withProductionCsp } from './helpers';`)
- describe 名: `'ULID生成（production CSP 適用）'`
- 既存 5 件すべてが `withProductionCsp(browser, '/tools/ulid-generator', async (page) => {...})` で包まれている (test fixture を `page` → `browser` に変更)
- 各 test 名末尾に `（CSP 違反なし）` 付与
- `test.beforeEach` 削除 (`withProductionCsp` 内部で goto + hydration 待ちを実行)
- 末尾に陽性対照メタテスト 1 件追加 (uuid-v7.spec.ts line 116-148 と完全 mirror、URL を /tools/ulid-generator に変更):
  - test 名: `'applyProductionCsp は実際に CSP 違反を捕捉する（ゲート自体の動作確認）'`
  - browser.newContext() で新規 context
  - applyProductionCsp(page) を直接利用
  - 外部 origin <script src> を DOM 挿入
  - expect.poll(() => guard.violations.length).toBeGreaterThan(0)
  - finally で context.close()
- npx astro check → 0 errors (E2E spec の TypeScript 型)
- npm run test:e2e は subagent では実行しない (親が Phase 2 で実行)

特記事項:
- uuid-v7.spec.ts と完全に同じ pattern を踏襲する。test の中身 (logic) は既存のまま、ラッピングのみ変更
- waitForReactHydration は withProductionCsp の内部で呼ばれるため、test 内では import / 直接呼出は不要 (uuid-v7 と整合)

やってはいけないこと:
- git add / git commit (親が Phase 1.5 で実施)
- git push / gh pr create
- npm run test:vrt
- npm run test:e2e (親が Phase 2 で実行、subagent は astro check のみ)
- 上記の "触ってはいけないファイル" の変更
- helpers.ts への変更 (本 PR は consumer 側のみ、helper 自体の改修は #281 で対応)
- 既存 test の logic 変更 (本 PR は CSP gate 化のみ、ulid 生成 logic への影響ゼロが原則)

完了後 報告: status + 変更ファイル list + 自己検証結果 (astro check のみ、e2e は親が後段で確認) + 残課題
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
- `feedback_worktree_location.md` (`.claude/worktrees/<name>`)
- `feedback_worktree_merge_order.md` (worktree remove → branch delete の順)
- `feedback_vrt_ci_only.md` (ローカル test:vrt 走らせない)
- `feedback_followup_routing.md` (PR 後の離散タスクは issue 化)
- `feedback_tailwind_v4_layer_variant.md` (本 PR では該当なし、参考)
- `feedback_infra_feature_separation.md` (本 PR は **例外判断**: ulid-generator E2E gate を migration と bundle 許容、spec §「なぜ独立 PR か」で根拠明示)
- `feedback_prod_parity_csp.md` (#262 動機の核心、本 PR で close)
- `feedback_positive_control_for_gates.md` (陽性対照メタテスト追加の根拠)

---

## Phase 1 開始判定

Phase 0 commit 完了 + worktree の `npm ci` 完了を確認したら Phase 1 dispatch。3 Track が独立ファイル + commit せず方針のため **同時並列 dispatch** で OK (race 不可能)。
