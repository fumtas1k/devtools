# #176 B 案 PR 5a 実装計画書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**: `ConfigConverter.tsx` (11 件) + `QrReader.tsx` (11 件) + `JanCode.tsx` (9 件) + JanCode 内 `e.currentTarget.style.X = Y` 2 件を撤去し、`@layer components` の意味クラス + Tailwind utility に置換する。

**Architecture**: PR 1〜4 で確立した「`@layer components` への意味クラス追加 + Tailwind utility」pattern を継承。**新規 class は `.qr-video-preview` の 1 件のみ** (95% 以上を既存 class でカバー、JanCode hover は PR 4 既存 `.hover-bg-subtle` を再利用)。Phase 0 (親 Opus) で foundation commit、Phase 1 で sonnet subagent 3 並列、**Phase 1.5 で親 Opus が順次 commit (PR 4 で確立した運用継承)**、Phase 2 で MIGRATED_FILES + 検証 + PR 作成。

**Tech Stack**: TypeScript / React 19 / Astro 5 / Tailwind CSS 4 / Vitest / Playwright

**作成日**: 2026-05-07
**Spec**: `docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md`
**ブランチ**: `feature/issue-176-b5a-config-qr-jan`
**Worktree**: `.claude/worktrees/issue-176-b5a`
**Base**: `origin/develop` (PR 4 #277 + infra #278 merge 後の最新)

---

## 進行モデル

`feedback_subagent_model.md` / `feedback_subagent_workflow.md` / `feedback_subagent_verification_trust.md` 準拠。

| Phase | 担当                  | 内容                                                                                  |
| ----- | --------------------- | ------------------------------------------------------------------------------------- |
| 0     | 親 Opus               | spec / plan 配置、worktree 作成、global.css foundation commit                         |
| 1     | sonnet 並列 (3 track) | Track A / B / C の **編集 + self-verification のみ** (commit せず)                    |
| 1.5   | 親 Opus               | Track A / B / C の変更を順次 stage + commit (race 完全回避)                           |
| 2     | 親 Opus               | `MIGRATED_FILES` 追加、ローカル必須ゲート 3 件直接実行、aria diff 確認、push、PR 作成 |
| 3     | 親 Opus + reviewer    | review サイクル → merge → SoT 更新 → worktree cleanup                                 |

---

## File Structure

| File                                                     | Phase | 担当    | 変更内容                                                                  |
| -------------------------------------------------------- | ----- | ------- | ------------------------------------------------------------------------- |
| `docs/superpowers/specs/2026-05-07-...-design.md`        | 0     | 親 Opus | spec をブランチ最初の commit として配置                                   |
| `docs/superpowers/plans/2026-05-07-...-config-qr-jan.md` | 0     | 親 Opus | plan を spec と同 commit で配置                                           |
| `src/styles/global.css`                                  | 0     | 親 Opus | `@layer components` に `.qr-video-preview` 1 件追加                       |
| `src/components/tools/ConfigConverter.tsx`               | 1     | Track A | inline style 11 件除去 + import 整理                                      |
| `src/components/tools/QrReader.tsx`                      | 1     | Track B | inline style 11 件除去 + module-level スタイル定数 4 個解体 + import 整理 |
| `src/components/tools/JanCode.tsx`                       | 1     | Track C | inline style 9 件除去 + CSSOM hover 2 件除去 + import 整理                |
| `src/utils/__tests__/inline-style-migration.test.ts`     | 2     | 親 Opus | `MIGRATED_FILES` array に 3 件追加 (合計 24 件)                           |
| `docs/projects/issue-176-b-plan-progress.md`             | 2     | 親 Opus | PR 5a 状態を current 化 (PR 3-4 経験を踏まえ merge 待ち間 SoT 反映)       |

**触らない**:

- `src/components/tools/__tests__/*.test.ts` (logic test、本 PR の class 化は DOM 構造非変更)
- `src/utils/styles.ts` (PR 6 で削除、本 PR は import 削除のみ)
- `src/utils/csp.ts` / `public/_headers` (PR 6 で strict 化)
- `tests/e2e/*.spec.ts` (本 PR で applyProductionCsp gate 追加せず、#262 残部分 = ulid-generator は PR 5b で対応)
- `src/hooks/useQrCamera.ts` (logic、本 PR スコープ外)

---

## Phase 0 — 親 Opus 直接実行

### Task 0.1: Worktree 作成

- [ ] **Step 1**: 現在のブランチが `develop` で clean state であることを確認

```bash
git status
git branch --show-current
# Expected: clean / develop
```

- [ ] **Step 2**: origin/develop の最新を fetch (PR 4 #277 + infra #278 merge 済確認)

```bash
git fetch origin develop
git rev-parse origin/develop HEAD
# Expected: 同じ SHA、HEAD が #278 (73de179) 以降
```

- [ ] **Step 3**: worktree を作成 (`origin/develop` ベースを **明示**)

```bash
git worktree add .claude/worktrees/issue-176-b5a origin/develop -b feature/issue-176-b5a-config-qr-jan
```

- [ ] **Step 4**: worktree で `npm ci` 実行

```bash
cd .claude/worktrees/issue-176-b5a && npm ci
```

Expected: `node_modules` が worktree に存在し vitest / playwright が解決可能。

### Task 0.2: spec / plan ファイル配置

- [ ] **Step 1**: develop 側で書いた spec / plan を worktree にコピー

```bash
cp docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md \
   .claude/worktrees/issue-176-b5a/docs/superpowers/specs/
cp docs/superpowers/plans/2026-05-07-issue-176-b5a-config-qr-jan.md \
   .claude/worktrees/issue-176-b5a/docs/superpowers/plans/
```

- [ ] **Step 2**: develop 側の untracked spec / plan を削除

```bash
rm docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md
rm docs/superpowers/plans/2026-05-07-issue-176-b5a-config-qr-jan.md
```

### Task 0.3: global.css に .qr-video-preview 追記

worktree で作業 (以下すべて `.claude/worktrees/issue-176-b5a` 内)。

- [ ] **Step 1**: `src/styles/global.css` の末尾 `@layer components { ... }` ブロックの閉じ `}` の **直前**、PR 4 の `.hover-bg-active` 定義の **後** に下記を追記

```css
/* === PR 5a: QrReader video preview background === */
/* QRリーダーの <video> 要素は `getUserMedia` 開始前 (display:none で隠蔽中) の
   コントラスト確保 + 起動失敗時のフォールバック (黒画面) として黒背景を維持する。
   一意の用途のため component-scoped class とする (色 token 化はしない)。 */
.qr-video-preview {
  background: #000;
}
```

- [ ] **Step 2**: 重複なし確認

```bash
grep -n "qr-video-preview" src/styles/global.css
# Expected: 1 行 (.qr-video-preview { ...)
```

- [ ] **Step 3**: PR 4 既存 `.hover-bg-subtle` / `.summary-no-marker` が削除されていないか確認 (JanCode が再利用するため)

```bash
grep -n "hover-bg-subtle\|summary-no-marker" src/styles/global.css
# Expected: 各 1 行以上
```

- [ ] **Step 4**: vitest 一部実行で global.css 読み込みが壊れていないか確認

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts
# Expected: 既存 21 ファイルの migration test pass + 陽性対照 3 件 pass
```

### Task 0.4: Phase 0 commit

- [ ] **Step 1**: stage + commit

```bash
git add docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md \
        docs/superpowers/plans/2026-05-07-issue-176-b5a-config-qr-jan.md \
        src/styles/global.css

git commit -m "$(cat <<'EOF'
chore(spec): #176 B 案 PR 5a spec / plan / global.css foundation

Phase 0: spec / plan 配置 + global.css @layer components に
QrReader <video> 要素用 .qr-video-preview class 1 件を追加。

PR 1〜4 で導入済の class (caption, body-emphasis, text-default, text-muted,
text-on-primary, text-error, text-error-text, text-primary, text-link-color,
text-warning, bg-default, bg-subtle, bg-surface, bg-error-tint,
bg-warning-tint, border-default, border-input, alert-success, alert-error,
btn-link-plain, summary-no-marker, hover-bg-subtle 等) を再利用するため
新規 class は最小限 1 件のみ。JanCode の <summary> hover は PR 4 既存の
.hover-bg-subtle を再利用 (新規不要)。

Phase 1 (sonnet 並列 × 3 Track) で ConfigConverter / QrReader / JanCode
の migration を進める。Race 回避のため subagent は commit せず、
Phase 1.5 で親 Opus が順次 commit する運用 (PR 4 で確立)。

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

### Track A: `ConfigConverter.tsx` migration (11 件)

- [ ] **Step 1**: subagent prompt 作成 (下記 §Subagent prompt template の Track A 参照)
- [ ] **Step 2**: Agent dispatch (`model: "sonnet"`)
- [ ] **Step 3**: 完了報告受領 (status / 変更ファイル list / self-verification 結果)

**Track A 完了基準**:

- [ ] `grep -c "style={{" src/components/tools/ConfigConverter.tsx` → **0**
- [ ] `grep "from '@/utils/styles'" src/components/tools/ConfigConverter.tsx` → 0
- [ ] subagent が `npm run test -- src/utils/__tests__/config-converter.test.ts` (もしくは関連 test) で pass を確認
- [ ] subagent が `npx astro check` で 0 errors 確認
- [ ] **commit していないこと** (`git log --oneline -1` が Phase 0 commit のままであること)

### Track B: `QrReader.tsx` migration (11 件 + module-level スタイル定数 4 個解体)

- [ ] **Step 1**: subagent prompt 作成 (下記 §Subagent prompt template の Track B 参照)
- [ ] **Step 2**: Agent dispatch (`model: "sonnet"`)
- [ ] **Step 3**: 完了報告受領

**Track B 完了基準**:

- [ ] `grep -c "style={{" src/components/tools/QrReader.tsx` → **0**
- [ ] `grep "from '@/utils/styles'" src/components/tools/QrReader.tsx` → 0
- [ ] `grep -E "^const (rescan|startCamera|stopCamera|uploadLabel)" src/components/tools/QrReader.tsx` → 0 (module-level 定数全削除)
- [ ] file input が `className="sr-only"` になっていること (D2 採用案)
- [ ] subagent が astro check / 関連 test の pass 確認
- [ ] **commit していないこと**

### Track C: `JanCode.tsx` migration (9 件 + CSSOM hover 2 件除去)

- [ ] **Step 1**: subagent prompt 作成 (下記 §Subagent prompt template の Track C 参照)
- [ ] **Step 2**: Agent dispatch (`model: "sonnet"`)
- [ ] **Step 3**: 完了報告受領

**Track C 完了基準**:

- [ ] `grep -c "style={{" src/components/tools/JanCode.tsx` → **0**
- [ ] `grep "from '@/utils/styles'" src/components/tools/JanCode.tsx` → 0
- [ ] `grep -E "\.style\.[a-zA-Z]+\s*=" src/components/tools/JanCode.tsx | grep -v setProperty` → 0 (CSSOM mutation 全消去)
- [ ] `onMouseEnter` / `onMouseLeave` attribute は完全削除 (PR 4 Gs1Databar pattern で `.hover-bg-subtle` 化)
- [ ] subagent が astro check / 関連 test の pass 確認
- [ ] **commit していないこと**

---

## Phase 1.5 — 親 Opus が順次 commit (race 完全回避)

Phase 1 の 3 Track が全て完了報告を出した後、親 Opus が下記を実行。

### Task 1.5.1: 状態確認

- [ ] **Step 1**: 3 ファイル全てが modified、commit はまだ Phase 0 のままであることを確認

```bash
git status
# Expected:
#   modified: src/components/tools/ConfigConverter.tsx
#   modified: src/components/tools/QrReader.tsx
#   modified: src/components/tools/JanCode.tsx

git log --oneline -2
# Expected: HEAD = Phase 0 chore(spec) commit
```

- [ ] **Step 2**: 各ファイルの inline style 残存ゼロ確認

```bash
grep -c "style={{" src/components/tools/ConfigConverter.tsx \
                   src/components/tools/QrReader.tsx \
                   src/components/tools/JanCode.tsx
# Expected: 全て 0
```

- [ ] **Step 3**: JanCode の CSSOM mutation 残存ゼロ確認

```bash
grep -E "\.style\.[a-zA-Z]+\s*=" src/components/tools/JanCode.tsx | grep -v setProperty
# Expected: 出力なし (全消去)
```

### Task 1.5.2: Track A (ConfigConverter) commit

- [ ] **Step 1**: ConfigConverter.tsx のみ stage

```bash
git add src/components/tools/ConfigConverter.tsx
```

- [ ] **Step 2**: 想定通りのファイルのみ staged であることを確認

```bash
git status --short
# Expected: M src/components/tools/ConfigConverter.tsx (1 行のみ M)
#           その他 2 ファイルは M (unstaged) のまま
```

- [ ] **Step 3**: commit

```bash
git commit -m "$(cat <<'EOF'
refactor(tools): #176 B 案 PR 5a — ConfigConverter.tsx inline style 撤去

inline style 11 件を @layer components の class + Tailwind utility に置換。

変換元/変換先ラベルを `caption text-muted min-w-10` に集約、警告メッセージ
カードを `border border-warning bg-warning-tint` で表現、schema toggle
ボタンを `caption text-link-color btn-link-plain` で構成、arrow rotation
を `rotate-90` Tailwind 標準で表現、kbd を `caption text-muted font-mono`
に置換、検証結果カードを既存 .alert-success / .alert-error 利用。

import { caption, colors } from '@/utils/styles' を削除。

ref: docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md §1

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

### Task 1.5.3: Track B (QrReader) commit

- [ ] **Step 1**: QrReader.tsx のみ stage

```bash
git add src/components/tools/QrReader.tsx
git status --short
# Expected: M src/components/tools/QrReader.tsx + M src/components/tools/JanCode.tsx (unstaged)
```

- [ ] **Step 2**: commit

```bash
git commit -m "$(cat <<'EOF'
refactor(tools): #176 B 案 PR 5a — QrReader.tsx inline style 撤去 + module-level スタイル定数解体

inline style 11 件 + module-level スタイル定数 4 個 (rescanButtonStyle /
startCameraButtonStyle / stopCameraButtonStyle / uploadLabelStyle) を
全て解体し、@layer components の class + Tailwind utility に置換。

カメラ起動ボタンを bg-primary text-on-primary、停止ボタンを border-error
bg-error-tint text-error で表現。<video> 要素は新規 .qr-video-preview class
で黒背景を維持、display 切替は Tailwind hidden クラスで表現。

file input は Tailwind sr-only に置換 (a11y 同等以上)。
uploadLabelStyle(false) 呼び出しがないことを事前確認の上、
disabled 分岐は削除 (YAGNI)。

URL 警告カードは border border-warning bg-warning-tint、URL 開くボタンは
border border-warning bg-default で構成。

import { caption, colors } from '@/utils/styles' を削除。
React named import (React.ChangeEvent) は維持。

ref: docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md §2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

### Task 1.5.4: Track C (JanCode) commit

- [ ] **Step 1**: JanCode.tsx のみ stage

```bash
git add src/components/tools/JanCode.tsx
```

- [ ] **Step 2**: commit

```bash
git commit -m "$(cat <<'EOF'
refactor(tools): #176 B 案 PR 5a — JanCode.tsx inline style 撤去 + summary hover を CSS に移行

inline style 9 件を @layer components の class + Tailwind utility に置換。
e.currentTarget.style.background mutation (onMouseEnter/onMouseLeave で
hover bg を直接書き換え) 2 件を削除し、PR 4 既存の .hover-bg-subtle class
で hover 挙動を CSS で表現。

結果カードを border border-default bg-surface、完成コードの文字間隔を
tracking-[0.1em] arbitrary value、計算過程 <details> を border border-default
+ <summary> を caption font-bold text-muted summary-no-marker hover-bg-subtle
で構成。バーコードプレビュー wrapper を border border-default bg-default。

memory feedback_tailwind_v4_layer_variant.md: hover:bg-subtle variant は
@layer components 手書き class に効かないため、専用 .hover-bg-subtle
class (PR 4 で導入済) を再利用。

import { bodyEmphasis, caption, colors } from '@/utils/styles' を削除。

ref: docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md §3

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3**: 3 commit に正しく split されたか確認

```bash
git log --oneline -5
# Expected:
# <SHA> refactor(tools): #176 B 案 PR 5a — JanCode.tsx inline style 撤去 + summary hover を CSS に移行
# <SHA> refactor(tools): #176 B 案 PR 5a — QrReader.tsx inline style 撤去 + module-level スタイル定数解体
# <SHA> refactor(tools): #176 B 案 PR 5a — ConfigConverter.tsx inline style 撤去
# <SHA> chore(spec): #176 B 案 PR 5a spec / plan / global.css foundation
# 73de179 test(e2e): #276 withProductionCsp ラッパで applyProductionCsp boilerplate を集約 (#278)

git show --stat HEAD HEAD~1 HEAD~2 | head -30
# Each commit が 1 ファイルのみ変更していることを確認
```

---

## Phase 2 — 親 Opus 直接実行 (統合 + 検証 + PR)

### Task 2.1: MIGRATED_FILES 追加

- [ ] **Step 1**: `src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array に 3 件追加

`'src/components/tools/DummyText.tsx',` の **後** に下記を追加:

```ts
  // PR 5a で追加
  'src/components/tools/ConfigConverter.tsx',
  'src/components/tools/QrReader.tsx',
  'src/components/tools/JanCode.tsx',
```

- [ ] **Step 2**: migration test pass 確認

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts
# Expected: 24 ファイルの migration test 全 pass + 陽性対照 3 件 pass = 計 51 件 pass
```

- [ ] **Step 3**: commit

```bash
git add src/utils/__tests__/inline-style-migration.test.ts
git commit -m "$(cat <<'EOF'
test(migration): MIGRATED_FILES に PR 5a 対象 3 件追加

ConfigConverter.tsx / QrReader.tsx / JanCode.tsx の
inline style 撤去完了に伴い progressive migration tracker に追加
(21 → 24 件)。

ref: docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md §5

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 2.2: SoT (progress doc) 更新

- [ ] **Step 1**: `docs/projects/issue-176-b-plan-progress.md` を更新 (PR 3-4 と同パターン、merge 待ち間 SoT current 化)

進捗状況テーブルの PR 5a 行を更新:

```markdown
| PR 5a | ConfigConverter + QrReader + JanCode (大物 3 つ、CSSOM hover 含む) — 31 inline style + 2 CSSOM | 🔄 PR open | [#XXX](https://github.com/fumtas1k/devtools/pull/XXX) |
```

(`#XXX` は Task 2.6 で取得した PR 番号、後で書き換え)

着手済 PR 履歴に PR 5a section を追加:

```markdown
### PR 5a (#XXX)

- **新規 class**: `.qr-video-preview` の 1 件のみ (QrReader video 黒背景)
- **再利用**: PR 4 で導入された `.hover-bg-subtle` を JanCode `<summary>` で再利用 (新規不要)
- **削除**: QrReader の module-level スタイル定数 4 個 (`rescanButtonStyle` / `startCameraButtonStyle` / `stopCameraButtonStyle` / `uploadLabelStyle`) を全削除し className 化。`uploadLabelStyle(false)` 分岐は YAGNI で削除
- **race 回避運用**: PR 4 で確立した「subagent 非 commit + 親で順次 commit」を 2 回目運用、安定運用確認
- **CSSOM hover refactor**: JanCode `<summary>` の `onMouseEnter`/`onMouseLeave` 2 件を `.hover-bg-subtle` で CSS 化
```

- [ ] **Step 2**: 一旦 PR 番号未確定で commit せず、Phase 2 の最後 (PR 作成後) に PR 番号を確定して 1 commit に集約。本 step は **skip** し、Task 2.7 で実施。

### Task 2.3: ローカル必須ゲート (subagent 報告は信頼せず親が直接実行)

- [ ] **Step 1**: vitest 全 pass

```bash
npm run test
# Expected: 全 unit test pass、migration test 24 件 × 2 + 陽性対照 3 件 = 51 件 pass 含む
```

- [ ] **Step 2**: TypeScript 型チェック

```bash
npx astro check
# Expected: 0 errors, 0 warnings
```

- [ ] **Step 3**: E2E 全 pass (`feedback_e2e_before_pr.md`、PR 作成前必須)

```bash
npm run test:e2e
# Expected: 全 spec pass (config-converter / qr-reader / jan-code 含む)
```

E2E は build + preview を直列起動するため数分かかる。フォアグラウンドで実行して全 pass を確認する。

### Task 2.4: a11y 退化検知

- [ ] **Step 1**: aria-\* / role= / data-testid= / htmlFor= 削除行が無いこと

```bash
git diff origin/develop -- src/components/tools/ConfigConverter.tsx \
                           src/components/tools/QrReader.tsx \
                           src/components/tools/JanCode.tsx \
  | grep -E '^-.*(aria-|role=|data-testid=|htmlFor=)' | grep -vE '^---|^\+\+\+'
# Expected: 出力 0 行
# (reformat による行移動の "削除行" が出る場合は現コードで grep 確認、PR 3-4 と同運用)
```

- [ ] **Step 2**: 万が一何か "削除" 行が出た場合、現コードで存在を grep 確認

```bash
grep -n "data-testid\|aria-label\|aria-expanded\|aria-controls\|aria-live\|role=" src/components/tools/ConfigConverter.tsx | head -10
grep -n "data-testid\|aria-label\|htmlFor=\|aria-hidden" src/components/tools/QrReader.tsx | head -10
grep -n "data-testid\|aria-label\|aria-live" src/components/tools/JanCode.tsx | head -10
# Expected: PR 3-4 と同じく diff の "削除行" が現コードに維持されていれば OK
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
# docs/superpowers/plans/2026-05-07-issue-176-b5a-config-qr-jan.md
# docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md
# src/components/tools/ConfigConverter.tsx
# src/components/tools/JanCode.tsx
# src/components/tools/QrReader.tsx
# src/styles/global.css
# src/utils/__tests__/inline-style-migration.test.ts
```

### Task 2.6: push + PR 作成

- [ ] **Step 1**: PR 本文を `/tmp/claude/pr_body_b5a.md` に書き出し (CLAUDE.md 6.1: `--body-file` 必須)

```bash
mkdir -p /tmp/claude
cat > /tmp/claude/pr_body_b5a.md <<'EOF'
## 概要

`#176` B 案バッチの PR 5a。`ConfigConverter.tsx` (11 件) + `QrReader.tsx` (11 件) + `JanCode.tsx` (9 件) の JSX inline style + JanCode 内 `e.currentTarget.style.X = Y` 形式の CSSOM 直接 mutation 2 件 (`<summary>` の `onMouseEnter`/`onMouseLeave` hover state) を `@layer components` の意味クラス + Tailwind utility に置換する。

PR 5 全体 (9 ツール) を 5a (大物 3 つ) と 5b (残り 7 つ + ulid-generator E2E + #262 close) に分割した前半。

- spec: `docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md`
- plan: `docs/superpowers/plans/2026-05-07-issue-176-b5a-config-qr-jan.md`
- バッチ進捗: `docs/projects/issue-176-b-plan-progress.md`

## 主要な変更

### `src/styles/global.css` 追加 class (1 件のみ)

- `.qr-video-preview` (QrReader `<video>` 専用、`background: #000`)

JanCode `<summary>` hover は **PR 4 で導入された `.hover-bg-subtle` を再利用** (新規不要)。
PR 1〜4 で導入済の class (`caption` / `body-emphasis` / `text-default` / `text-muted` / `text-on-primary` / `text-error` / `text-error-text` / `text-primary` / `text-link-color` / `text-warning` / `bg-default` / `bg-subtle` / `bg-surface` / `bg-error-tint` / `bg-warning-tint` / `border-default` / `border-input` / `alert-success` / `alert-error` / `btn-link-plain` / `summary-no-marker` / `hover-bg-subtle`) で 95% 以上をカバー。

### `ConfigConverter.tsx` (11 件 → 0)

- 変換元/変換先ラベルを `caption text-muted min-w-10` で表現
- 警告メッセージカードを `border border-warning bg-warning-tint` (Tailwind auto-utility 利用)
- schema toggle ボタンを既存 `.btn-link-plain` (PR 1.5) + `text-link-color` で構成、arrow rotation は `rotate-90` Tailwind 標準
- 検証結果カードは既存 `.alert-success` / `.alert-error` (PR 2) を利用
- 新規 class 追加なし
- `import { caption, colors } from '@/utils/styles'` を削除

### `QrReader.tsx` (11 件 → 0、module-level 定数 4 個解体)

- module-level スタイル定数 4 個 (`rescanButtonStyle` / `startCameraButtonStyle` / `stopCameraButtonStyle` / `uploadLabelStyle`) を全削除し className 化
- `<video>` 要素を `w-full max-w-[400px] rounded-lg qr-video-preview` で構成、display 切替は Tailwind `hidden`
- カメラ起動ボタンは Tailwind auto-utility `bg-primary` + `.text-on-primary`、停止ボタンは `border-error bg-error-tint text-error`
- file input を Tailwind 標準 `sr-only` に置換 (a11y 同等以上)
- `uploadLabelStyle(false)` 呼び出しがないことを事前確認の上、disabled 分岐削除 (YAGNI)
- URL 警告カードは `border border-warning bg-warning-tint`、URL 開くリンクは `border border-warning bg-default`
- `import { caption, colors } from '@/utils/styles'` を削除 (React named import は維持)

### `JanCode.tsx` (9 件 + 2 hover refactor → 0)

- `onMouseEnter`/`onMouseLeave` で `e.currentTarget.style.background = ...` していた 2 件 (計算過程 `<summary>`) を削除し、PR 4 既存の `.hover-bg-subtle` (CSS `:hover` 表現) で代替
- 完成コード文字間隔は `tracking-[0.1em]` arbitrary value
- 結果カード / バーコードプレビュー wrapper を `border border-default bg-surface` / `border border-default bg-default` で構成
- 計算過程 `<details>/<summary>` marker 非表示は PR 4 既存 `.summary-no-marker` を再利用
- 新規 class 追加なし
- `import { bodyEmphasis, caption, colors } from '@/utils/styles'` を削除

## Race 回避運用 (PR 4 で確立した運用継承)

PR 3 で sonnet 並列 dispatch 時に commit 結合 race が発生 → PR 4 で「subagent 非 commit」運用を初採用 → 成功。本 PR では 2 回目運用として継承:

- subagent は **ファイル編集 + self-verification (vitest, astro check) のみ** 実施
- subagent は `git add` / `git commit` を実行しない
- 親 Opus が Phase 1.5 で 1 ファイルずつ stage + commit (3 commit、各 1 ファイル変更)

結果: commit message と内容が完全一致、prettier 巻き込みも親が制御。

## CSSOM hover refactor (memory `feedback_tailwind_v4_layer_variant.md` 適用)

JanCode の `<summary>` hover を Tailwind `hover:bg-subtle` variant ではなく PR 4 で導入された専用 `.hover-bg-subtle` class で表現。これは Tailwind v4 で `@layer components` 内の手書き class に対して `hover:` variant が CSS rule を生成しない silent regression を回避するため。

## 検証ログ (親 Opus 直接実行)

- [x] `npm run test` 全 pass (migration test 24 件 × 2 + 陽性対照 3 件 = 51 件 pass 含む)
- [x] `npx astro check` → 0 errors, 0 warnings
- [x] `npm run test:e2e` 全 pass (config-converter / qr-reader / jan-code 含む)
- [x] a11y 退化なし (`aria-*` / `role=` / `data-testid=` / `htmlFor=` 削除行 0、reformat の行移動は現コードで存在確認)
- [x] inline style 残存ゼロ (`grep -c "style={{"` = 0 / 0 / 0)
- [x] CSSOM mutation 残存ゼロ (`grep -E "\.style\.[a-zA-Z]+\s*="` で setProperty 以外 = 0)
- [x] PR 6 スコープ未侵害 (`_headers` / `astro.config.mjs` / `src/utils/styles.ts` 未変更)

## VRT

`visual-regression.yml` で baseline 比較 (non-required check)。意図的差分があれば PR ブランチで `update-visual-baseline.yml` を `workflow_dispatch` trigger。

特に確認すべき差分点:

- QrReader `<video>` の `display: none` → `hidden` クラス、初期状態で video が描画されないこと
- QrReader file input: `position: absolute` 視覚消去 → `sr-only` (clip + margin -1) で同等の不可視性
- JanCode `<summary>` hover 時の bg 変化 (CSSOM mutation 撤去後も `.hover-bg-subtle` で bg 変化が見える)
- ConfigConverter schema toggle arrow: `rotate-90` で 90 度回転 (transition-duration 200ms)

## コミット粒度

```

<SHA> docs(progress): #176 B 案 PR 5a (#XXX) の状態を反映
<SHA> test(migration): MIGRATED_FILES に PR 5a 対象 3 件追加
<SHA> refactor(tools): #176 B 案 PR 5a — JanCode.tsx inline style 撤去 + summary hover を CSS に移行
<SHA> refactor(tools): #176 B 案 PR 5a — QrReader.tsx inline style 撤去 + module-level スタイル定数解体
<SHA> refactor(tools): #176 B 案 PR 5a — ConfigConverter.tsx inline style 撤去
<SHA> chore(spec): #176 B 案 PR 5a spec / plan / global.css foundation

```

## 関連

- 起源 issue: #176 (アプローチ B)
- 前提 PR: #249 (A-1) / #254 (VRT) / #256 (PR 1) / #261 (PR 1.5) / #272 (PR 2) / #275 (PR 3) / #277 (PR 4) / #278 (前段 infra)
- 後続: PR 5b (Base64Codec + JsonCsv + JsonXml + QrCode + UlidGenerator + zero-style 登録 + ulid-generator E2E + #262 close) / PR 6 (flip + cleanup)
EOF
```

- [ ] **Step 2**: push

```bash
git push -u origin feature/issue-176-b5a-config-qr-jan
```

- [ ] **Step 3**: PR 作成 (`--base develop` を **必ず** 明示、`--body-file` で本文渡し)

```bash
gh pr create --base develop \
  --title "refactor(tools): #176 B 案 PR 5a — ConfigConverter + QrReader + JanCode inline style 撤去" \
  --body-file /tmp/claude/pr_body_b5a.md
```

Expected: PR URL を取得 → user に提示 + `#XXX` を Task 2.7 に渡す。

### Task 2.7: progress doc 更新 (PR 番号確定後)

- [ ] **Step 1**: PR 番号 (`#XXX`) を反映して `docs/projects/issue-176-b-plan-progress.md` を更新
  - 進捗状況テーブル: PR 5a 行を `🔄 PR open + #XXX link` に
  - 着手済 PR 履歴: PR 5a (#XXX) section を追加 (新規 class / 再利用 / race 回避運用 / CSSOM refactor の特記含む)

- [ ] **Step 2**: prettier 自動 fix

```bash
npx prettier --write docs/projects/issue-176-b-plan-progress.md
```

- [ ] **Step 3**: commit

```bash
git add docs/projects/issue-176-b-plan-progress.md
git commit -m "$(cat <<'EOF'
docs(progress): #176 B 案 PR 5a (#XXX) の状態と特記事項を反映

PR 3-4 経験を踏まえ merge 待ちの間も SoT を current 化する運用。

更新内容:
- 進捗状況テーブル: PR 5a を 🔄 PR open + #XXX link に変更
- 着手済 PR 履歴: PR 5a (#XXX) section を追加
  - 新規 class .qr-video-preview の 1 件のみ
  - JanCode hover は PR 4 既存 .hover-bg-subtle 再利用
  - QrReader module-level スタイル定数 4 個全削除
  - subagent 非 commit 運用 2 回目、安定運用確認

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
- [ ] **Step 3**: review 指摘があればまとめて対応 commit を 1 件 push (PR 3-4 同様)
- [ ] **Step 4**: merge 後の cleanup (memory `feedback_worktree_merge_order.md` に従う)

```bash
# 順序: gh pr merge --delete-branch の **前** に worktree remove
cd /Users/fumta/projects/devtools
git worktree remove .claude/worktrees/issue-176-b5a
git branch -D feature/issue-176-b5a-config-qr-jan 2>&1 || true  # 既に消えている場合あり
gh pr merge XXX --squash --delete-branch
git checkout develop && git pull origin develop
```

---

## Subagent prompt template

各 subagent には以下要素を **必ず** 含める:

1. **作業ディレクトリ**: `/Users/fumta/projects/devtools/.claude/worktrees/issue-176-b5a`
2. **担当ファイル list** (変更可能 / 触ってはいけない)
3. **spec 該当 section の reference** (`docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md` § N)
4. **既存 class 一覧** (Phase 0 で `.qr-video-preview` 追加済、他は PR 1〜4 既存)
5. **自己検証コマンド**: `npm run test -- <該当 test path>` + `npx astro check`
6. **やってはいけないこと**:
   - `git add` / `git commit` (親が Phase 1.5 で実施)
   - `git push` / `gh pr create`
   - `npm run test:vrt` (memory `feedback_vrt_ci_only.md`)
   - `npm run test:e2e` (時間かかる、親が Phase 2 で確認)
   - 他 Track のファイル変更
   - `src/utils/styles.ts` 削除 (PR 6 スコープ)
   - `src/styles/global.css` 編集 (Phase 0 で foundation commit 済、追加 class 不要)
7. **完了報告フォーマット**:
   - status: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
   - 変更ファイル list (`git diff --name-only`)
   - 自己検証結果 (vitest / astro check)
   - 残課題

### Track A subagent prompt 骨子

```
作業ディレクトリ: /Users/fumta/projects/devtools/.claude/worktrees/issue-176-b5a

タスク: src/components/tools/ConfigConverter.tsx の inline style を spec §1 に従い撤去する。

参照:
- spec: docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md (§1.1〜1.7)
- 既存パターン: src/components/tools/EncodingConverter.tsx (PR 4 の dropzone label / 警告カード class 化)、src/components/tools/JwtDecoder.tsx (PR 3 の details/summary 構造)
- global.css: PR 5a 用 .qr-video-preview は HEAD~1 (Phase 0 commit) で foundation commit 済。本 Track では使わない (QrReader 専用)
- 利用可能な既存 class (PR 1〜4 で導入済): caption / body-emphasis / text-default / text-muted / text-link-color / text-error-text / bg-warning-tint / border-default / border-input / btn-link-plain / alert-success / alert-error 等

変更可能なファイル:
- src/components/tools/ConfigConverter.tsx (本体)

触ってはいけないファイル:
- src/components/tools/__tests__/* (logic test、変更不要)
- src/utils/styles.ts (PR 6 スコープ)
- src/styles/global.css (Phase 0 commit 済、新 class 追加不要)
- src/components/tools/QrReader.tsx (Track B)
- src/components/tools/JanCode.tsx (Track C)
- tests/e2e/* (本 PR で gate 追加せず)

完了基準:
- grep -c "style={{" src/components/tools/ConfigConverter.tsx → 0
- grep "from '@/utils/styles'" src/components/tools/ConfigConverter.tsx → 0
- npm run test (unit、ConfigConverter 関連) で pass、astro check で 0 errors
- npx astro check → 0 errors

やってはいけないこと:
- git add / git commit (親が Phase 1.5 で実施、subagent は commit せず)
- git push / gh pr create
- npm run test:vrt
- npm run test:e2e (親が Phase 2 で実行)
- 上記の "触ってはいけないファイル" の変更
- src/styles/global.css への class 追加 (Phase 0 で完了済、不足あれば親 Opus に報告)

完了後 報告: status + 変更ファイル list + 自己検証結果 (vitest / astro check 出力要約) + 残課題
```

### Track B subagent prompt 骨子

```
作業ディレクトリ: /Users/fumta/projects/devtools/.claude/worktrees/issue-176-b5a

タスク: src/components/tools/QrReader.tsx の inline style + module-level スタイル定数 4 個を spec §2 に従い撤去する。

参照:
- spec: docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md (§2.1〜2.11)
- 既存パターン: src/components/tools/qr-ticket/VerifyTab.tsx (PR 2 の sr-only file input + .qr-file-picker-label)、src/components/tools/Gs1Databar.tsx (PR 4 の hover 表現)
- global.css: 本 PR で Phase 0 commit 済の .qr-video-preview を <video> で利用
- 利用可能な既存 class: caption / text-default / text-muted / text-on-primary / text-error / bg-default / bg-subtle / bg-warning-tint / bg-error-tint / border-default / border-input + Tailwind auto-utility (border-warning / border-error / bg-primary)
- D5 採用案: module-level 定数 4 個 (rescanButtonStyle / startCameraButtonStyle / stopCameraButtonStyle / uploadLabelStyle) を全削除して consumer 側 className 化
- D2 採用案: file input を Tailwind sr-only に置換
- D6 採用案: uploadLabelStyle(false) 呼び出しなしを事前確認の上、disabled 分岐削除

変更可能なファイル:
- src/components/tools/QrReader.tsx (本体)

触ってはいけないファイル:
- src/components/tools/__tests__/* (logic test、変更不要)
- src/hooks/useQrCamera.ts (logic、本 PR スコープ外)
- src/utils/styles.ts (PR 6 スコープ)
- src/styles/global.css (Phase 0 commit 済)
- src/components/tools/ConfigConverter.tsx (Track A)
- src/components/tools/JanCode.tsx (Track C)
- tests/e2e/* (本 PR で gate 追加せず)

完了基準:
- grep -c "style={{" src/components/tools/QrReader.tsx → 0
- grep "from '@/utils/styles'" src/components/tools/QrReader.tsx → 0
- grep -E "^const (rescan|startCamera|stopCamera|uploadLabel)" src/components/tools/QrReader.tsx → 0 (module-level 定数全削除)
- file input が className="sr-only" になっていること
- uploadLabelStyle 関数自体が削除され、label の className が consumer 側で直接構成されていること
- React named import (React.ChangeEvent 等) は維持
- npm run test (unit、QrReader 関連) で pass、astro check で 0 errors
- npx astro check → 0 errors

やってはいけないこと:
- git add / git commit (親が Phase 1.5 で実施)
- git push / gh pr create
- npm run test:vrt
- npm run test:e2e
- 上記の "触ってはいけないファイル" の変更
- src/styles/global.css への class 追加
- camera API logic の変更 (useQrCamera 経由のまま)

完了後 報告: status + 変更ファイル list + 自己検証結果 + 残課題
```

### Track C subagent prompt 骨子

```
作業ディレクトリ: /Users/fumta/projects/devtools/.claude/worktrees/issue-176-b5a

タスク: src/components/tools/JanCode.tsx の inline style + e.currentTarget.style.X CSSOM mutation を spec §3 に従い撤去する。

参照:
- spec: docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md (§3.1〜3.6)
- 既存パターン: src/components/tools/Gs1Databar.tsx (PR 4 の summary-no-marker / hover-bg-subtle 利用、CSSOM mutation 撤去 pattern)
- global.css: PR 4 で導入済の .summary-no-marker / .hover-bg-subtle を再利用 (新規 class 不要)
- 利用可能な既存 class: caption / body-emphasis / text-default / text-muted / text-primary / bg-default / bg-surface / border-default / summary-no-marker / hover-bg-subtle
- D7 採用案: onMouseEnter/onMouseLeave を完全削除し、Tailwind hover: variant ではなく専用 .hover-bg-subtle class (PR 4) で表現 (memory feedback_tailwind_v4_layer_variant.md 参照)

変更可能なファイル:
- src/components/tools/JanCode.tsx (本体)

触ってはいけないファイル:
- src/components/tools/__tests__/* (logic test、変更不要)
- src/utils/styles.ts (PR 6 スコープ)
- src/styles/global.css (Phase 0 commit 済)
- src/components/tools/ConfigConverter.tsx (Track A)
- src/components/tools/QrReader.tsx (Track B)
- tests/e2e/* (本 PR で gate 追加せず)

完了基準:
- grep -c "style={{" src/components/tools/JanCode.tsx → 0
- grep "from '@/utils/styles'" src/components/tools/JanCode.tsx → 0
- grep -E "\.style\.[a-zA-Z]+\s*=" src/components/tools/JanCode.tsx | grep -v setProperty → 0 (CSSOM mutation 全消去)
- onMouseEnter / onMouseLeave attribute は完全削除
- <summary> の className に "summary-no-marker hover-bg-subtle" が含まれていること
- 完成コード行に tracking-[0.1em] が含まれていること
- npm run test (unit、JanCode 関連) で pass、astro check で 0 errors
- npx astro check → 0 errors

やってはいけないこと:
- git add / git commit (親が Phase 1.5 で実施)
- git push / gh pr create
- npm run test:vrt
- npm run test:e2e
- 上記の "触ってはいけないファイル" の変更
- src/styles/global.css への class 追加
- Tailwind variant `hover:bg-subtle` の使用 (silent regression、memory feedback_tailwind_v4_layer_variant.md 参照)

完了後 報告: status + 変更ファイル list + 自己検証結果 + 残課題
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
- `feedback_tailwind_v4_layer_variant.md` (Tailwind hover: variant が @layer components 手書き class に効かない件、JanCode で `.hover-bg-subtle` 専用 class を使う根拠)

---

## Phase 1 開始判定

Phase 0 commit 完了 + worktree の `npm ci` 完了を確認したら Phase 1 dispatch。3 Track が独立ファイル + commit せず方針のため **同時並列 dispatch** で OK (race 不可能)。
