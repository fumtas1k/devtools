# #289 PR 7a — Astro layout/ui inline migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **本 PR の例外**: subagent 委譲はしない。spec § 9「subagent 非委譲、親 Opus 直接実装 + 親直接 E2E」に基づき、親 Opus が全 task を直接実行する (規模 = 8 ファイル / 23 件で並列分担コストに見合わず、memory `feedback_subagent_verification_trust.md` で高 stakes 検証は親直接を推奨)。

**Goal:** `src/components/layout/*.astro` 4 + `src/layouts/*.astro` 2 + `src/components/ui/{CategoryBadge,ToolInfoSection}.astro` 2 = **8 ファイル / 23 件**の Astro `<element style="...">` 属性を全廃し、CSS class (Tailwind utility / 既存 `@layer components` 意味クラス / 新規 7 class) に置換する。

**Architecture:** PR 1〜5b で確立した「`@layer components` 集約」パターンを Astro 側に拡張。新規 class 7 個 (`.caption-wide` / `.text-icon` / `.text-tertiary` / `.bg-badge` / `.footer-bar` / `.text-footer-meta` / `.drawer-backdrop`) を `src/styles/global.css` に追加し、各 Astro ファイルの `style="..."` を `class="..."` 化する。Tailwind v4 の auto-utility と `@layer components` の意味クラスを併用、単発 typography は arbitrary value (`text-[1.625rem] leading-[1.5] tracking-[0.02em]` 等) で対応。

**Tech Stack:** Astro 5.x / Tailwind CSS v4 / Vitest (unit) / Playwright (E2E) / Astro check (type)

**Spec:** `docs/superpowers/specs/2026-05-08-issue-289-pr7a-astro-inline-layout-ui-design.md`

**Branch:** `feature/issue-289-pr7a-astro-layout-ui` (worktree: `.claude/worktrees/issue-289-pr7a/`、base: `origin/develop`)

---

## File Structure

### 編集ファイル (9 ファイル)

| ファイル                                     | 編集内容                                                       | inline 件数 |
| -------------------------------------------- | -------------------------------------------------------------- | ----------- |
| `src/styles/global.css`                      | 新規 7 class を `@layer components` 末尾に追加                 | -           |
| `src/components/layout/Header.astro`         | L7 / L13 / L22 の `style="..."` を class 化                    | 3           |
| `src/components/layout/Footer.astro`         | L5 / L8 / L15 / L20 の `style="..."` を class 化               | 4           |
| `src/components/layout/MobileDrawer.astro`   | L16 / L21 / L31 / L39 / L67 / L82 の `style="..."` を class 化 | 6           |
| `src/components/layout/Sidebar.astro`        | L19 / L37 の `style="..."` を class 化                         | 2           |
| `src/layouts/BaseLayout.astro`               | L45 の `style="..."` を class 化                               | 1           |
| `src/layouts/ToolLayout.astro`               | L51 / L57 / L66 / L71 / L77 の `style="..."` を class 化       | 5           |
| `src/components/ui/CategoryBadge.astro`      | L11 の `style="..."` を class 化                               | 1           |
| `src/components/ui/ToolInfoSection.astro`    | L7 の `style="..."` を class 化                                | 1           |
| `docs/projects/issue-176-b-plan-progress.md` | 進捗状況テーブルに PR 7a 行を追加 (Phase 3 で実施)             | -           |

### 新規ファイル

なし。

---

## Phase 0 — 準備 (親 Opus 直接実行)

### Task 0.1: 進行確認 (worktree / branch / spec / plan)

**Files:**

- Read: `.claude/worktrees/issue-289-pr7a/docs/superpowers/specs/2026-05-08-issue-289-pr7a-astro-inline-layout-ui-design.md`
- Read: `.claude/worktrees/issue-289-pr7a/docs/superpowers/plans/2026-05-08-issue-289-pr7a-astro-layout-ui.md` (本ファイル)

- [ ] **Step 1: worktree path / branch / base 一致確認**

```bash
pwd
git branch --show-current
git rev-parse origin/develop
git merge-base HEAD origin/develop
```

Expected:

- pwd = `/Users/fumta/projects/devtools/.claude/worktrees/issue-289-pr7a`
- branch = `feature/issue-289-pr7a-astro-layout-ui`
- `git rev-parse origin/develop` == `git merge-base HEAD origin/develop` (= `b3203e0` 系)

- [ ] **Step 2: node_modules 整備済確認**

```bash
ls -la node_modules/.bin/prettier node_modules/.bin/astro 2>&1 | head -3
```

Expected: 両方 symlink で存在 (`npm ci` 完了状態)。

- [ ] **Step 3: 既存 spec commit 確認**

```bash
git log --oneline -5
```

Expected: 最新 commit `873ca1a` が `docs(spec): #289 PR 7a — Astro layout/ui inline migration spec 起草`。

### Task 0.2: 事前 grep (PR 7a スコープ inline 件数の baseline 取得)

- [ ] **Step 1: PR 7a スコープ全 8 ファイルで grep**

```bash
grep -rn 'style=' src/components/layout/ src/layouts/ src/components/ui/CategoryBadge.astro src/components/ui/ToolInfoSection.astro --include='*.astro' | tee /tmp/claude/pr7a-baseline-grep.log
```

Expected: 23 件 (Header 3 + Footer 4 + MobileDrawer 6 + Sidebar 2 + BaseLayout 1 + ToolLayout 5 + CategoryBadge 1 + ToolInfoSection 1 = 23)。

- [ ] **Step 2: PR 7a スコープ outside (pages/) で grep — touch 防止のため baseline のみ**

```bash
grep -rn 'style=' src/pages/ --include='*.astro' | wc -l
```

Expected: 37+ 件 (PR 7b スコープ、本 PR では touch しない)。

---

## Phase 1 — 親 Opus 順次実装 (5 commit)

### Task 1.1: `src/styles/global.css` に新規 7 class 追加

**Files:**

- Modify: `src/styles/global.css` (PR 5a 末尾の `.qr-video-preview` の直後に追加)

- [ ] **Step 1: 現在の global.css 末尾を確認**

```bash
tail -20 src/styles/global.css
```

Expected: PR 5a の `.qr-video-preview { background: #000; }` で `@layer components` block 内が終わっている (line 559-560 の `}` が `@layer` の閉じ)。

- [ ] **Step 2: `.qr-video-preview` 定義の直後に新規 7 class を挿入**

挿入位置: `.qr-video-preview { background: #000; }` の直後、`@layer components` の閉じ `}` の直前。

挿入する内容 (spec § global.css への追加 と完全一致):

```css
/* === PR 7a (#289): Astro layout/ui inline migration helpers === */

/* Caption variant: nav カテゴリラベル等 (letter-spacing wider than .caption) */
.caption-wide {
  font-size: 0.875rem;
  line-height: 1.7;
  letter-spacing: 0.08em;
}

/* Icon button color (44x44 SVG ボタンの neutral-700) */
.text-icon {
  color: var(--color-neutral-700);
}

/* CategoryBadge: tertiary color text/bg (PR 2 .text-primary 系列に追従) */
.text-tertiary {
  color: var(--color-tertiary);
}
.bg-badge {
  background: var(--color-badge-bg);
}

/* Footer container & meta text (Footer 専用、neutral 系 primitive 色を意味クラス化) */
.footer-bar {
  background: var(--color-neutral-900);
  color: var(--color-neutral-300);
}
.text-footer-meta {
  color: var(--color-neutral-500);
}

/* MobileDrawer backdrop (modal 背景の半透明 overlay)
     注意: rgba(17,24,39,0.5) は --color-neutral-900 の 50% alpha と同等。
     CSS variable 化は B 案完了後の semantic alias 整理 PR で検討 (今 YAGNI)。 */
.drawer-backdrop {
  background: rgba(17, 24, 39, 0.5);
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

Expected: `Result (X files): - 0 errors` (X = 既存ファイル数)。

- [ ] **Step 5: 新規 class が unit test の正規表現にヒットしないことの確認**

`inline-style-migration.test.ts` は `*.tsx` のみ対象なので global.css 編集は影響しないが、念のため migration tracker pass を確認:

```bash
npm run test -- inline-style-migration.test.ts 2>&1 | tail -10
```

Expected: 全 test pass。

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css
git commit -m "$(cat <<'EOF'
feat(styles): #289 PR 7a — global.css に新規 7 class 追加

Astro layout/ui inline migration の foundation。

- .caption-wide: nav カテゴリラベル (letter-spacing 0.08em variant of .caption)
- .text-icon: 44x44 アイコンボタン (var(--color-neutral-700))
- .text-tertiary / .bg-badge: CategoryBadge 専用色 token (PR 2 .text-primary 系列に追従)
- .footer-bar / .text-footer-meta: Footer 専用 (neutral 系 primitive を意味クラス化)
- .drawer-backdrop: MobileDrawer modal 背景 (rgba(17,24,39,0.5))

Refs: #289, #176 B 案 PR 7a (spec §global.css への追加)
EOF
)"
```

Expected: pre-commit hook (prettier + astro check) 通過、commit 成立。

### Task 1.2: Header.astro + Footer.astro inline 撤去

**Files:**

- Modify: `src/components/layout/Header.astro:7,13,22`
- Modify: `src/components/layout/Footer.astro:5,8,15,20`

- [ ] **Step 1: Header.astro の現状を確認**

```bash
sed -n '1,30p' src/components/layout/Header.astro
```

Expected: 3 件の inline (L7 / L13 / L22) を確認。

- [ ] **Step 2: Header.astro L7 (header element) を編集**

L7 の `style="height: 64px; background: var(--color-bg); border-color: var(--color-border);"` を削除し、L6 の `class="sticky top-0 z-50 border-b"` に utility / 既存 class を追加して `class="sticky top-0 z-50 border-b h-16 bg-default border-default"` にする。

- [ ] **Step 3: Header.astro L13 (logo a) を編集**

L13 の `style="color: var(--color-primary); letter-spacing: 0.02em;"` を削除し、L12 の `class="text-xl font-bold transition-opacity hover:opacity-80"` に追加して `class="text-xl font-bold transition-opacity hover:opacity-80 text-primary tracking-[0.02em]"` にする。

- [ ] **Step 4: Header.astro L22 (mobile menu button) を編集**

L22 の `style="width: 44px; height: 44px; color: var(--color-neutral-700);"` を削除し、L21 の `class="lg:hidden flex items-center justify-center rounded-md transition-colors"` に追加して `class="lg:hidden flex items-center justify-center rounded-md transition-colors w-11 h-11 text-icon"` にする。

- [ ] **Step 5: Header.astro の inline 残存ゼロ確認**

```bash
grep -n 'style=' src/components/layout/Header.astro
```

Expected: 0 件 (出力なし)。

- [ ] **Step 6: Footer.astro の現状を確認**

```bash
sed -n '1,30p' src/components/layout/Footer.astro
```

Expected: 4 件の inline (L5 / L8 / L15 / L20)。`.footer-link` の scoped `<style>` block 存在を確認 (本 PR では touch しない、`<element style="...">` 属性のみ撤去)。

- [ ] **Step 7: Footer.astro L5 (footer container) を編集**

L5 の `<footer style="background: var(--color-neutral-900); color: var(--color-neutral-300);">` を `<footer class="footer-bar">` に変更。

- [ ] **Step 8: Footer.astro L8 (paragraph) を編集**

L8 の `<p class="text-sm" style="letter-spacing: 0.02em; color: var(--color-neutral-500);">` を `<p class="text-sm text-footer-meta tracking-[0.02em]">` に変更。

- [ ] **Step 9: Footer.astro L15 / L20 (link) を編集**

L15 の `class="footer-link underline transition-colors"` の閉じ `>` 直前にある `style="letter-spacing: 0.02em;"` を削除し、`class="footer-link underline transition-colors tracking-[0.02em]"` に変更。L20 も同様。

- [ ] **Step 10: Footer.astro の inline 残存ゼロ確認**

```bash
grep -n 'style=' src/components/layout/Footer.astro
```

Expected: 既存 `<style>` scoped block (Astro 構文の `<style>...</style>` block) のみ検出される (これは本 PR で touch しない `.footer-link` 定義)。`style="..."` 属性は 0 件。

注意: `grep 'style='` は `<style>` block の開始タグも match するが、内容ではなく行頭タグのみ。`grep 'style="'` (ダブルクォート付) でより厳密に attribute のみ確認する場合:

```bash
grep -n 'style="' src/components/layout/Footer.astro
```

Expected: 0 件。

- [ ] **Step 11: prettier + astro check**

```bash
node_modules/.bin/prettier --write src/components/layout/Header.astro src/components/layout/Footer.astro
node_modules/.bin/astro check 2>&1 | tail -5
```

Expected: 0 errors。

- [ ] **Step 12: visual sanity check (build 試行)**

```bash
npm run build 2>&1 | tail -10
```

Expected: build success、`dist/` 生成。Tailwind が新規 utility (`tracking-[0.02em]` / `h-16` / `w-11` 等) を生成していることが暗黙確認できる。

- [ ] **Step 13: Commit**

```bash
git add src/components/layout/Header.astro src/components/layout/Footer.astro
git commit -m "$(cat <<'EOF'
refactor(layout): #289 PR 7a — Header / Footer Astro inline 撤去

- Header.astro: 3 件 (header bar / logo a / mobile menu button)
- Footer.astro: 4 件 (footer container / paragraph / link x 2)
- 既存 `<style>` scoped block (.footer-link) は touch せず

Refs: #289, #176 B 案 PR 7a (spec §1, §2)
EOF
)"
```

Expected: pre-commit hook 通過、commit 成立。

### Task 1.3: MobileDrawer.astro + Sidebar.astro inline 撤去

**Files:**

- Modify: `src/components/layout/MobileDrawer.astro:16,21,31,39,67,82`
- Modify: `src/components/layout/Sidebar.astro:19,37`

- [ ] **Step 1: MobileDrawer.astro の現状を確認**

```bash
sed -n '1,90p' src/components/layout/MobileDrawer.astro
```

Expected: 6 件の inline (L16 / L21 / L31 / L39 / L67 / L82) を確認。

- [ ] **Step 2: MobileDrawer.astro L16 (drawer root) を編集**

L16 の `style="z-index: 60;"` を削除し、L15 の `class="lg:hidden fixed inset-0"` に追加して `class="lg:hidden fixed inset-0 z-[60]"` にする。

- [ ] **Step 3: MobileDrawer.astro L21 (backdrop) を編集**

L21 の `<div id="mobile-drawer-backdrop" class="absolute inset-0" style="background: rgba(17,24,39,0.5);">` を `<div id="mobile-drawer-backdrop" class="absolute inset-0 drawer-backdrop">` に変更。

- [ ] **Step 4: MobileDrawer.astro L31 (drawer panel) を編集**

L30〜31 の `class="absolute right-0 top-0 h-full w-64 overflow-y-auto shadow-xl"` + `style="padding: 1rem; background: var(--color-bg);"` を `class="absolute right-0 top-0 h-full w-64 overflow-y-auto shadow-xl p-4 bg-default"` に統合。

- [ ] **Step 5: MobileDrawer.astro L39 (close button) を編集**

L38〜39 の `class="drawer-close-btn flex items-center justify-center rounded-md transition-colors"` + `style="width: 44px; height: 44px; color: var(--color-neutral-700);"` を `class="drawer-close-btn flex items-center justify-center rounded-md transition-colors w-11 h-11 text-icon"` に統合。

- [ ] **Step 6: MobileDrawer.astro L67 (nav category label) を編集**

L66〜67 の `class="mb-2 px-3 font-bold uppercase"` + `style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.08em; color: var(--color-muted);"` を `class="mb-2 px-3 font-bold uppercase caption-wide text-muted"` に統合。

- [ ] **Step 7: MobileDrawer.astro L82 (drawer link) を編集**

L81〜82 の existing `class={...}` (template literal) はそのままで、L82 末尾の `style="min-height: 44px; font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em;"` を削除。同 element の `class={...}` template literal 内に `min-h-11 caption` を末尾追加 (例: 旧 `flex items-center gap-2 rounded px-3 transition-colors drawer-link` → 新 `flex items-center gap-2 rounded px-3 transition-colors drawer-link min-h-11 caption`)。

注意: L81 は template literal を使う conditional class なので、表記:

```astro
class={
  `flex items-center gap-2 rounded px-3 transition-colors drawer-link min-h-11 caption ${isActive ? 'font-bold drawer-link--active' : 'drawer-link--inactive'}`
}
```

- [ ] **Step 8: MobileDrawer.astro の inline 残存ゼロ確認**

```bash
grep -n 'style="' src/components/layout/MobileDrawer.astro
```

Expected: 0 件。`<style>` scoped block (`.drawer-close-btn` / `.drawer-link--active` 等) は touch せず残存。

- [ ] **Step 9: Sidebar.astro の現状を確認**

```bash
sed -n '1,45p' src/components/layout/Sidebar.astro
```

Expected: 2 件の inline (L19 / L37)。

- [ ] **Step 10: Sidebar.astro L19 (nav category label) を編集**

MobileDrawer L67 と同パターン。L18〜19 の `class="mb-2 px-3 font-bold uppercase"` + `style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.08em; color: var(--color-muted);"` を `class="mb-2 px-3 font-bold uppercase caption-wide text-muted"` に統合。

- [ ] **Step 11: Sidebar.astro L37 (nav link) を編集**

MobileDrawer L82 と同パターン。L31〜37 の `class={...}` template literal の末尾に `min-h-11 caption` を追加し、L37 の `style="min-height: 44px; font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em;"` を削除。

- [ ] **Step 12: Sidebar.astro の inline 残存ゼロ確認**

```bash
grep -n 'style="' src/components/layout/Sidebar.astro
```

Expected: 0 件。

- [ ] **Step 13: prettier + astro check + build**

```bash
node_modules/.bin/prettier --write src/components/layout/MobileDrawer.astro src/components/layout/Sidebar.astro
node_modules/.bin/astro check 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Expected: 0 errors、build success。

- [ ] **Step 14: Commit**

```bash
git add src/components/layout/MobileDrawer.astro src/components/layout/Sidebar.astro
git commit -m "$(cat <<'EOF'
refactor(layout): #289 PR 7a — MobileDrawer / Sidebar Astro inline 撤去

- MobileDrawer.astro: 6 件 (drawer root z-index / backdrop / panel / close button / nav category label / drawer link)
- Sidebar.astro: 2 件 (nav category label / nav link)
- 共通 nav typography (.caption-wide / .caption / min-h-11) を MobileDrawer + Sidebar で再利用
- 既存 `<style>` scoped block (.drawer-* / .sidebar-*) は touch せず

Refs: #289, #176 B 案 PR 7a (spec §3, §4)
EOF
)"
```

Expected: pre-commit hook 通過、commit 成立。

### Task 1.4: BaseLayout.astro + ToolLayout.astro inline 撤去

**Files:**

- Modify: `src/layouts/BaseLayout.astro:45`
- Modify: `src/layouts/ToolLayout.astro:51,57,66,71,77`

- [ ] **Step 1: BaseLayout.astro L45 (body) を編集**

L45 の `<body class="min-h-screen" style="background: var(--color-bg-surface); color: var(--color-text);">` を `<body class="min-h-screen bg-surface text-default">` に変更。

- [ ] **Step 2: BaseLayout.astro の inline 残存ゼロ確認**

```bash
grep -n 'style="' src/layouts/BaseLayout.astro
```

Expected: 0 件。

- [ ] **Step 3: ToolLayout.astro の現状を確認**

```bash
sed -n '40,90p' src/layouts/ToolLayout.astro
```

Expected: 5 件の inline (L51 / L57 / L66 / L71 / L77)。

- [ ] **Step 4: ToolLayout.astro L51 (breadcrumb container) を編集**

L50〜51 の `class="mb-6 flex items-center gap-1.5"` + `style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em; color: var(--color-muted);"` を `class="mb-6 flex items-center gap-1.5 caption text-muted"` に統合。

- [ ] **Step 5: ToolLayout.astro L57 (breadcrumb current span) を編集**

L57 の `<span style="color: var(--color-text);">{tool.name}</span>` を `<span class="text-default">{tool.name}</span>` に変更。

- [ ] **Step 6: ToolLayout.astro L66 (tool icon container) を編集**

L65〜66 の `class="shrink-0"` + `style="color: var(--color-primary);"` を `class="shrink-0 text-primary"` に統合。

- [ ] **Step 7: ToolLayout.astro L71 (tool name H1) を編集**

L70〜71 の `class="font-bold"` + `style="font-size: 1.625rem; line-height: 1.5; letter-spacing: 0.02em; color: var(--color-text);"` を `class="font-bold text-[1.625rem] leading-[1.5] tracking-[0.02em] text-default"` に統合。

- [ ] **Step 8: ToolLayout.astro L77 (tool description) を編集**

L76〜77 の `class="mt-1"` + `style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em; color: var(--color-muted);"` を `class="mt-1 caption text-muted"` に統合。

- [ ] **Step 9: ToolLayout.astro の inline 残存ゼロ確認**

```bash
grep -n 'style="' src/layouts/ToolLayout.astro
```

Expected: 0 件。

- [ ] **Step 10: prettier + astro check + build**

```bash
node_modules/.bin/prettier --write src/layouts/BaseLayout.astro src/layouts/ToolLayout.astro
node_modules/.bin/astro check 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Expected: 0 errors、build success。

- [ ] **Step 11: Commit**

```bash
git add src/layouts/BaseLayout.astro src/layouts/ToolLayout.astro
git commit -m "$(cat <<'EOF'
refactor(layouts): #289 PR 7a — BaseLayout / ToolLayout Astro inline 撤去

- BaseLayout.astro: 1 件 (body bg + text color)
- ToolLayout.astro: 5 件 (breadcrumb container / breadcrumb span / icon / H1 / description)
- 単発 typography (H1 1.625rem) は Tailwind arbitrary 3 連で対応 (YAGNI、新規 class 化見送り)

Refs: #289, #176 B 案 PR 7a (spec §5, §6)
EOF
)"
```

Expected: pre-commit hook 通過、commit 成立。

### Task 1.5: CategoryBadge.astro + ToolInfoSection.astro inline 撤去

**Files:**

- Modify: `src/components/ui/CategoryBadge.astro:11`
- Modify: `src/components/ui/ToolInfoSection.astro:7`

- [ ] **Step 1: CategoryBadge.astro の現状を確認**

```bash
sed -n '1,20p' src/components/ui/CategoryBadge.astro
```

Expected: 1 件の inline (L11)。

- [ ] **Step 2: CategoryBadge.astro L11 を編集**

L10〜11 の既存 class 部分 (上の行) と `style="font-size: 0.875rem; line-height: 1; letter-spacing: 0.02em; color: var(--color-tertiary); background: var(--color-badge-bg);"` を統合。元 class が無ければ新規付与。

例 (L10〜11 の合体):

```astro
<span
  class="text-sm leading-none tracking-[0.02em] text-tertiary bg-badge ...(その他 既存 utility があればそのまま)"
></span>
```

注意: `text-sm` (= 0.875rem) + `leading-none` (= 1) は Tailwind 標準 utility。CategoryBadge.astro の既存 class を読んだ上で増分追加する。

- [ ] **Step 3: CategoryBadge.astro の inline 残存ゼロ確認**

```bash
grep -n 'style="' src/components/ui/CategoryBadge.astro
```

Expected: 0 件。

- [ ] **Step 4: ToolInfoSection.astro の現状を確認**

```bash
sed -n '1,15p' src/components/ui/ToolInfoSection.astro
```

Expected: 1 件の inline (L7)。

- [ ] **Step 5: ToolInfoSection.astro L7 を編集**

L6〜7 の `class="mt-10 rounded-lg p-6"` + `style="background: var(--color-bg); border: 1px solid var(--color-border);"` を `class="mt-10 rounded-lg p-6 bg-default border border-default"` に統合。

- [ ] **Step 6: ToolInfoSection.astro の inline 残存ゼロ確認**

```bash
grep -n 'style="' src/components/ui/ToolInfoSection.astro
```

Expected: 0 件。

- [ ] **Step 7: prettier + astro check + build**

```bash
node_modules/.bin/prettier --write src/components/ui/CategoryBadge.astro src/components/ui/ToolInfoSection.astro
node_modules/.bin/astro check 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Expected: 0 errors、build success。

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/CategoryBadge.astro src/components/ui/ToolInfoSection.astro
git commit -m "$(cat <<'EOF'
refactor(ui): #289 PR 7a — CategoryBadge / ToolInfoSection Astro inline 撤去

- CategoryBadge.astro: 1 件 (font-size + line-height + tracking + 色 token x2 = 5 declaration を text-sm/leading-none/tracking-[0.02em]/.text-tertiary/.bg-badge に分解)
- ToolInfoSection.astro: 1 件 (bg + border = 既存 .bg-default + Tailwind border + .border-default)

Refs: #289, #176 B 案 PR 7a (spec §7, §8)
EOF
)"
```

Expected: pre-commit hook 通過、commit 成立。

---

## Phase 2 — 検証 (親 Opus 直接実行)

### Task 2.1: PR 7a スコープの inline 全廃確認

- [ ] **Step 1: PR 7a 8 ファイルで grep**

```bash
grep -rn 'style="' src/components/layout/ src/layouts/ src/components/ui/CategoryBadge.astro src/components/ui/ToolInfoSection.astro --include='*.astro'
```

Expected: 0 件 (出力なし)。

- [ ] **Step 2: pages/ は touch していないことを再確認**

```bash
grep -rn 'style="' src/pages/ --include='*.astro' | wc -l
```

Expected: 37+ 件 (Phase 0 baseline と同数。本 PR で減らない、PR 7b スコープ)。

### Task 2.2: a11y 退化検知 (aria-\* 削除なし)

- [ ] **Step 1: 全 commit の差分で aria-\* 削除行を検索**

```bash
git diff origin/develop --unified=0 -- '*.astro' | grep -E '^-' | grep -E 'aria-|role=' | grep -v '^---'
```

Expected: 0 件 (aria-\* 削除なし)。検出されたら **PR 作成前に必ず原因を確認**して修正 (CLAUDE.md 9.6 / shared-agent-rules.md)。

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

Expected: 全 spec pass。`style-src 'unsafe-inline'` 維持下 (PR 7a では削除しない、PR 8 で flip) のため CSP 違反は出ない設計。

- [ ] **Step 3: 失敗時の判定**

env 由来 (`ECONNREFUSED 4321` / `webServer was not ready` / `hydration timeout`) の場合は再実行。テスト本来の失敗 (assertion error / element not found) は実装修正。layout 系の class 化で text 表示や DOM 構造に影響が出ていれば該当 spec で検出される。

### Task 2.5: 手動視認 (browser、可能なら)

> **note**: 親 Opus セッション内で MCP playwright MCP が利用可能なら手動視認を実施。利用不可なら CI VRT に委譲して step skip。

- [ ] **Step 1: preview server 起動 (Step 1 の E2E pretest で port 解放済前提)**

```bash
npm run preview &
sleep 3
```

- [ ] **Step 2: Header / Footer / Sidebar / ToolLayout 表示視認**

`http://localhost:4321/` (Header / Footer / Sidebar が見える) と `http://localhost:4321/tools/jwt-decoder` (ToolLayout の breadcrumb / H1 / カテゴリバッジ) の表示が PR 前後で同等であることを目視確認。

- [ ] **Step 3: mobile viewport (375px) で MobileDrawer 開閉視認**

ハンバーガーボタンクリック → drawer slide in → backdrop 半透明 → close ボタン → drawer slide out。

- [ ] **Step 4: preview server 停止**

```bash
npm run pretest:e2e
```

---

## Phase 3 — 進捗 doc 更新 + PR 作成 (親 Opus 直接実行)

### Task 3.1: 進捗 doc 更新

**Files:**

- Modify: `docs/projects/issue-176-b-plan-progress.md`

- [ ] **Step 1: 進捗状況テーブルに PR 7a 行を追加**

「進捗状況」テーブル (PR 5b の次の行) に以下を追加:

```markdown
| PR 7a | layout/\* 4 + layouts/\* 2 + ui/\*.astro 2 (Header / Footer / MobileDrawer / Sidebar / BaseLayout / ToolLayout / CategoryBadge / ToolInfoSection) — 23 inline 撤去 + 新規 7 class | 🔄 PR open | (PR 番号は PR 作成後に追記) |
```

PR 6 の状態を `✅ merged ([#290](...) merged 4505bcf)` に更新 (現状「未着手」で残っている可能性、確認の上)。

- [ ] **Step 2: 「着手済 PR の prerequisite / 同梱 issue 履歴」section に PR 7a の subsection を追加**

```markdown
### PR 7a (#TBD)

- **新規 class**: 7 件 (`.caption-wide` / `.text-icon` / `.text-tertiary` / `.bg-badge` / `.footer-bar` / `.text-footer-meta` / `.drawer-backdrop`) を `src/styles/global.css` に追加
- **再利用**: `.caption` / `.text-default` / `.text-muted` / `.text-primary` / `.bg-default` / `.bg-surface` / `.border-default` (PR 1〜5b 既存資産で 14 件カバー)
- **Tailwind arbitrary**: `tracking-[0.02em]` x 5 / `text-[1.625rem] leading-[1.5]` x 1 / `z-[60]` x 1 / `text-sm leading-none` x 1 — 単発 typography は class 化見送り (YAGNI、PR 5b と同 judgement)
- **scope 外**: `src/pages/*.astro` 7 ファイル / 37 件 (PR 7b)、`style-src 'unsafe-inline'` 削除 (PR 8)、`inline-style-migration.test.ts` の Astro 検出網追加 (PR 7b 完了後)
- **subagent 非委譲**: 親 Opus 直接実装 + 親直接 E2E (PR 6 / 292 と同パターン、memory `feedback_subagent_verification_trust.md`)
```

- [ ] **Step 3: prettier**

```bash
node_modules/.bin/prettier --write docs/projects/issue-176-b-plan-progress.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/projects/issue-176-b-plan-progress.md
git commit -m "$(cat <<'EOF'
chore(docs): #289 PR 7a — 進捗 doc に PR 7a 行と prerequisite 履歴を追加

- 進捗状況テーブルに PR 7a 行追加 (8 ファイル / 23 inline / 7 新規 class)
- 「着手済 PR の prerequisite / 同梱 issue 履歴」に PR 7a subsection 追加 (新規 class / 再利用 class / Tailwind arbitrary / scope 外を明示)

Refs: #289, #176 B 案 PR 7a
EOF
)"
```

Expected: pre-commit hook 通過、commit 成立。

### Task 3.2: PR 作成 pre-check (3 つ必須、CLAUDE.md / shared-agent-rules.md)

- [ ] **Step 1: develop ベース一致**

```bash
test "$(git rev-parse origin/develop)" = "$(git merge-base HEAD origin/develop)" && echo "✅ base develop 一致" || echo "❌ rebase が必要"
```

Expected: `✅ base develop 一致`。

- [ ] **Step 2: スコープ確認 (想定外ファイルなし)**

```bash
git diff origin/develop --name-only
```

Expected:

```
docs/projects/issue-176-b-plan-progress.md
docs/superpowers/plans/2026-05-08-issue-289-pr7a-astro-layout-ui.md
docs/superpowers/specs/2026-05-08-issue-289-pr7a-astro-inline-layout-ui-design.md
src/components/layout/Footer.astro
src/components/layout/Header.astro
src/components/layout/MobileDrawer.astro
src/components/layout/Sidebar.astro
src/components/ui/CategoryBadge.astro
src/components/ui/ToolInfoSection.astro
src/layouts/BaseLayout.astro
src/layouts/ToolLayout.astro
src/styles/global.css
```

11 ファイル (spec / plan / progress doc / global.css / Astro 8) のみ。pages/ や `src/utils/` 等の touch がないことを確認。

- [ ] **Step 3: a11y 保護 (aria-\* 削除なし)**

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

`#176` B 案 follow-up `#289` のうち、**layout 系 + ui/\*.astro 2 件** の Astro `<element style="...">` 属性 23 件 / 8 ファイル を CSS class に移行。新規 7 class を `src/styles/global.css` `@layer components` に追加し、Tailwind utility / 既存意味クラスと併用して移行完了。

`style-src 'unsafe-inline'` の削除は本 PR では実施せず、後続 PR 7b (pages/\*.astro 7 ファイル) と PR 8 (最終 flip) に委譲。

## 変更内容

### 新規 7 class (`src/styles/global.css`)

| class | 用途 | 件数 |
| --- | --- | --- |
| `.caption-wide` | nav カテゴリラベル (letter-spacing 0.08em) | 2 |
| `.text-icon` | 44x44 アイコンボタン (var(--color-neutral-700)) | 2 |
| `.text-tertiary` | CategoryBadge text (var(--color-tertiary)) | 1 |
| `.bg-badge` | CategoryBadge bg (var(--color-badge-bg)) | 1 |
| `.footer-bar` | Footer container (neutral-900 bg + neutral-300 text) | 1 |
| `.text-footer-meta` | Footer copyright text (var(--color-neutral-500)) | 1 |
| `.drawer-backdrop` | MobileDrawer modal 背景 (rgba(17,24,39,0.5)) | 1 |

### 既存 class 再利用 (14 件カバー)

`.caption` / `.text-default` / `.text-muted` / `.text-primary` / `.bg-default` / `.bg-surface` / `.border-default` を活用。

### Tailwind arbitrary value (8 件)

`tracking-[0.02em]` x 5 / `text-[1.625rem] leading-[1.5]` x 1 / `z-[60]` x 1 / `text-sm leading-none` x 1 — 単発 typography は class 化見送り (YAGNI、PR 5b と同 judgement)。

### touch ファイル (8 + 1 = 9 ファイル)

- `src/styles/global.css` (新規 7 class 追加)
- `src/components/layout/Header.astro` (3 件)
- `src/components/layout/Footer.astro` (4 件)
- `src/components/layout/MobileDrawer.astro` (6 件)
- `src/components/layout/Sidebar.astro` (2 件)
- `src/layouts/BaseLayout.astro` (1 件)
- `src/layouts/ToolLayout.astro` (5 件)
- `src/components/ui/CategoryBadge.astro` (1 件)
- `src/components/ui/ToolInfoSection.astro` (1 件)

既存 Astro `<style>` scoped block (`Footer.astro` / `MobileDrawer.astro` / `Sidebar.astro` の `.footer-link` / `.drawer-close-btn` 等) は本 PR では touch せず維持。これらは Astro `security.csp` で auto-hash 化されるため CSP gate を通過済 (= 本 issue #289 の対象外)。

## scope 外 (本 PR で実施しないこと)

- `src/pages/*.astro` 7 ファイル / 37 件 (PR 7b)
- `style-src 'unsafe-inline'` 削除 + `stripMetaStyleSrc` 撤去 (PR 8)
- `inline-style-migration.test.ts` への `*.astro` 検出網追加 (PR 7b 完了後 = 全 65 件移行後)
- `decisions.md [067]` (PR 8)

## 検証

- [x] `npm run test` 全 pass
- [x] `node_modules/.bin/astro check` 0 errors
- [x] `npm run test:e2e` 全 spec pass (親直接、`style-src 'unsafe-inline'` 維持下のため CSP 違反は本 PR scope では発生しない)
- [x] PR 7a 8 ファイルで `grep -n 'style="' ...` = 0 件
- [x] aria-\* / role 属性削除なし (`git diff origin/develop -- '*.astro' | grep '^-' | grep aria-` = 0 件)
- [ ] VRT (CI Linux runner): post-push の自動実行で確認、意図しない pixel diff があれば fix

## 関連

- 起票 issue: #289
- 上位 issue: #176 (B 案 = `style-src 'unsafe-inline'` 削減)
- 直前 PR: #290 (B 案 PR 6 — scope 縮小、`styles.ts` 削除 + tracker glob 化)
- 後続 PR: PR 7b (pages/\*.astro 7 ファイル) + PR 8 (最終 flip — `_headers` flip + `decisions.md [067]` + Astro 検出網追加)
- spec: `docs/superpowers/specs/2026-05-08-issue-289-pr7a-astro-inline-layout-ui-design.md`
- plan: `docs/superpowers/plans/2026-05-08-issue-289-pr7a-astro-layout-ui.md`
- 進捗 SoT: `docs/projects/issue-176-b-plan-progress.md`

## レビュー時の注目点

- 新規 7 class の命名 (`.caption-wide` / `.text-icon` 等) が PR 1〜5b の既存命名 family と一貫しているか
- Astro `<style>` scoped block (Footer / MobileDrawer / Sidebar) を意図せず touch していないか (= scoped CSS は CSP auto-hash で通る別経路、本 PR scope 外)
- visual regression: layout 系のため全ページ波及。VRT で意図しない pixel diff が出ていないか
EOF
```

- [ ] **Step 2: push**

```bash
git push -u origin feature/issue-289-pr7a-astro-layout-ui
```

Expected: push 成立、CI workflow trigger。

- [ ] **Step 3: PR 作成 (gh pr create、--base develop 必須、--body-file 必須)**

```bash
gh pr create \
  --base develop \
  --title "refactor(ui): #289 PR 7a — Astro layout/ui inline 撤去 (8 ファイル / 23 件 / 新規 7 class)" \
  --body-file /tmp/claude/pr_body.md
```

Expected: PR URL を取得、PR 作成成立。

- [ ] **Step 4: PR URL を進捗 doc / plan に追記 (任意 follow-up)**

> 本 PR merged 後の chore PR or PR 7b 着手時に「(PR 番号は PR 作成後に追記)」 placeholder を実 PR 番号に置換。本 PR 内で実施しない (push 済 commit を amend するのは memory `feedback_branch_workflow.md` で議論余地あり、避ける)。

---

## Self-Review Checklist (Plan 起草後の inline check)

### Spec coverage

- [x] Spec § ゴール (8 ファイル / 23 件 / 7 新規 class) → Phase 1 で全 file カバー
- [x] Spec § non-goal (pages / style-src / Astro 検出網) → Phase 0 Step 2 baseline + plan 全体で touch しない
- [x] Spec § global.css への追加 → Task 1.1 で 7 class 追加
- [x] Spec § 採用する設計 (ファイル別) §1〜§8 → Task 1.2〜1.5 で全 file カバー
- [x] Spec § 検証戦略 (unit / type / E2E / VRT / 手動) → Task 2.1〜2.5 で全項目カバー
- [x] Spec § ブランチ命名 / コミット粒度 → Phase 1 で 5 commit + Phase 3 で 1 commit = 計 6 commit、spec § コミット粒度と一致
- [x] Spec § リスクと緩和 → Task 2.2 (a11y 退化検知) / Task 2.4 (E2E) で kept

### placeholder scan

- [x] "TBD" 残存箇所: 進捗 doc 更新 (Task 3.1) と PR 7a subsection (Task 3.1 Step 2) の `(PR 番号は PR 作成後に追記)` 1 箇所のみ。これは PR 作成後にしか確定しないため意図的 placeholder。
- [x] "TODO" / "implement later" / "fill in details" なし
- [x] "Add appropriate error handling" / "handle edge cases" なし
- [x] "Write tests for the above" 等 abstract test 指示なし
- [x] 全 step に exact code / exact command を記載

### type / class consistency

- [x] 新規 class 名 (`.caption-wide` / `.text-icon` / `.text-tertiary` / `.bg-badge` / `.footer-bar` / `.text-footer-meta` / `.drawer-backdrop`) は spec § global.css への追加 と完全一致
- [x] Tailwind utility 名 (`h-16` / `w-11` / `h-11` / `min-h-11` / `p-4` / `tracking-[0.02em]` / `z-[60]` / `text-sm` / `leading-none` / `text-[1.625rem]` / `leading-[1.5]`) は plan 内一貫
- [x] 既存 class (`.caption` / `.text-default` / `.text-muted` / `.text-primary` / `.bg-default` / `.bg-surface` / `.border-default`) は global.css 既存定義と一致

### scope check

本 plan は 1 PR (PR 7a) 範囲。pages/ と CSP flip は別 plan (PR 7b / PR 8) で起草される、本 plan scope 外。
