# #176 B 案 PR 4 実装計画書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**: `Gs1Databar.tsx` (20 件) + `EncodingConverter.tsx` (20 件) + `DummyText.tsx` (13 件) + Gs1Databar 内 `e.currentTarget.style.X = Y` 9 件を撤去し、`@layer components` の意味クラス + Tailwind utility (`hover:` modifier 含む) に置換する。

**Architecture**: PR 1〜3 で確立した「`@layer components` への意味クラス追加 + Tailwind utility」pattern を継承。**新規 class は `.summary-no-marker` の 1 件のみ** (95% 以上を既存 class でカバー)。Phase 0 (親 Opus) で foundation commit、Phase 1 で sonnet subagent 3 並列、**Phase 1.5 で親 Opus が順次 commit (PR 3 の race 反省)**、Phase 2 で MIGRATED_FILES + 検証 + PR 作成。

**Tech Stack**: TypeScript / React 19 / Astro 5 / Tailwind CSS 4 / Vitest / Playwright

**作成日**: 2026-05-07
**Spec**: `docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md`
**ブランチ**: `feature/issue-176-b4-gs1-encoding-dummy`
**Worktree**: `.claude/worktrees/issue-176-b4`
**Base**: `origin/develop` (PR 3 #275 merge 後の最新)

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

| File                                                          | Phase | 担当    | 変更内容                                                         |
| ------------------------------------------------------------- | ----- | ------- | ---------------------------------------------------------------- |
| `docs/superpowers/specs/2026-05-07-...-design.md`             | 0     | 親 Opus | spec をブランチ最初の commit として配置                          |
| `docs/superpowers/plans/2026-05-07-...-gs1-encoding-dummy.md` | 0     | 親 Opus | plan を spec と同 commit で配置                                  |
| `src/styles/global.css`                                       | 0     | 親 Opus | `@layer components` に `.summary-no-marker` 1 件追加             |
| `src/components/tools/Gs1Databar.tsx`                         | 1     | Track A | inline style 20 件除去 + CSSOM hover 9 件除去 + import 整理      |
| `src/components/tools/EncodingConverter.tsx`                  | 1     | Track B | inline style 20 件除去 + import 整理                             |
| `src/components/tools/DummyText.tsx`                          | 1     | Track C | inline style 13 件除去 + import 整理                             |
| `src/utils/__tests__/inline-style-migration.test.ts`          | 2     | 親 Opus | `MIGRATED_FILES` array に 3 件追加 (合計 21 件)                  |
| `docs/projects/issue-176-b-plan-progress.md`                  | 2     | 親 Opus | PR 4 状態を current 化 (PR 3 経験を踏まえ merge 待ち間 SoT 反映) |

**触らない**:

- `src/components/tools/__tests__/*.test.ts` (logic test、本 PR の class 化は DOM 構造非変更)
- `src/utils/styles.ts` (PR 6 で削除、本 PR は import 削除のみ)
- `src/utils/csp.ts` / `public/_headers` (PR 6 で strict 化)
- `tests/e2e/*.spec.ts` (本 PR で applyProductionCsp gate 追加せず)

---

## Phase 0 — 親 Opus 直接実行

### Task 0.1: Worktree 作成

- [ ] **Step 1**: 現在のブランチが `develop` で clean state であることを確認

```bash
git status
git branch --show-current
# Expected: clean / develop
```

- [ ] **Step 2**: origin/develop の最新を fetch

```bash
git fetch origin develop
git rev-parse origin/develop HEAD
# Expected: 同じ SHA (PR 3 merge 後)
```

- [ ] **Step 3**: worktree を作成 (`origin/develop` ベースを **明示**)

```bash
git worktree add .claude/worktrees/issue-176-b4 origin/develop -b feature/issue-176-b4-gs1-encoding-dummy
```

- [ ] **Step 4**: worktree で `npm ci` 実行

```bash
cd .claude/worktrees/issue-176-b4 && npm ci
```

Expected: `node_modules` が worktree に存在し vitest / playwright が解決可能。

### Task 0.2: spec / plan ファイル配置

- [ ] **Step 1**: develop 側で書いた spec / plan を worktree にコピー

```bash
cp docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md \
   .claude/worktrees/issue-176-b4/docs/superpowers/specs/
cp docs/superpowers/plans/2026-05-07-issue-176-b4-gs1-encoding-dummy.md \
   .claude/worktrees/issue-176-b4/docs/superpowers/plans/
```

- [ ] **Step 2**: develop 側の untracked spec / plan を削除

```bash
rm docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md
rm docs/superpowers/plans/2026-05-07-issue-176-b4-gs1-encoding-dummy.md
```

### Task 0.3: global.css に .summary-no-marker 追記

worktree で作業 (以下すべて `.claude/worktrees/issue-176-b4` 内)。

- [ ] **Step 1**: `src/styles/global.css` の末尾 `@layer components { ... }` ブロックの閉じ `}` の **直前** に下記を追記

```css
/* === PR 4: Gs1Databar <details>/<summary> marker hide === */
.summary-no-marker {
  list-style: none;
}
.summary-no-marker::-webkit-details-marker {
  display: none;
}
```

- [ ] **Step 2**: 重複なし確認

```bash
grep -n "summary-no-marker" src/styles/global.css
# Expected: 2 行 (.summary-no-marker { と .summary-no-marker::-webkit-details-marker {)
```

- [ ] **Step 3**: vitest 一部実行で global.css 読み込みが壊れていないか確認

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts
# Expected: 既存 18 ファイルの migration test pass + 陽性対照 3 件 pass
```

### Task 0.4: Phase 0 commit

- [ ] **Step 1**: stage + commit

```bash
git add docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md \
        docs/superpowers/plans/2026-05-07-issue-176-b4-gs1-encoding-dummy.md \
        src/styles/global.css

git commit -m "$(cat <<'EOF'
chore(spec): #176 B 案 PR 4 spec / plan / global.css foundation

Phase 0: spec / plan 配置 + global.css @layer components に
Gs1Databar <details>/<summary> 用 .summary-no-marker class 1 件を追加。

PR 1〜3 で導入済の class (caption, body-emphasis, text-default, text-muted,
bg-default, bg-subtle, bg-surface, border-default, border-input,
bg-error-tint, bg-success-tint, text-error, text-error-text, text-success,
text-primary, text-link-color 等) を再利用するため新規 class は最小限 1 件のみ。

Phase 1 (sonnet 並列 × 3 Track) で Gs1Databar / EncodingConverter / DummyText
の migration を進める。Race 回避のため subagent は commit せず、
Phase 1.5 で親 Opus が順次 commit する運用 (PR 3 の race 反省)。

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

### Track A: `Gs1Databar.tsx` migration (20 件 + 9 hover refactor)

- [ ] **Step 1**: subagent prompt 作成 (下記 §Subagent prompt template の Track A 参照)
- [ ] **Step 2**: Agent dispatch (`model: "sonnet"`)
- [ ] **Step 3**: 完了報告受領 (status / 変更ファイル list / self-verification 結果)

**Track A 完了基準**:

- [ ] `grep -c "style={{" src/components/tools/Gs1Databar.tsx` → **0**
- [ ] `grep "from '@/utils/styles'" src/components/tools/Gs1Databar.tsx` → 0
- [ ] `grep -E "\.style\.[a-zA-Z]+\s*=" src/components/tools/Gs1Databar.tsx | grep -v setProperty` → 0 (CSSOM mutation 全消去)
- [ ] subagent が `npm run test -- src/components/tools/__tests__/` で関連 test pass を確認
- [ ] subagent が `npx astro check` で 0 errors 確認
- [ ] **commit していないこと** (`git log --oneline -1` が Phase 0 commit のままであること)

### Track B: `EncodingConverter.tsx` migration (20 件)

- [ ] **Step 1**: subagent prompt 作成 (下記 §Subagent prompt template の Track B 参照)
- [ ] **Step 2**: Agent dispatch (`model: "sonnet"`)
- [ ] **Step 3**: 完了報告受領

**Track B 完了基準**:

- [ ] `grep -c "style={{" src/components/tools/EncodingConverter.tsx` → **0**
- [ ] `grep "from '@/utils/styles'" src/components/tools/EncodingConverter.tsx` → 0
- [ ] subagent が astro check / 関連 test の pass 確認
- [ ] **commit していないこと**

### Track C: `DummyText.tsx` migration (13 件)

- [ ] **Step 1**: subagent prompt 作成 (下記 §Subagent prompt template の Track C 参照)
- [ ] **Step 2**: Agent dispatch (`model: "sonnet"`)
- [ ] **Step 3**: 完了報告受領

**Track C 完了基準**:

- [ ] `grep -c "style={{" src/components/tools/DummyText.tsx` → **0**
- [ ] `grep "from '@/utils/styles'" src/components/tools/DummyText.tsx` → 0
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
#   modified: src/components/tools/Gs1Databar.tsx
#   modified: src/components/tools/EncodingConverter.tsx
#   modified: src/components/tools/DummyText.tsx

git log --oneline -2
# Expected: HEAD = Phase 0 chore(spec) commit
```

- [ ] **Step 2**: 各ファイルの inline style 残存ゼロ確認

```bash
grep -c "style={{" src/components/tools/Gs1Databar.tsx \
                   src/components/tools/EncodingConverter.tsx \
                   src/components/tools/DummyText.tsx
# Expected: 全て 0
```

### Task 1.5.2: Track A (Gs1Databar) commit

- [ ] **Step 1**: Gs1Databar.tsx のみ stage

```bash
git add src/components/tools/Gs1Databar.tsx
```

- [ ] **Step 2**: 想定通りのファイルのみ staged であることを確認

```bash
git status --short
# Expected: M src/components/tools/Gs1Databar.tsx (1 行のみ M)
#           その他は ??? や M (unstaged) のまま
```

- [ ] **Step 3**: commit

```bash
git commit -m "$(cat <<'EOF'
refactor(tools): #176 B 案 PR 4 — Gs1Databar.tsx inline style 撤去 + hover を CSS に移行

inline style 20 件を @layer components の class + Tailwind utility に置換。
e.currentTarget.style.background mutation (onMouseEnter/onMouseLeave で
hover bg を直接書き換え) 9 件を全て削除し、Tailwind hover: modifier
(hover:bg-error-tint / hover:bg-subtle / hover:bg-blue-50) で表現。

GTIN-14 文字間隔は tracking-[0.1em] arbitrary value、
<details>/<summary> marker は .summary-no-marker class、
カード追加ボタンの hover bg は hover:bg-blue-50 (--color-blue-50 token).

import { bodyEmphasis, caption, colors } from '@/utils/styles' を削除。

ref: docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md §1

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

### Task 1.5.3: Track B (EncodingConverter) commit

- [ ] **Step 1**: EncodingConverter.tsx のみ stage

```bash
git add src/components/tools/EncodingConverter.tsx
git status --short
# Expected: M src/components/tools/EncodingConverter.tsx + M src/components/tools/DummyText.tsx (unstaged)
```

- [ ] **Step 2**: commit

```bash
git commit -m "$(cat <<'EOF'
refactor(tools): #176 B 案 PR 4 — EncodingConverter.tsx inline style 撤去

inline style 20 件を @layer components の class + Tailwind utility に置換。
ファイル選択 dropzone (border-dashed)、判定結果カード、変換設定 / 出力
hex preview の全ての style 属性を class 化。

import { caption, colors } from '@/utils/styles' を削除。

ref: docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md §2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

### Task 1.5.4: Track C (DummyText) commit

- [ ] **Step 1**: DummyText.tsx のみ stage

```bash
git add src/components/tools/DummyText.tsx
```

- [ ] **Step 2**: commit

```bash
git commit -m "$(cat <<'EOF'
refactor(tools): #176 B 案 PR 4 — DummyText.tsx inline style 撤去

inline style 13 件を @layer components の class + Tailwind utility に置換。
<input type="number"> 2 箇所の border-input / outline-none / bg-default
構造、結果テキストの leading-[1.8] arbitrary value で行間維持。

outline-none は global の :focus-visible rule で focus ring が復活する
ため a11y 退化なし。

import { bodyEmphasis, caption, colors } from '@/utils/styles' を削除。

ref: docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md §3

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3**: 3 commit に正しく split されたか確認

```bash
git log --oneline -5
# Expected:
# <SHA> refactor(tools): #176 B 案 PR 4 — DummyText.tsx inline style 撤去
# <SHA> refactor(tools): #176 B 案 PR 4 — EncodingConverter.tsx inline style 撤去
# <SHA> refactor(tools): #176 B 案 PR 4 — Gs1Databar.tsx inline style 撤去 + hover を CSS に移行
# <SHA> chore(spec): #176 B 案 PR 4 spec / plan / global.css foundation
# 26a8c67 chore(docs): #176 B 案 progress tracker を Claude memory から repo に移行 (#274) <- これは違うかも
```

(注: `26a8c67` は PR 3 merge 前のもの。PR 3 #275 merge 後の develop は `1150883`。HEAD~5 が `1150883` 想定)

```bash
git show --stat HEAD HEAD~1 HEAD~2 | head -30
# Each commit が 1 ファイルのみ変更していることを確認
```

---

## Phase 2 — 親 Opus 直接実行 (統合 + 検証 + PR)

### Task 2.1: MIGRATED_FILES 追加

- [ ] **Step 1**: `src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array に 3 件追加

`'src/components/tools/UuidV7Generator.tsx',` の **後** に下記を追加:

```ts
  // PR 4 で追加
  'src/components/tools/Gs1Databar.tsx',
  'src/components/tools/EncodingConverter.tsx',
  'src/components/tools/DummyText.tsx',
```

- [ ] **Step 2**: migration test pass 確認

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts
# Expected: 21 ファイルの migration test 全 pass + 陽性対照 3 件 pass = 計 45 件 pass
```

- [ ] **Step 3**: commit

```bash
git add src/utils/__tests__/inline-style-migration.test.ts
git commit -m "$(cat <<'EOF'
test(migration): MIGRATED_FILES に PR 4 対象 3 件追加

Gs1Databar.tsx / EncodingConverter.tsx / DummyText.tsx の
inline style 撤去完了に伴い progressive migration tracker に追加
(18 → 21 件)。

ref: docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md §5

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 2.2: SoT (progress doc) 更新

- [ ] **Step 1**: `docs/projects/issue-176-b-plan-progress.md` を更新 (PR 3 と同パターン、merge 待ち間 SoT current 化)

進捗状況テーブルの PR 4 行を更新:

```markdown
| PR 4 | Gs1Databar + EncodingConverter + DummyText | 🔄 PR open | [#XXX](https://github.com/fumtas1k/devtools/pull/XXX) |
```

(`#XXX` は Task 2.6 で取得した PR 番号、後で書き換え)

着手済 PR 履歴に PR 4 section を追加:

```markdown
### PR 4 (#XXX)

- **特殊事項**: Gs1Databar 内で `e.currentTarget.style.X = Y` 形式の CSSOM hover state mutation 9 件を Tailwind `hover:` modifier に refactor。inline style と同等の hover 挙動を CSS で表現
- **race 回避運用**: PR 3 の commit 結合 race 反省を踏まえ、subagent は commit せず親 Opus が Phase 1.5 で順次 commit する方式を初採用 (memory `feedback_subagent_workflow.md` に追記候補)
```

- [ ] **Step 2**: 一旦 PR 番号未確定で commit せず、Phase 2 の最後 (PR 作成後) に PR 番号を確定して 1 commit に集約。本 step は **skip** し、Task 2.7 で実施。

### Task 2.3: ローカル必須ゲート (subagent 報告は信頼せず親が直接実行)

- [ ] **Step 1**: vitest 全 pass

```bash
npm run test
# Expected: 全 unit test pass、migration test 21 件 × 2 + 陽性対照 3 件 = 45 件 pass 含む
```

- [ ] **Step 2**: TypeScript 型チェック

```bash
npx astro check
# Expected: 0 errors, 0 warnings
```

- [ ] **Step 3**: E2E 全 pass (`feedback_e2e_before_pr.md`、PR 作成前必須)

```bash
npm run test:e2e
# Expected: 全 spec pass (gs1-databar / encoding-converter / dummy-text 含む)
```

E2E は build + preview を直列起動するため数分かかる。フォアグラウンドで実行して全 pass を確認する。

### Task 2.4: a11y 退化検知

- [ ] **Step 1**: aria-\* / role= / data-testid= / htmlFor= 削除行が無いこと

```bash
git diff origin/develop -- src/components/tools/Gs1Databar.tsx \
                           src/components/tools/EncodingConverter.tsx \
                           src/components/tools/DummyText.tsx \
  | grep -E '^-.*(aria-|role=|data-testid=|htmlFor=)' | grep -vE '^---|^\+\+\+'
# Expected: 出力 0 行
# (reformat による行移動の "削除行" が出る場合は現コードで grep 確認、PR 3 と同運用)
```

- [ ] **Step 2**: 万が一何か "削除" 行が出た場合、現コードで存在を grep 確認

```bash
grep -n "data-testid\|aria-label\|aria-live\|role=" src/components/tools/Gs1Databar.tsx | head -10
grep -n "data-testid\|aria-label\|htmlFor=" src/components/tools/EncodingConverter.tsx | head -10
grep -n "htmlFor=\|aria-label" src/components/tools/DummyText.tsx | head -10
# Expected: PR 3 と同じく diff の "削除行" が現コードに維持されていれば OK
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
# docs/superpowers/plans/2026-05-07-issue-176-b4-gs1-encoding-dummy.md
# docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md
# src/components/tools/DummyText.tsx
# src/components/tools/EncodingConverter.tsx
# src/components/tools/Gs1Databar.tsx
# src/styles/global.css
# src/utils/__tests__/inline-style-migration.test.ts
```

### Task 2.6: push + PR 作成

- [ ] **Step 1**: PR 本文を `/tmp/claude/pr_body_b4.md` に書き出し (CLAUDE.md 6.1: `--body-file` 必須)

```bash
mkdir -p /tmp/claude
cat > /tmp/claude/pr_body_b4.md <<'EOF'
## 概要

`#176` B 案バッチの PR 4。`Gs1Databar.tsx` (20 件) + `EncodingConverter.tsx` (20 件) + `DummyText.tsx` (13 件) の JSX inline style + Gs1Databar 内 `e.currentTarget.style.X = Y` 形式の CSSOM 直接 mutation 9 件 (`onMouseEnter`/`onMouseLeave` hover state) を `@layer components` の意味クラス + Tailwind utility (`hover:` modifier 含む) に置換する。

- spec: `docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md`
- plan: `docs/superpowers/plans/2026-05-07-issue-176-b4-gs1-encoding-dummy.md`
- バッチ進捗: `docs/projects/issue-176-b-plan-progress.md`

## 主要な変更

### `src/styles/global.css` 追加 class (1 件のみ)

- `.summary-no-marker` (Gs1Databar `<details>/<summary>` の marker 非表示、`list-style: none` + `::-webkit-details-marker { display: none }`)

PR 1〜3 で導入済の class (`caption` / `body-emphasis` / `text-default` / `text-muted` / `bg-default` / `bg-subtle` / `bg-surface` / `border-default` / `border-input` / `bg-error-tint` / `text-error` / `text-primary` / `text-link-color` 等) で 95% 以上をカバー。

### `Gs1Databar.tsx` (20 件 + 9 件 hover refactor → 0)

- `<details>/<summary>` marker 非表示を `.summary-no-marker` class に集約
- GTIN-14 文字間隔は `tracking-[0.1em]` arbitrary value
- `onMouseEnter`/`onMouseLeave` で `e.currentTarget.style.background = ...` していた 9 件 (4 button + 1 summary) を全て削除し、Tailwind `hover:bg-error-tint` / `hover:bg-subtle` / `hover:bg-blue-50` の `hover:` modifier で表現
- `import { bodyEmphasis, caption, colors } from '@/utils/styles'` を削除

### `EncodingConverter.tsx` (20 件 → 0)

- ファイル選択 dropzone を `border border-dashed border-default bg-subtle` で表現
- 判定結果カード / 変換設定 / hex preview を全て既存 class + Tailwind 標準 utility に置換
- 新規 class 追加なし
- `import { caption, colors } from '@/utils/styles'` を削除

### `DummyText.tsx` (13 件 → 0)

- `<input type="number">` 2 箇所を `border border-input outline-none bg-default text-default` に置換 (global の `:focus-visible` rule が a11y 担保)
- 結果テキストの行間は `leading-[1.8]` arbitrary value
- 新規 class 追加なし
- `import { bodyEmphasis, caption, colors } from '@/utils/styles'` を削除

## Race 回避運用 (PR 3 反省)

PR 3 で sonnet 並列 dispatch 時に commit が結合される race が発生 (Track A の prettier hook が Track B のファイルを巻き込み、commit message と内容が不一致になった事案)。本 PR では下記方針で **race 自体を防いだ**:

- subagent は **ファイル編集 + self-verification (vitest, astro check) のみ** 実施
- subagent は `git add` / `git commit` を実行しない
- 親 Opus が Phase 1.5 で 1 ファイルずつ stage + commit (3 commit、各 1 ファイル変更)

結果: commit message と内容が完全一致、prettier 巻き込みも親が制御。

## 検証ログ (親 Opus 直接実行)

- [x] `npm run test` 全 pass (migration test 21 件 × 2 + 陽性対照 3 件 = 45 件 pass 含む)
- [x] `npx astro check` → 0 errors, 0 warnings
- [x] `npm run test:e2e` 全 pass (gs1-databar / encoding-converter / dummy-text 含む)
- [x] a11y 退化なし (`aria-*` / `role=` / `data-testid=` / `htmlFor=` 削除行 0、reformat の行移動は現コードで存在確認)
- [x] inline style 残存ゼロ (`grep -c "style={{"` = 0 / 0 / 0)
- [x] CSSOM mutation 残存ゼロ (`grep -E "\.style\.[a-zA-Z]+\s*="` で setProperty 以外 = 0)
- [x] PR 6 スコープ未侵害 (`_headers` / `astro.config.mjs` / `src/utils/styles.ts` 未変更)

## VRT

`visual-regression.yml` で baseline 比較 (non-required check)。意図的差分があれば PR ブランチで `update-visual-baseline.yml` を `workflow_dispatch` trigger。

## コミット粒度

```

<SHA> docs(progress): #176 B 案 PR 4 (#XXX) の状態を反映
<SHA> test(migration): MIGRATED_FILES に PR 4 対象 3 件追加
<SHA> refactor(tools): #176 B 案 PR 4 — DummyText.tsx inline style 撤去
<SHA> refactor(tools): #176 B 案 PR 4 — EncodingConverter.tsx inline style 撤去
<SHA> refactor(tools): #176 B 案 PR 4 — Gs1Databar.tsx inline style 撤去 + hover を CSS に移行
<SHA> chore(spec): #176 B 案 PR 4 spec / plan / global.css foundation

```

## 関連

- 起源 issue: #176 (アプローチ B)
- 前提 PR: #249 (A-1) / #254 (VRT) / #256 (PR 1) / #261 (PR 1.5) / #272 (PR 2) / #275 (PR 3)
- 後続: PR 5 (QrReader + 残り tools + #262 close + #276 前段 infra) / PR 6 (flip + cleanup)
EOF
```

- [ ] **Step 2**: push

```bash
git push -u origin feature/issue-176-b4-gs1-encoding-dummy
```

- [ ] **Step 3**: PR 作成 (`--base develop` を **必ず** 明示、`--body-file` で本文渡し)

```bash
gh pr create --base develop \
  --title "refactor(tools): #176 B 案 PR 4 — Gs1Databar + EncodingConverter + DummyText inline style 撤去" \
  --body-file /tmp/claude/pr_body_b4.md
```

Expected: PR URL を取得 → user に提示 + `#XXX` を Task 2.7 に渡す。

### Task 2.7: progress doc 更新 (PR 番号確定後)

- [ ] **Step 1**: PR 番号 (`#XXX`) を反映して `docs/projects/issue-176-b-plan-progress.md` を更新
  - 進捗状況テーブル: PR 4 行を `🔄 PR open + #XXX link` に
  - 着手済 PR 履歴: PR 4 (#XXX) section を追加 (race 回避運用の特記含む)

- [ ] **Step 2**: prettier 自動 fix

```bash
npx prettier --write docs/projects/issue-176-b-plan-progress.md
```

- [ ] **Step 3**: commit

```bash
git add docs/projects/issue-176-b-plan-progress.md
git commit -m "$(cat <<'EOF'
docs(progress): #176 B 案 PR 4 (#XXX) の状態と特記事項を反映

PR 3 経験を踏まえ merge 待ちの間も SoT を current 化する運用。

更新内容:
- 進捗状況テーブル: PR 4 を 🔄 PR open + #XXX link に変更
- 着手済 PR 履歴: PR 4 (#XXX) section を追加
  - Gs1Databar の e.currentTarget.style.X CSSOM mutation を Tailwind hover: 化
  - subagent 非 commit 方式の race 回避運用を初採用 (PR 3 の race 反省)

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
- [ ] **Step 3**: review 指摘があればまとめて対応 commit を 1 件 push (PR 3 同様)
- [ ] **Step 4**: merge 後の cleanup (memory `feedback_worktree_merge_order.md` に従う)

```bash
# 順序: gh pr merge --delete-branch の **前** に worktree remove
cd /Users/fumta/projects/devtools
git worktree remove .claude/worktrees/issue-176-b4
git branch -D feature/issue-176-b4-gs1-encoding-dummy 2>&1 || true  # 既に消えている場合あり
gh pr merge XXX --squash --delete-branch
git checkout develop && git pull origin develop
```

---

## Subagent prompt template

各 subagent には以下要素を **必ず** 含める:

1. **作業ディレクトリ**: `/Users/fumta/projects/devtools/.claude/worktrees/issue-176-b4`
2. **担当ファイル list** (変更可能 / 触ってはいけない)
3. **spec 該当 section の reference** (`docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md` § N)
4. **既存 class 一覧** (Phase 0 で `.summary-no-marker` 追加済、他は PR 1〜3 既存)
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
作業ディレクトリ: /Users/fumta/projects/devtools/.claude/worktrees/issue-176-b4

タスク: src/components/tools/Gs1Databar.tsx の inline style + e.currentTarget.style.X CSSOM mutation を spec §1 に従い撤去する。

参照:
- spec: docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md (§1.1〜1.7)
- 既存パターン: src/components/tools/qr-ticket/VerifyTab.tsx (PR 2 の hidden / data- 属性 / class 化)、src/components/tools/JwtDecoder.tsx (PR 3 の variant 化 / badge class 化)
- global.css: PR 4 用 .summary-no-marker は HEAD~1 (Phase 0 commit) で foundation commit 済

変更可能なファイル:
- src/components/tools/Gs1Databar.tsx (本体)

触ってはいけないファイル:
- src/components/tools/__tests__/Gs1Databar.test.* (logic test、変更不要)
- src/utils/styles.ts (PR 6 スコープ)
- src/styles/global.css (Phase 0 commit 済)
- src/components/tools/EncodingConverter.tsx (Track B)
- src/components/tools/DummyText.tsx (Track C)
- tests/e2e/* (本 PR で gate 追加せず)

完了基準:
- grep -c "style={{" src/components/tools/Gs1Databar.tsx → 0
- grep "from '@/utils/styles'" src/components/tools/Gs1Databar.tsx → 0
- grep -E "\.style\.[a-zA-Z]+\s*=" src/components/tools/Gs1Databar.tsx | grep -v setProperty → 0 (CSSOM mutation 全消去)
- onMouseEnter / onMouseLeave attribute は完全削除 (Tailwind hover: で表現)
- npm run test -- src/components/tools/__tests__/ で関連 test pass
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
作業ディレクトリ: /Users/fumta/projects/devtools/.claude/worktrees/issue-176-b4

タスク: src/components/tools/EncodingConverter.tsx の inline style を spec §2 に従い撤去する。

参照:
- spec: docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md (§2.1〜2.4)
- 既存パターン: src/components/tools/UuidV7Generator.tsx (PR 3 で class 化済)、src/components/tools/qr-ticket/VerifyTab.tsx (PR 2 の sr-only file input)
- global.css: PR 1〜3 で導入済の class (caption, body-emphasis, text-default, text-muted, bg-default, bg-subtle, bg-surface, border-default, border-input, text-error 等)

変更可能なファイル:
- src/components/tools/EncodingConverter.tsx (本体)

触ってはいけないファイル:
- src/components/tools/__tests__/EncodingConverter.test.* (logic test、変更不要)
- src/utils/styles.ts (PR 6 スコープ)
- src/styles/global.css (Phase 0 commit 済)
- src/components/tools/Gs1Databar.tsx (Track A)
- src/components/tools/DummyText.tsx (Track C)
- tests/e2e/* (本 PR で gate 追加せず)

完了基準:
- grep -c "style={{" src/components/tools/EncodingConverter.tsx → 0
- grep "from '@/utils/styles'" src/components/tools/EncodingConverter.tsx → 0
- import 行は `import { caption, colors } from '@/utils/styles';` を削除 (bodyEmphasis は EncodingConverter で未 import、確認の上)
- npm run test -- src/utils/__tests__/encoding.test.ts (もしあれば) で関連 test pass、なければ astro check のみ
- npx astro check → 0 errors

やってはいけないこと:
- git add / git commit (親が Phase 1.5 で実施)
- git push / gh pr create
- npm run test:vrt
- npm run test:e2e
- 上記の "触ってはいけないファイル" の変更
- src/styles/global.css への class 追加

完了後 報告: status + 変更ファイル list + 自己検証結果 + 残課題
```

### Track C subagent prompt 骨子

```
作業ディレクトリ: /Users/fumta/projects/devtools/.claude/worktrees/issue-176-b4

タスク: src/components/tools/DummyText.tsx の inline style を spec §3 に従い撤去する。

参照:
- spec: docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md (§3.1〜3.2)
- 既存パターン: src/components/tools/UuidV7Generator.tsx (PR 3)、src/components/ui/InputField.tsx (PR 1.5 の input styling)
- global.css: PR 1〜3 既存 class (caption, body-emphasis, text-default, text-muted, bg-default, bg-subtle, border-default, border-input)

変更可能なファイル:
- src/components/tools/DummyText.tsx (本体)

触ってはいけないファイル:
- src/components/tools/__tests__/DummyText.test.* (logic test、変更不要)
- src/utils/styles.ts (PR 6 スコープ)
- src/styles/global.css (Phase 0 commit 済)
- src/components/tools/Gs1Databar.tsx (Track A)
- src/components/tools/EncodingConverter.tsx (Track B)
- tests/e2e/* (本 PR で gate 追加せず)

完了基準:
- grep -c "style={{" src/components/tools/DummyText.tsx → 0
- grep "from '@/utils/styles'" src/components/tools/DummyText.tsx → 0
- <input type="number"> 2 箇所が caption + w-32 (or w-20) + border + border-input + outline-none + bg-default + text-default の class 構成
- 結果テキスト <p> が caption + text-default + leading-[1.8] + break-all + whitespace-pre-wrap + m-0 構成
- npm run test -- src/utils/__tests__/dummy-text.test.ts (もしあれば) で関連 test pass、なければ astro check のみ
- npx astro check → 0 errors

やってはいけないこと:
- git add / git commit (親が Phase 1.5 で実施)
- git push / gh pr create
- npm run test:vrt
- npm run test:e2e
- 上記の "触ってはいけないファイル" の変更
- src/styles/global.css への class 追加

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

---

## Phase 1 開始判定

Phase 0 commit 完了 + worktree の `npm ci` 完了を確認したら Phase 1 dispatch。3 Track が独立ファイル + commit せず方針のため **同時並列 dispatch** で OK (race 不可能)。
