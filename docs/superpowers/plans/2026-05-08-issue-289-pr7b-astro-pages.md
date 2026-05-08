# #289 PR 7b — Astro pages inline migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **本 PR の例外**: subagent 委譲はしない。spec § 9「subagent 非委譲、親 Opus 直接実装 + 親直接 E2E」に基づき、親 Opus が全 task を直接実行する (規模 = 7 ファイル / 42 件、置換 pattern が高度に均質で並列分担コストに見合わない、memory `feedback_subagent_verification_trust.md` で高 stakes 検証は親直接を推奨)。

**Goal:** `src/pages/*.astro` 7 ファイル / **42 件**の Astro `<element style="...">` 属性を全廃し、CSS class (Tailwind utility / 既存 `@layer components` 意味クラス / 新規 3 class) に置換する。

**Architecture:** PR 7a で確立した「Astro `style="..."` → class 化 + `@layer components` 集約」パターンを pages/ に適用。新規 3 class (`.section-heading` / `.text-body` / `.scroll-snap-x`) を `src/styles/global.css` に追加し、既存 PR 1〜7a 資産 (`.caption` / `.text-muted` / `.bg-subtle` / `.border-default` / `.text-primary` 等) と Tailwind utility を併用。単発 typography (H1 / hero subtitle / hero card bg / list item / scroll snap item / small label) は arbitrary value で対応 (YAGNI、PR 7a §126 と同 judgement)。

**Tech Stack:** Astro 6.1.5 / Tailwind CSS v4 / Vitest (unit) / Playwright (E2E) / Astro check (type)

**Spec:** `docs/superpowers/specs/2026-05-08-issue-289-pr7b-astro-pages-design.md`

**Branch:** `feature/issue-289-pr7b-astro-pages` (worktree: `.claude/worktrees/issue-289-pr7b/`、base: `origin/develop`)

---

## File Structure

### 編集ファイル (8 ファイル + 1 progress doc)

| ファイル                                     | 編集内容                                                                                                      | inline 件数 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- |
| `src/styles/global.css`                      | 新規 3 class を `@layer components` 末尾 (PR 7a `.drawer-backdrop` 直後) に追加                               | -           |
| `src/pages/index.astro`                      | L29 / L33 / L38 / L53 / L62 / L75 / L87 / L95 / L104 / L107 / L112 / L118 / L124 の `style="..."` を class 化 | 13          |
| `src/pages/about.astro`                      | L23 / L31 / L36 / L47 / L53 / L71 / L82 / L88 / L101 / L107 の `style="..."` を class 化                      | 10          |
| `src/pages/privacy.astro`                    | L24 / L30 / L38 / L43 / L53 / L58 / L68 / L73 / L82 / L87 / L103 / L108 の `style="..."` を class 化          | 12          |
| `src/pages/tools/jwt-decoder.astro`          | L17 / L21 / L25 / L29 の code chip 4 件                                                                       | 4           |
| `src/pages/tools/url-encode.astro`           | L18 の code chip 1 件                                                                                         | 1           |
| `src/pages/tools/json-xml.astro`             | L17 の code chip 1 件                                                                                         | 1           |
| `src/pages/tools/json-csv.astro`             | L18 の code chip 1 件                                                                                         | 1           |
| `docs/projects/issue-176-b-plan-progress.md` | 進捗状況テーブルに PR 7b 行を追加 (Phase 3 で実施)                                                            | -           |

### 新規ファイル

なし (本 PR では spec/plan 起草のみ commit 済、実装は既存ファイル編集)。

---

## Phase 0 — 準備 (親 Opus 直接実行)

### Task 0.1: 進行確認 (worktree / branch / spec / plan / npm ci)

**Files:**

- Read: `docs/superpowers/specs/2026-05-08-issue-289-pr7b-astro-pages-design.md`
- Read: `docs/superpowers/plans/2026-05-08-issue-289-pr7b-astro-pages.md` (本ファイル)

- [ ] **Step 1: worktree path / branch / base 一致確認**

```bash
pwd
git branch --show-current
git rev-parse origin/develop
git merge-base HEAD origin/develop
```

Expected:

- pwd = `/Users/fumta/projects/devtools/.claude/worktrees/issue-289-pr7b`
- branch = `feature/issue-289-pr7b-astro-pages`
- `git rev-parse origin/develop` == `git merge-base HEAD origin/develop` (= `526d276` 系、PR 7a 含)

- [ ] **Step 2: node_modules 整備済確認**

```bash
ls -la node_modules/.bin/prettier node_modules/.bin/astro 2>&1 | head -3
```

Expected: 両方 symlink で存在 (`npm ci` 完了状態、issue #297 起票済の framing 改善は別 PR)。

- [ ] **Step 3: spec commit 確認**

```bash
git log --oneline -3
```

Expected: 最新 commit `357c2f3` が `docs(spec): #289 PR 7b — Astro pages inline 移行 spec 起草 (42 件 / 新規 3 class)`。

### Task 0.2: 事前 grep (PR 7b スコープ inline 件数の baseline 取得)

- [ ] **Step 1: PR 7b スコープ全 7 ファイルで grep**

```bash
grep -rn 'style="' src/pages --include='*.astro' | tee /tmp/claude/pr7b-baseline-grep.log | wc -l
```

Expected: **42 件** (index 13 + privacy 12 + about 10 + jwt-decoder 4 + url-encode 1 + json-xml 1 + json-csv 1)。

- [ ] **Step 2: PR 7b スコープ outside (layout / layouts / ui) で grep — touch 防止のため baseline のみ**

```bash
grep -rn 'style="' src/components src/layouts --include='*.astro' | wc -l
```

Expected: **0 件** (PR 7a で完了済)。

- [ ] **Step 3: src 全体 baseline (本 PR 完了時に 0 になる expected)**

```bash
grep -rn 'style="' src --include='*.astro' | wc -l
```

Expected: **42 件** (Step 1 と一致)。本 PR 完了時に 0 になる。

---

## Phase 1 — 親 Opus 順次実装 (4 commit)

### Task 1.1: `src/styles/global.css` に新規 3 class 追加

**Files:**

- Modify: `src/styles/global.css` (PR 7a 末尾の `.drawer-backdrop` 直後、`@layer components` 閉じ `}` 直前)

- [ ] **Step 1: 現在の global.css 末尾を確認**

```bash
tail -25 src/styles/global.css
```

Expected: PR 7a の `.drawer-backdrop { background: rgba(17, 24, 39, 0.5); }` が line 599-601、`@layer components` 閉じ `}` が line 602。

- [ ] **Step 2: `.drawer-backdrop` 定義の直後に新規 3 class を挿入**

挿入位置: `.drawer-backdrop { background: rgba(17, 24, 39, 0.5); }` の直後、`@layer components` 閉じ `}` の直前。

挿入する内容 (spec § global.css への追加 と完全一致):

```css
/* === PR 7b (#289): Astro pages inline migration helpers === */

/* Section heading: about/privacy h2 + index card title (10 occurrences)
     注: color は class に含めない (10 件中 1 件 = index L112 card title が色無し
     なため、consumer 側で text-default を選択的に併用)。 */
.section-heading {
  font-size: 1.125rem;
  line-height: 1.5;
  letter-spacing: 0.02em;
}

/* Body prose text: about/privacy 本文段落 (8 occurrences、全件 neutral-700)
     注: typography + color baked-in。.footer-bar precedent (PR 7a で
     bg+color combined) に追従。8 件全て neutral-700 で一致するため安全。
     dark mode 対応時に semantic alias 化する想定 (本 PR scope 外)。 */
.text-body {
  font-size: 1rem;
  line-height: 1.8;
  letter-spacing: 0.02em;
  color: var(--color-neutral-700);
}

/* Horizontal scroll snap container: index hero carousel (1 occurrence、5 prop)
     注: 単発だが property 数が多く、Tailwind arbitrary 6連
     (`overflow-x-scroll snap-x snap-mandatory scroll-smooth
     [scrollbar-width:none] [-webkit-overflow-scrolling:touch]`) より
     class 化が読みやすい。PR 7a `.qr-video-preview` と同 judgement
     (単発でも property 数多なら class 化)。 */
.scroll-snap-x {
  overflow-x: scroll;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
```

- [ ] **Step 3: prettier 整形**

```bash
node_modules/.bin/prettier --write src/styles/global.css
```

Expected: `src/styles/global.css ...ms` の output、エラーなし。

- [ ] **Step 4: 構文 sanity check (astro check)**

```bash
node_modules/.bin/astro check 2>&1 | tail -5
```

Expected: `Result (X files): - 0 errors`。

- [ ] **Step 5: migration tracker pass 確認**

`inline-style-migration.test.ts` は `*.tsx` のみ対象なので global.css 編集は影響しないが、念のため:

```bash
npm run test -- inline-style-migration.test.ts 2>&1 | tail -10
```

Expected: 全 test pass。

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css
git commit -m "$(cat <<'EOF'
feat(styles): #289 PR 7b — global.css に新規 3 class 追加

Astro pages inline migration の foundation。

- .section-heading: about/privacy h2 + index card title (1.125rem/1.5/0.02em)
- .text-body: about/privacy 本文段落 (1rem/1.8/0.02em + neutral-700 baked-in)
- .scroll-snap-x: index hero carousel (overflow-x: scroll + snap + webkit prefix)

設計判断:
- .section-heading は色非内包 (10 件中 1 件が色無しのため opt-out コスト回避)
- .text-body は color baked-in (.footer-bar precedent、8 件全て neutral-700 一致)
- .scroll-snap-x は単発 5 prop で arbitrary 6連より class 化が読みやすい

Refs: #289, #176 B 案 PR 7b (spec §global.css への追加)
EOF
)"
```

Expected: pre-commit hook (prettier + astro check) 通過、commit 成立。

### Task 1.2: index.astro inline 撤去 (13 件)

**Files:**

- Modify: `src/pages/index.astro:29,33,38,53,62,75,87,95,104,107,112,118,124`

- [ ] **Step 1: index.astro の現状を再確認**

```bash
sed -n '25,135p' src/pages/index.astro
```

Expected: 13 件の inline style 属性を改めて確認。各行と元 `class` 属性のセットは spec § 1 と plan File Structure に記載済。

- [ ] **Step 2: index.astro を編集 (13 件、書き換え一括)**

各 inline について Edit (Multi 形式) で順次置換。元の `class="..."` 属性を維持し、必要な追加 class を末尾に append、`style="..."` 属性を完全削除。

**置換マップ** (元 → 新):

L27-30 (`<section>` hero card):

```astro
<!-- 元 -->
<section
  class="text-center px-4 py-8"
  style="background: var(--color-background); border-bottom: 1px solid var(--color-blue-100);"
>
  <!-- 新 -->
  <section
    class="text-center px-4 py-8 bg-[var(--color-background)] border-b border-[var(--color-blue-100)]"
  >
  </section>
</section>
```

L31-34 (`<h1>` H1):

```astro
<!-- 元 -->
<h1
  class="mb-2 font-bold"
  style="font-size: 2rem; line-height: 1.4; letter-spacing: 0.01em; color: var(--color-text);"
>
  <!-- 新 -->
  <h1 class="mb-2 font-bold text-[2rem] leading-[1.4] tracking-[0.01em] text-default"></h1>
</h1>
```

L37-39 (`<p>` hero subtitle):

```astro
<!-- 元 -->
<p
  style="font-size: 1rem; line-height: 1.7; letter-spacing: 0.02em; color: var(--color-neutral-600);"
>
  <!-- 新 -->
  <p class="text-base leading-[1.7] tracking-[0.02em] text-[var(--color-neutral-600)]"></p>
</p>
```

L48-54 (`<div>` tab-bar、border-color のみ):

```astro
<!-- 元 -->
<div
  id="tab-bar"
  role="tablist"
  aria-label="カテゴリ絞り込み"
  class="mb-6 flex gap-1 border-b"
  style="border-color: var(--color-border);"
>
  <!-- 新 -->
  <div
    id="tab-bar"
    role="tablist"
    aria-label="カテゴリ絞り込み"
    class="mb-6 flex gap-1 border-b border-default"
  >
  </div>
</div>
```

L55-63 (`<button>` 「すべて」 tab L62 small label):

```astro
<!-- 元 -->
<button
  role="tab"
  id="tab-0"
  aria-selected="true"
  aria-controls="panel-0"
  data-index="0"
  class="tab-btn px-4 py-2 font-bold border-b-2 -mb-px transition-colors"
  style="font-size: 0.875rem; letter-spacing: 0.02em;"
>
  <!-- 新 -->
  <button
    role="tab"
    id="tab-0"
    aria-selected="true"
    aria-controls="panel-0"
    data-index="0"
    class="tab-btn px-4 py-2 font-bold border-b-2 -mb-px transition-colors text-sm tracking-[0.02em]"
  ></button></button
>
```

L66-80 (categories.map `<button>` L75 small label):

```astro
<!-- 元 -->
<button
  role="tab"
  id={`tab-${i + 1}`}
  aria-selected="false"
  aria-controls={`panel-${i + 1}`}
  data-index={i + 1}
  class="tab-btn px-4 py-2 font-bold border-b-2 -mb-px transition-colors"
  style="font-size: 0.875rem; letter-spacing: 0.02em;"
>
  <!-- 新 -->
  <button
    role="tab"
    id={`tab-${i + 1}`}
    aria-selected="false"
    aria-controls={`panel-${i + 1}`}
    data-index={i + 1}
    class="tab-btn px-4 py-2 font-bold border-b-2 -mb-px transition-colors text-sm tracking-[0.02em]"
  ></button></button
>
```

L84-88 (`<div id="panels">` carousel container L87):

```astro
<!-- 元 -->
<div
  id="panels"
  class="flex"
  style="overflow-x: scroll; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; -webkit-overflow-scrolling: touch;"
>
  <!-- 新 -->
  <div id="panels" class="flex scroll-snap-x"></div>
</div>
```

L90-96 (carousel item `<div>` L95):

```astro
<!-- 元 -->
<div
  role="tabpanel"
  id={`panel-${i}`}
  aria-labelledby={`tab-${i}`}
  style="flex: 0 0 100%; scroll-snap-align: start; min-width: 0;"
>
  <!-- 新 -->
  <div
    role="tabpanel"
    id={`panel-${i}`}
    aria-labelledby={`tab-${i}`}
    class="basis-full shrink-0 grow-0 snap-start min-w-0"
  >
  </div>
</div>
```

L101-105 (tool-card `<a>` L104):

```astro
<!-- 元 -->
<a
  href={`/tools/${tool.slug}`}
  class="tool-card rounded-lg p-6 block transition-shadow hover:shadow-md"
  style="background: var(--color-bg); border: 1px solid var(--color-border);"
>
  <!-- 新 -->
  <a
    href={`/tools/${tool.slug}`}
    class="tool-card rounded-lg p-6 block transition-shadow hover:shadow-md bg-default border border-default"
  ></a></a
>
```

L107 (ToolIcon component prop):

```astro
<!-- 元 -->
<ToolIcon slug={tool.slug} size={28} style="color: var(--color-primary);" />

<!-- 新 -->
<ToolIcon slug={tool.slug} size={28} class="text-primary" />
```

L110-113 (`<h2>` card title L112):

```astro
<!-- 元 -->
<h2
  class="tool-card-title mb-2 font-bold transition-colors"
  style="font-size: 1.125rem; line-height: 1.5; letter-spacing: 0.02em;"
>
  <!-- 新 -->
  <h2 class="tool-card-title mb-2 font-bold transition-colors section-heading"></h2>
</h2>
```

L116-119 (`<p>` card description L118):

```astro
<!-- 元 -->
<p
  class="mb-4"
  style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em; color: var(--color-muted);"
>
  <!-- 新 -->
  <p class="mb-4 caption text-muted"></p>
</p>
```

L122-125 (`<span>` 「開く ›」 link L124):

```astro
<!-- 元 -->
<span
  class="text-link-color"
  style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em;"
>
  <!-- 新 -->
  <span class="text-link-color caption"></span></span
>
```

- [ ] **Step 3: index.astro の inline 残存ゼロ確認**

```bash
grep -n 'style="' src/pages/index.astro
```

Expected: 0 件 (出力なし)。`<style>` scoped block (L139-162) は touch せず残存 (Astro `security.csp` で auto-hash 化される、本 PR 対象外)。

- [ ] **Step 4: prettier + astro check + build**

```bash
node_modules/.bin/prettier --write src/pages/index.astro
node_modules/.bin/astro check 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Expected: 0 errors、build success (Tailwind が arbitrary value `text-[2rem]` / `tracking-[0.01em]` / `bg-[var(--color-background)]` 等を正しく生成していることを暗黙確認)。

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro
git commit -m "$(cat <<'EOF'
refactor(pages): #289 PR 7b — index.astro Astro inline 撤去 (13 件)

- hero card (L29): bg-[var(--color-background)] border-b border-[var(--color-blue-100)] (arbitrary 2連、単発)
- H1 (L33): text-[2rem] leading-[1.4] tracking-[0.01em] text-default (arbitrary 3 + 既存)
- hero subtitle (L38): text-base leading-[1.7] tracking-[0.02em] text-[var(--color-neutral-600)] (arbitrary 4、neutral-600 単発)
- tab-bar border (L53): border-default (既存)
- tab small label (L62, L75): text-sm tracking-[0.02em]
- carousel container (L87): scroll-snap-x (新規)
- carousel item (L95): basis-full shrink-0 grow-0 snap-start min-w-0 (Tailwind utility 5連)
- tool-card bg (L104): bg-default border border-default (既存)
- ToolIcon (L107): style prop → class prop ("text-primary")
- card title (L112): section-heading (新規、色は親 .tool-card-title から継承)
- card description (L118): caption text-muted (既存)
- card body (L124): caption (既存)

既存 <style> scoped block (.tab-btn / .tool-card-title) は touch せず維持。

Refs: #289, #176 B 案 PR 7b (spec §1)
EOF
)"
```

Expected: pre-commit hook 通過、commit 成立。

### Task 1.3: about.astro / privacy.astro inline 撤去 (22 件)

**Files:**

- Modify: `src/pages/about.astro:23,31,36,47,53,71,82,88,101,107`
- Modify: `src/pages/privacy.astro:24,30,38,43,53,58,68,73,82,87,103,108`

- [ ] **Step 1: about.astro を編集 (10 件)**

各 inline を以下のとおり置換。

L21-24 (H1):

```astro
<!-- 元 -->
<h1
  class="mb-8 font-bold"
  style="font-size: 1.75rem; line-height: 1.4; letter-spacing: 0.02em; color: var(--color-text);"
>
  <!-- 新 -->
  <h1 class="mb-8 font-bold text-[1.75rem] leading-[1.4] tracking-[0.02em] text-default"></h1>
</h1>
```

L29-32 (H2 「DevTools とは」):

```astro
<!-- 元 -->
<h2
  class="mb-3 font-bold"
  style="font-size: 1.125rem; line-height: 1.5; letter-spacing: 0.02em; color: var(--color-text);"
>
  <!-- 新 -->
  <h2 class="mb-3 font-bold section-heading text-default"></h2>
</h2>
```

L35-37 (`<p>` body 「DevTools は...」):

```astro
<!-- 元 -->
<p
  style="font-size: 1rem; line-height: 1.8; letter-spacing: 0.02em; color: var(--color-neutral-700);"
>
  <!-- 新 -->
  <p class="text-body"></p>
</p>
```

L45-48 (H2 「設計方針」、L29-32 と同):

```astro
<!-- 新 -->
<h2 class="mb-3 font-bold section-heading text-default"></h2>
```

L51-54 (`<ul>` body 「設計方針」 list、L35-37 と同 pattern だが ul 本体):

```astro
<!-- 元 -->
<ul
  class="space-y-2"
  style="font-size: 1rem; line-height: 1.8; letter-spacing: 0.02em; color: var(--color-neutral-700);"
>
  <!-- 新 -->
  <ul class="space-y-2 text-body"></ul>
</ul>
```

L69-72 (H2 「ツール一覧」、L29-32 と同):

```astro
<!-- 新 -->
<h2 class="mb-4 font-bold section-heading text-default"></h2>
```

> **note**: L70 は `mb-4` (他 H2 は `mb-3`) で margin が異なる。class 維持で正常。

L80-83 (tool list `<a>` link L82、line-height 1.7、色無、独自 pattern):

```astro
<!-- 元 -->
<a
  href={`/tools/${tool.slug}`}
  class="text-link"
  style="font-size: 1rem; line-height: 1.7; letter-spacing: 0.02em;"
>
  <!-- 新 -->
  <a href={`/tools/${tool.slug}`} class="text-link text-base leading-[1.7] tracking-[0.02em]"
  ></a></a
>
```

L86-89 (tool description `<span>` L88、caption + muted):

```astro
<!-- 元 -->
<span
  class="ml-2"
  style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em; color: var(--color-muted);"
>
  <!-- 新 -->
  <span class="ml-2 caption text-muted"></span></span
>
```

L99-102 (H2 「技術スタック」、L29-32 と同):

```astro
<!-- 新 -->
<h2 class="mb-3 font-bold section-heading text-default"></h2>
```

L105-108 (`<ul>` body 「技術スタック」 list、L51-54 と同):

```astro
<!-- 新 -->
<ul class="space-y-1 text-body"></ul>
```

> **note**: `space-y-1` (他は `space-y-2`) で間隔が異なる。class 維持で正常。

- [ ] **Step 2: about.astro の inline 残存ゼロ確認**

```bash
grep -n 'style="' src/pages/about.astro
```

Expected: 0 件。

- [ ] **Step 3: privacy.astro を編集 (12 件)**

L22-25 (H1、about L21-24 と同 pattern):

```astro
<!-- 新 -->
<h1 class="mb-2 font-bold text-[1.75rem] leading-[1.4] tracking-[0.02em] text-default"></h1>
```

> **note**: privacy L23 は `mb-2`、about L22 は `mb-8`。class 維持。

L28-31 (last updated `<p>` L30、caption + muted):

```astro
<!-- 元 -->
<p
  class="mb-10"
  style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em; color: var(--color-muted);"
>
  <!-- 新 -->
  <p class="mb-10 caption text-muted"></p>
</p>
```

L36-39 (H2 「データの収集について」、about L29-32 と同):

```astro
<!-- 新 -->
<h2 class="mb-3 font-bold section-heading text-default"></h2>
```

L42-44 (`<p>` body L43、about L35-37 と同):

```astro
<!-- 新 -->
<p class="text-body"></p>
```

L51-54 (H2 「Cookie・ローカルストレージ」、同 pattern):

```astro
<!-- 新 -->
<h2 class="mb-3 font-bold section-heading text-default"></h2>
```

L57-59 (`<p>` body L58、同 pattern):

```astro
<!-- 新 -->
<p class="text-body"></p>
```

L66-69 (H2 「アクセス解析・広告」、同 pattern):

```astro
<!-- 新 -->
<h2 class="mb-3 font-bold section-heading text-default"></h2>
```

L72-74 (`<p>` body L73、同 pattern):

```astro
<!-- 新 -->
<p class="text-body"></p>
```

L80-83 (H2 「ホスティング」、同 pattern):

```astro
<!-- 新 -->
<h2 class="mb-3 font-bold section-heading text-default"></h2>
```

L86-88 (`<p>` body L87、同 pattern):

```astro
<!-- 新 -->
<p class="text-body"></p>
```

L101-104 (H2 「ポリシーの変更」、同 pattern):

```astro
<!-- 新 -->
<h2 class="mb-3 font-bold section-heading text-default"></h2>
```

L107-109 (`<p>` body L108、同 pattern):

```astro
<!-- 新 -->
<p class="text-body"></p>
```

- [ ] **Step 4: privacy.astro の inline 残存ゼロ確認**

```bash
grep -n 'style="' src/pages/privacy.astro
```

Expected: 0 件。

- [ ] **Step 5: prettier + astro check + build**

```bash
node_modules/.bin/prettier --write src/pages/about.astro src/pages/privacy.astro
node_modules/.bin/astro check 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Expected: 0 errors、build success。

- [ ] **Step 6: Commit**

```bash
git add src/pages/about.astro src/pages/privacy.astro
git commit -m "$(cat <<'EOF'
refactor(pages): #289 PR 7b — about.astro / privacy.astro Astro inline 撤去 (22 件)

- about.astro: 10 件
  - H1 (L23): text-[1.75rem] leading-[1.4] tracking-[0.02em] text-default
  - H2 x4 (L31, L47, L71, L101): section-heading text-default
  - body p/ul x4 (L36, L53, L107): text-body / list item L82 のみ独自 pattern (line-height 1.7、色無)
  - caption muted (L88): caption text-muted

- privacy.astro: 12 件
  - H1 (L24): about L23 と同 pattern
  - last updated caption (L30): caption text-muted
  - H2 x5 (L38, L53, L68, L82, L103): section-heading text-default
  - body p x5 (L43, L58, L73, L87, L108): text-body

新規 .section-heading (10 件) / .text-body (8 件) を主に消費。
单発 typography (H1 1.75rem / list item L82) は arbitrary 採用 (YAGNI)。

Refs: #289, #176 B 案 PR 7b (spec §2, §3)
EOF
)"
```

Expected: pre-commit hook 通過、commit 成立。

### Task 1.4: tools/\*.astro code chip 撤去 (7 件、4 ファイル)

**Files:**

- Modify: `src/pages/tools/jwt-decoder.astro:17,21,25,29` (4 件)
- Modify: `src/pages/tools/url-encode.astro:18` (1 件)
- Modify: `src/pages/tools/json-xml.astro:17` (1 件)
- Modify: `src/pages/tools/json-csv.astro:18` (1 件)

全て同一 pattern: `style="background: var(--color-bg-subtle); font-size: 0.875rem;"` → `bg-subtle text-sm` を class 末尾に追加して style 属性削除。

- [ ] **Step 1: jwt-decoder.astro を編集 (4 件)**

L15-18 (`<code>.</code>` chip):

```astro
<!-- 元 -->
<code
  class="rounded px-1 font-mono"
  style="background: var(--color-bg-subtle); font-size: 0.875rem;">.</code
>

<!-- 新 -->
<code class="rounded px-1 font-mono bg-subtle text-sm">.</code>
```

L19-22 (`<code>exp</code>` chip):

```astro
<!-- 新 -->
<code class="rounded px-1 font-mono bg-subtle text-sm">exp</code>
```

L23-26 (`<code>iat</code>` chip):

```astro
<!-- 新 -->
<code class="rounded px-1 font-mono bg-subtle text-sm">iat</code>
```

L27-30 (`<code>nbf</code>` chip):

```astro
<!-- 新 -->
<code class="rounded px-1 font-mono bg-subtle text-sm">nbf</code>
```

> **note**: 元の Astro 構文では `<code ... >.</code\n>` のように `>` が次行に来ていたが、prettier 整形で `<code class="...">.</code>` 形式に統一されることが期待される。整形結果はその後 prettier に委ねる (Step 5)。

- [ ] **Step 2: url-encode.astro を編集 (1 件)**

L16-19 (`<code>%XX</code>` chip):

```astro
<!-- 元 -->
<code
  class="rounded px-1 font-mono"
  style="background: var(--color-bg-subtle); font-size: 0.875rem;">%XX</code
>

<!-- 新 -->
<code class="rounded px-1 font-mono bg-subtle text-sm">%XX</code>
```

- [ ] **Step 3: json-xml.astro を編集 (1 件)**

L15-18 (`<code>root</code>` chip):

```astro
<!-- 元 -->
<code
  class="rounded px-1 font-mono"
  style="background: var(--color-bg-subtle); font-size: 0.875rem;">root</code
>

<!-- 新 -->
<code class="rounded px-1 font-mono bg-subtle text-sm">root</code>
```

- [ ] **Step 4: json-csv.astro を編集 (1 件)**

L16-19 (`<code>address.city</code>` chip):

```astro
<!-- 元 -->
<code
  class="rounded px-1 font-mono"
  style="background: var(--color-bg-subtle); font-size: 0.875rem;">address.city</code
>

<!-- 新 -->
<code class="rounded px-1 font-mono bg-subtle text-sm">address.city</code>
```

- [ ] **Step 5: tools/\*.astro の inline 残存ゼロ確認**

```bash
grep -n 'style="' src/pages/tools/jwt-decoder.astro src/pages/tools/url-encode.astro src/pages/tools/json-xml.astro src/pages/tools/json-csv.astro
```

Expected: 0 件 (出力なし)。

- [ ] **Step 6: prettier + astro check + build**

```bash
node_modules/.bin/prettier --write src/pages/tools/jwt-decoder.astro src/pages/tools/url-encode.astro src/pages/tools/json-xml.astro src/pages/tools/json-csv.astro
node_modules/.bin/astro check 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Expected: 0 errors、build success。

- [ ] **Step 7: Commit**

```bash
git add src/pages/tools/jwt-decoder.astro src/pages/tools/url-encode.astro src/pages/tools/json-xml.astro src/pages/tools/json-csv.astro
git commit -m "$(cat <<'EOF'
refactor(pages/tools): #289 PR 7b — jwt-decoder + url-encode + json-xml + json-csv code chip 撤去 (7 件)

全て同一 pattern: bg-subtle + text-sm を <code> chip に追加、style 属性削除。

- jwt-decoder.astro: 4 件 (. / exp / iat / nbf code chip)
- url-encode.astro: 1 件 (%XX code chip)
- json-xml.astro: 1 件 (root code chip)
- json-csv.astro: 1 件 (address.city code chip)

新規 class 不要、PR 1〜7a の既存 utility (.bg-subtle) + Tailwind text-sm のみで対応。

Refs: #289, #176 B 案 PR 7b (spec §4)
EOF
)"
```

Expected: pre-commit hook 通過、commit 成立。

---

## Phase 2 — 検証 (親 Opus 直接実行)

### Task 2.1: PR 7b スコープの inline 全廃確認

- [ ] **Step 1: src 全体で grep (本 PR 完了時 0 件 expected)**

```bash
grep -rn 'style="' src --include='*.astro'
```

Expected: 0 件 (出力なし)。これにより issue #289 の Astro inline 65 件全廃完了 (PR 7a 23 件 + PR 7b 42 件)。

- [ ] **Step 2: PR 7b touch 範囲の確認 (想定外 file touch なし)**

```bash
git diff origin/develop --name-only
```

Expected: 以下 11 ファイル (spec / plan / progress doc / global.css / Astro 7):

```
docs/projects/issue-176-b-plan-progress.md       # Phase 3 Task 3.1 で追加予定
docs/superpowers/plans/2026-05-08-issue-289-pr7b-astro-pages.md
docs/superpowers/specs/2026-05-08-issue-289-pr7b-astro-pages-design.md
src/pages/about.astro
src/pages/index.astro
src/pages/privacy.astro
src/pages/tools/json-csv.astro
src/pages/tools/json-xml.astro
src/pages/tools/jwt-decoder.astro
src/pages/tools/url-encode.astro
src/styles/global.css
```

Phase 2 時点では progress doc は未追加なので 10 ファイル。Phase 3 Task 3.1 で 11 ファイルになる。

### Task 2.2: a11y 退化検知 (aria-\* 削除なし)

- [ ] **Step 1: 全 commit の差分で aria-\* / role= 削除行を検索**

```bash
git diff origin/develop --unified=0 -- '*.astro' | grep -E '^-' | grep -E 'aria-|role=' | grep -v '^---'
```

Expected: 0 件 (aria-\* / role 削除なし)。検出されたら **PR 作成前に必ず原因を確認**して修正 (CLAUDE.md / shared-agent-rules.md 9.6)。

> **note**: index.astro で `role="tablist"` / `role="tab"` / `role="tabpanel"` / `aria-label` / `aria-selected` / `aria-controls` / `aria-labelledby` 属性多数。これらは一切 touch しない。

### Task 2.3: unit test + astro check (local 必須ゲート)

- [ ] **Step 1: unit test 全 pass**

```bash
npm run test 2>&1 | tail -10
```

Expected: 全 test pass。`inline-style-migration.test.ts` は `*.tsx` のみ対象なので本 PR の Astro 編集は影響しない。

- [ ] **Step 2: astro check 0 errors**

```bash
node_modules/.bin/astro check 2>&1 | tail -5
```

Expected: `Result (X files): - 0 errors - 0 warnings`。

### Task 2.4: E2E (親直接実行、subagent 委譲なし — memory feedback_subagent_verification_trust)

- [ ] **Step 1: port 4321 解放**

```bash
npm run pretest:e2e
```

Expected: 既存 server が居れば kill、居なければ no-op。

- [ ] **Step 2: E2E 実行**

```bash
npm run test:e2e 2>&1 | tail -30
```

Expected: 全 spec pass。`style-src 'unsafe-inline'` 維持下 (PR 7b では削除しない、PR 8 で flip) のため CSP 違反は出ない設計。

- [ ] **Step 3: 失敗時の判定**

env 由来 (`ECONNREFUSED 4321` / `webServer was not ready` / `hydration timeout`) の場合は再実行。テスト本来の失敗 (assertion error / element not found) は実装修正。pages 系の class 化で text 表示や DOM 構造に影響が出ていれば該当 spec で検出される (例: text-link-color の hover 挙動が変わる、tool-card-title color cascade 等)。

### Task 2.5: 手動視認 (browser、可能なら)

> **note**: 親 Opus セッション内で MCP playwright が利用可能なら手動視認を実施。利用不可なら CI VRT に委譲して step skip。

- [ ] **Step 1: preview server 起動 (Step 1 の E2E pretest で port 解放済前提)**

```bash
npm run preview &
sleep 3
```

- [ ] **Step 2: index / about / privacy 表示視認**

`http://localhost:4321/` (hero / tab / carousel / tool card)、`http://localhost:4321/about` (H1 / H2 / 本文 / tool list)、`http://localhost:4321/privacy` (H1 / 5 section / body) の表示が PR 前後で同等であることを目視確認。

- [ ] **Step 3: tools/\*.astro の code chip 視認**

`http://localhost:4321/tools/jwt-decoder` (`. / exp / iat / nbf` の code chip)、`http://localhost:4321/tools/url-encode` (`%XX`)、`http://localhost:4321/tools/json-xml` (`root`)、`http://localhost:4321/tools/json-csv` (`address.city`) で chip の bg / 文字サイズが同一であることを目視確認。

- [ ] **Step 4: mobile viewport (375px) で carousel swipe 視認**

`http://localhost:4321/` を mobile viewport で開き、tab タップで carousel が水平スクロール / snap する挙動が同一であることを確認。`.scroll-snap-x` 化で挙動が壊れていないことを実証。

- [ ] **Step 5: preview server 停止**

```bash
npm run pretest:e2e
```

---

## Phase 3 — 進捗 doc 更新 + PR 作成 (親 Opus 直接実行)

### Task 3.1: 進捗 doc 更新

**Files:**

- Modify: `docs/projects/issue-176-b-plan-progress.md`

- [ ] **Step 1: 進捗状況テーブルの PR 7b 行を更新 + PR 8 行のソース修正**

「進捗状況」テーブル現状の `| PR 7b | pages/\*.astro 7 ファイル (Astro inline 残 42 件) — `#289` 由来 | 未着手 | - |` を以下に更新:

```markdown
| **PR 7b** | pages/\*.astro 7 ファイル (Astro inline 残 42 件 + 新規 3 class) — `#289` 由来 | 🔄 PR open | (PR 番号は PR 作成後に追記) |
```

- [ ] **Step 2: 「着手済 PR の prerequisite / 同梱 issue 履歴」section に PR 7b の subsection を追加**

PR 7a (#294) 行 (line 89-97 付近) の直後に以下を追加:

```markdown
### PR 7b (#TBD) — `#289` 由来

- **scope**: `src/pages/*.astro` 7 ファイル (`index.astro` 13 + `privacy.astro` 12 + `about.astro` 10 + `tools/jwt-decoder.astro` 4 + `tools/url-encode.astro` 1 + `tools/json-xml.astro` 1 + `tools/json-csv.astro` 1) = **42 inline 撤去**
- **新規 class**: 3 件 (`.section-heading` / `.text-body` / `.scroll-snap-x`) を `src/styles/global.css` に追加
- **再利用**: `.bg-subtle` (PR 1) / `.caption` / `.text-muted` / `.text-default` / `.text-primary` / `.bg-default` / `.border-default` (PR 1〜5b) — code chip 7 件を bg-subtle で完全カバー、caption + muted で 3 件、border-default で 2 件
- **Tailwind arbitrary**: H1 単発 (`text-[2rem]` x1, `text-[1.75rem]` x2)、hero subtitle (`text-[var(--color-neutral-600)]`)、hero card bg (`bg-[var(--color-background)] border-[var(--color-blue-100)]`)、small label (`tracking-[0.02em]` x4)、list item L82 (`leading-[1.7]`) — 単発 typography は class 化見送り (YAGNI、PR 7a §126 と同 judgement)
- **scope 外**: `style-src 'unsafe-inline'` 削除 (PR 8)、`inline-style-migration.test.ts` の Astro 検出網追加 (PR 8、user 指示で本 PR 内追加せず)、`decisions.md [067]` (PR 8)
- **subagent 非委譲**: 親 Opus 直接実装 + 親直接 E2E (PR 7a / PR 6 / 292 と同パターン、memory `feedback_subagent_verification_trust.md`)
- **issue #289 完了**: PR 7a (23 件) + PR 7b (42 件) = 65 件 / 15 ファイル全廃完了。次は PR 8 で `style-src 'unsafe-inline'` 削減を最終 flip
- **同梱 follow-up issue 起票**: [#297](https://github.com/fumtas1k/devtools/issues/297) (worktree 作成時の npm ci 必須ルールが docs framing 上の構造的欠陥で skip 多発、本 PR 着手時に発覚 — 修正は別 PR / docs only)
```

- [ ] **Step 3: prettier**

```bash
node_modules/.bin/prettier --write docs/projects/issue-176-b-plan-progress.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/projects/issue-176-b-plan-progress.md
git commit -m "$(cat <<'EOF'
chore(docs): #289 PR 7b — 進捗 doc に PR 7b 行と prerequisite 履歴を追加

- 進捗状況テーブルの PR 7b 行を 🔄 PR open に更新
- 「着手済 PR の prerequisite / 同梱 issue 履歴」に PR 7b subsection 追加 (新規 3 class / 再利用 / arbitrary / scope 外 / issue #289 完了マイルストーン / #297 起票言及)

Refs: #289, #176 B 案 PR 7b
EOF
)"
```

Expected: pre-commit hook 通過、commit 成立。

### Task 3.2: PR 作成 pre-check (3 つ必須、CLAUDE.md / shared-agent-rules.md 9.6)

- [ ] **Step 1: develop ベース一致**

```bash
test "$(git rev-parse origin/develop)" = "$(git merge-base HEAD origin/develop)" && echo "✅ base develop 一致" || echo "❌ rebase が必要"
```

Expected: `✅ base develop 一致`。

- [ ] **Step 2: スコープ確認 (想定外ファイルなし)**

```bash
git diff origin/develop --name-only
```

Expected (11 ファイル):

```
docs/projects/issue-176-b-plan-progress.md
docs/superpowers/plans/2026-05-08-issue-289-pr7b-astro-pages.md
docs/superpowers/specs/2026-05-08-issue-289-pr7b-astro-pages-design.md
src/pages/about.astro
src/pages/index.astro
src/pages/privacy.astro
src/pages/tools/json-csv.astro
src/pages/tools/json-xml.astro
src/pages/tools/jwt-decoder.astro
src/pages/tools/url-encode.astro
src/styles/global.css
```

`src/components/` / `src/layouts/` / `src/utils/` / `tests/` 等の touch がないことを確認。

- [ ] **Step 3: a11y 保護 (aria-\* / role= 削除なし)**

```bash
git diff origin/develop --unified=0 -- '*.astro' '*.tsx' | grep -E '^-' | grep -E 'aria-|role=' | grep -v '^---' | wc -l
```

Expected: `0` (削除行ゼロ)。0 でない場合は内容確認、a11y 退化なら修正必須。

### Task 3.3: PR 本文起草 + push + PR 作成

- [ ] **Step 1: PR 本文を `/tmp/claude/pr_body.md` に書き出し**

```bash
mkdir -p /tmp/claude
cat > /tmp/claude/pr_body.md <<'EOF'
## 概要

`#176` B 案 follow-up `#289` のうち、**pages 系** の Astro `<element style="...">` 属性 42 件 / 7 ファイル を CSS class に移行。新規 3 class を `src/styles/global.css` `@layer components` に追加し、Tailwind utility / 既存意味クラスと併用して移行完了。

本 PR 完了で issue #289 の Astro inline 65 件全廃 (PR 7a 23 件 + PR 7b 42 件) が完了し、PR 8 で `style-src 'unsafe-inline'` 削減を最終 flip できる状態になる。

## 変更内容

### 新規 3 class (`src/styles/global.css`)

| class | 用途 | 件数 |
| --- | --- | --- |
| `.section-heading` | about/privacy h2 + index card title (1.125rem/1.5/0.02em) | 10 |
| `.text-body` | about/privacy 本文段落 (1rem/1.8/0.02em + neutral-700 baked-in) | 8 |
| `.scroll-snap-x` | index hero carousel (overflow-x: scroll + snap + webkit prefix) | 1 |

### 既存 class 再利用 (主要件)

`.bg-subtle` (code chip 7 件) / `.caption` + `.text-muted` (caption 3 件) / `.text-primary` (ToolIcon class prop 化) / `.bg-default` + `.border-default` (tool card / tab-bar) / `.text-default` (H1/H2 色) を活用。

### Tailwind arbitrary value (主要件)

- H1 単発: `text-[2rem]` x1 / `text-[1.75rem]` x2 + `leading-[1.4]` + `tracking-[0.01em or 0.02em]`
- hero subtitle (1 件のみの `--color-neutral-600`): `text-[var(--color-neutral-600)]`
- hero card bg (1 件のみの blue-50/100): `bg-[var(--color-background)] border-[var(--color-blue-100)]`
- small label (`text-sm tracking-[0.02em]`) x2
- list item (about L82): `leading-[1.7]`

単発 typography は class 化見送り (YAGNI、PR 7a §126 ToolLayout H1 と同 judgement)。

### touch ファイル (8 + 1 = 9 ファイル)

- `src/styles/global.css` (新規 3 class 追加)
- `src/pages/index.astro` (13 件)
- `src/pages/about.astro` (10 件)
- `src/pages/privacy.astro` (12 件)
- `src/pages/tools/jwt-decoder.astro` (4 件 / code chip)
- `src/pages/tools/url-encode.astro` (1 件 / code chip)
- `src/pages/tools/json-xml.astro` (1 件 / code chip)
- `src/pages/tools/json-csv.astro` (1 件 / code chip)

既存 Astro `<style>` scoped block (`index.astro` の `.tab-btn` / `.tool-card-title`) は本 PR では touch せず維持 (Astro `security.csp` で auto-hash 化、本 issue #289 の対象外)。

### ToolIcon の `class` prop 採用

`src/pages/index.astro` L107 の `<ToolIcon ... style="color: var(--color-primary);" />` を `<ToolIcon ... class="text-primary" />` に置換。`ToolIcon.astro` は既に `class` prop に対応済 (L5, L12)、`style` prop も既存だが本 PR では使用せず。

## scope 外 (本 PR で実施しないこと)

- `style-src 'unsafe-inline'` 削除 + `stripMetaStyleSrc` 撤去 (PR 8)
- `inline-style-migration.test.ts` への `*.astro` 検出網追加 (**PR 8**、user 指示で flip と同時 commit が意味的整合)
- `decisions.md [067]` (PR 8)

## 検証

- [x] `npm run test` 全 pass
- [x] `node_modules/.bin/astro check` 0 errors
- [x] `npm run test:e2e` 全 spec pass (親直接、`style-src 'unsafe-inline'` 維持下のため CSP 違反は本 PR scope では発生しない)
- [x] PR 7b 7 ファイルで `grep -n 'style="' src/pages` = 0 件
- [x] `grep -rn 'style="' src --include='*.astro'` = 0 件 (issue #289 完了マイルストーン: PR 7a 23 件 + PR 7b 42 件 = 65 件全廃)
- [x] aria-\* / role 属性削除なし (`git diff origin/develop -- '*.astro' | grep '^-' | grep aria-` = 0 件)
- [ ] VRT (CI Linux runner): post-push の自動実行で確認、意図しない pixel diff があれば fix

## 関連

- 起票 issue: #289
- 上位 issue: #176 (B 案 = `style-src 'unsafe-inline'` 削減)
- 直前 PR: #294 (PR 7a — layout/ui 23 件 + 新規 7 class)
- 後続 PR: PR 8 (最終 flip — `_headers` flip + `decisions.md [067]` + Astro 検出網追加 + `stripMetaStyleSrc` 撤去)
- spec: `docs/superpowers/specs/2026-05-08-issue-289-pr7b-astro-pages-design.md`
- plan: `docs/superpowers/plans/2026-05-08-issue-289-pr7b-astro-pages.md`
- 進捗 SoT: `docs/projects/issue-176-b-plan-progress.md`
- 同梱で起票した follow-up issue: #297 (worktree 作成時の npm ci 必須ルールが docs framing 上の構造的欠陥で skip 多発、本 PR 着手時に発覚 — 修正は別 PR / docs only)

## レビュー時の注目点

- 新規 3 class の命名 (`.section-heading` / `.text-body` / `.scroll-snap-x`) が PR 1〜7a の既存命名 family と一貫しているか
- `.text-body` の color baked-in 採用 (`.footer-bar` precedent 流用) が dark mode 対応時の semantic alias 化と矛盾しないか (本 PR scope 外、将来 follow-up)
- carousel の `.scroll-snap-x` 化で hero swipe 挙動 (mobile 375px viewport) が壊れていないか — Task 2.5 Step 4 で手動視認、CI VRT で pixel diff 検出
- ToolIcon の `class` prop 採用 (style prop → class prop) で他 consumer に影響なし (index.astro 1 箇所のみで使用)
- visual regression: pages 系の影響は対象 page のみ局所、layout 系 (PR 7a) より波及範囲狭

## issue #289 完了マイルストーン

本 PR merged で issue #289 (Astro inline 65 件 follow-up) は完了 → close 予定。次は **PR 8 で B 案最終 flip** (`_headers` から `style-src 'unsafe-inline'` 削除 + `stripMetaStyleSrc` 撤去 + `inline-style-migration.test.ts` Astro 検出網追加 + `decisions.md [067]`)。
EOF
```

- [ ] **Step 2: push**

```bash
git push -u origin feature/issue-289-pr7b-astro-pages
```

Expected: push 成立、CI workflow trigger。

- [ ] **Step 3: PR 作成 (gh pr create、--base develop 必須、--body-file 必須)**

```bash
gh pr create \
  --base develop \
  --title "refactor(pages): #289 PR 7b — Astro pages inline 撤去 (7 ファイル / 42 件 / 新規 3 class)" \
  --body-file /tmp/claude/pr_body.md
```

Expected: PR URL を取得、PR 作成成立。

- [ ] **Step 4: PR URL を進捗 doc / plan に追記 (任意 follow-up)**

> 本 PR merged 後の chore PR or PR 8 着手時に「(PR 番号は PR 作成後に追記)」 placeholder を実 PR 番号に置換。本 PR 内で実施しない (push 済 commit を amend するのは memory `feedback_branch_workflow.md` で議論余地あり、避ける)。

---

## Self-Review Checklist (Plan 起草後の inline check)

### Spec coverage

- [x] Spec § ゴール (7 ファイル / 42 件 / 3 新規 class) → Phase 1 で全 file カバー (Task 1.1 + 1.2 + 1.3 + 1.4)
- [x] Spec § non-goal (style-src / Astro 検出網 / decisions.md / VRT baseline) → Phase 0 baseline + plan 全体で touch しない、PR 8 への委譲を本文・PR description で明示
- [x] Spec § global.css への追加 → Task 1.1 で 3 class 追加
- [x] Spec § 採用する設計 (ファイル別) §1〜§4 → Task 1.2 (index)、Task 1.3 (about/privacy)、Task 1.4 (tools) で全 file カバー
- [x] Spec § Astro inline 完全削除の確認 → Task 2.1 で `grep -rn 'style="' src --include='*.astro'` = 0 確認
- [x] Spec § 検証戦略 (unit / type / E2E / VRT / 手動) → Task 2.1〜2.5 で全項目カバー
- [x] Spec § ブランチ命名 / コミット粒度 → Phase 1 で 4 commit + Phase 3 で 1 commit = 計 5 commit、spec § コミット粒度と一致 (5 commits 想定)
- [x] Spec § リスクと緩和 → Task 2.2 (a11y 退化検知) / Task 2.4 (E2E) / Task 2.5 Step 4 (carousel mobile viewport 視認) で kept
- [x] Spec § 議論ポイント (B/C/F/H/I 採用案) → 各 Task で具体的に消費 (Task 1.1 で B/C/I の class 定義、Task 1.2 で F/H の arbitrary 採用)

### placeholder scan

- [x] "TBD" 残存箇所: 進捗 doc 更新 (Task 3.1) と PR 7b subsection (Task 3.1 Step 2) の `(PR 番号は PR 作成後に追記)` および `### PR 7b (#TBD)` の `#TBD` 1 箇所のみ。これは PR 作成後にしか確定しないため意図的 placeholder。
- [x] "TODO" / "implement later" / "fill in details" なし
- [x] "Add appropriate error handling" / "handle edge cases" なし
- [x] "Write tests for the above" 等 abstract test 指示なし
- [x] 全 step に exact code / exact command を記載

### type / class consistency

- [x] 新規 class 名 (`.section-heading` / `.text-body` / `.scroll-snap-x`) は spec § global.css への追加 と完全一致
- [x] Tailwind utility 名 (`text-[2rem]` / `text-[1.75rem]` / `text-[var(--color-neutral-600)]` / `bg-[var(--color-background)]` / `border-[var(--color-blue-100)]` / `tracking-[0.01em]` / `tracking-[0.02em]` / `leading-[1.4]` / `leading-[1.7]` / `text-sm` / `text-base` / `bg-subtle` / `text-default` / `text-muted` / `text-primary` / `bg-default` / `border-default` / `border` / `caption` / `basis-full` / `shrink-0` / `grow-0` / `snap-start` / `min-w-0`) は plan 内一貫
- [x] 既存 class (`.caption` / `.text-default` / `.text-muted` / `.text-primary` / `.bg-default` / `.bg-subtle` / `.border-default`) は global.css 既存定義 (PR 1〜7a) と一致
- [x] PR 7a 新規 class (`.text-icon` / `.text-tertiary` / `.bg-badge` / `.footer-bar` / `.text-footer-meta` / `.drawer-backdrop` / `.caption-wide`) は本 PR で参照しない (pages/ scope では不要)

### scope check

本 plan は 1 PR (PR 7b) 範囲。`style-src 'unsafe-inline'` flip / `inline-style-migration.test.ts` Astro 検出網 / `decisions.md [067]` は別 plan (PR 8) で起草される、本 plan scope 外。
