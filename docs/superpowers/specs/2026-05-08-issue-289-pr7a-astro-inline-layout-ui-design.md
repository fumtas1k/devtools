# `#176` B 案 follow-up #289 PR 7a — Astro inline `style="..."` 属性 (layout/\* + ui/\*.astro 2) 移行

> **位置付け**: B 案 (style-src 削減) follow-up issue [#289](https://github.com/fumtas1k/devtools/issues/289) の 3 PR 分割のうち **PR 7a** (波及大の layout 系)。
>
> - PR 7a (本 spec): `src/components/layout/*.astro` 4 件 + `src/layouts/*.astro` 2 件 + `src/components/ui/{CategoryBadge,ToolInfoSection}.astro` 2 件 = **8 ファイル / 23 件**
> - PR 7b: `src/pages/*.astro` 7 ファイル (別セッション)
> - PR 8 最終 flip: `_headers` から `style-src 'unsafe-inline'` 削除 + `stripMetaStyleSrc` 撤去 + `decisions.md [067]` 追加 (PR 6 で revert した `8ae383a` のコードを再利用)
>
> **前提となる context**:
>
> - 本 spec は B 案 PR 6 ([#290](https://github.com/fumtas1k/devtools/pull/290), `4505bcf`) merged 後の世界。`styles.ts` 削除 + migration tracker glob 化は済。
> - PR 1〜5b で **React `style={{}}` を CSS class 化**は完了。本 PR は Astro `<element style="...">` 属性側を扱う。
> - 元 spec [`docs/superpowers/specs/2026-05-07-issue-176-b6-csp-flip-and-cleanup-design.md`](./2026-05-07-issue-176-b6-csp-flip-and-cleanup-design.md) の post-mortem 部分参照: PR 6 で Astro 65 件残存が判明し scope 縮小、本 issue へ委譲。

---

## ゴール

`src/components/layout/*.astro` (4 件) + `src/layouts/*.astro` (2 件) + `src/components/ui/{CategoryBadge,ToolInfoSection}.astro` (2 件) の **8 ファイル / 23 件の Astro `<element style="...">` 属性** を全廃し、CSS class (Tailwind utility / 既存 `@layer components` 意味クラス / 新規 7 class) に置換する。

**non-goal** (本 PR で実施しないこと):

- `src/pages/*.astro` の inline 属性移行 (PR 7b で対応)
- `style-src 'unsafe-inline'` の削除 (PR 8 最終 flip で実施)
- `astro.config.mjs` の `stripMetaStyleSrc()` 撤去 (PR 8)
- `inline-style-migration.test.ts` への `*.astro` 検出網追加 (PR 7b 完了後 = 全 65 件移行後に追加。PR 7a 単独で追加すると pages 側 37 件残存で false positive fail する)
- `decisions.md [067]` 追加 (PR 8)
- visual regression baseline の意図的更新 (差分が出たら本 PR レビュー時に都度判断)

---

## なぜ独立 PR (PR 7a / 7b 分割) か

issue [#289](https://github.com/fumtas1k/devtools/issues/289) で user 判断済。本セクションは判断根拠を残しておく。

### 1. PR size discipline (memory `feedback_pr_size.md`)

65 件 / 15 ファイル を 1 PR に bundle すると review 単位として過大。10 commit / 500 行の自然分割閾値を超える。layout 系 (波及大) と pages 系 (個別ページ) は影響範囲・review 観点が異質で、分けることで reviewer の認知負荷が下がる。

### 2. visual regression risk の隔離

layout 系 (Header / Footer / Sidebar / MobileDrawer / BaseLayout / ToolLayout) は **全ページに波及**するため、VRT pixel diff があれば全 spec に影響が広がる。pages 系 (個別ページ) は対象ページのみ影響。先に layout 側を migrate して baseline を安定化させ、後続 pages 側 PR で対象ページ単位の diff を限定するほうが原因切り分けしやすい。

### 3. 失敗時の rollback 単位

万一 layout 系で意図せぬ regression が出た場合、PR 7a 単位で revert すれば pages 系の作業は影響を受けない。

### 4. ui/\*.astro 2 件 を PR 7a に同梱する根拠

`CategoryBadge.astro` と `ToolInfoSection.astro` は各 1 件のみ。PR 7b 単独でも対応可能だが、layout 系で集約した新規 class (`.text-tertiary` / `.bg-badge`) と semantic 系列 (`.text-primary` / `.bg-default` / `.border-default`) の整合をとるため、layout 側に同梱した方が新規 class の合意形成が 1 PR で完結する。pages 系 PR 7b では新規 class 追加なし (PR 7a までで 100% カバー) で進める前提。

---

## 採用する設計 (ファイル別)

### 表記ルール

各表の「置換後」列での `class="... XXX"` 表記は、**元の `class` 属性を維持し、新規 class (XXX) を末尾に追加**することを意味する。`class` 属性を新規付与する場合 (元属性が無いケース) はその旨明記する。

### 既存 Astro `<style>` scoped block との関係

`Footer.astro` / `MobileDrawer.astro` / `Sidebar.astro` は既に Astro `<style>` scoped block を持ち、`.footer-link` / `.drawer-close-btn` / `.drawer-link` / `.sidebar-link` 等 component-scoped class を局所定義している。これら scoped block は Astro `security.csp` で auto-hash 化されるため CSP gate を通過する (= 本 issue #289 の対象外)。

本 PR の新規 7 class を「scoped block に追加するか global.css `@layer components` に追加するか」は brainstorming Q3 で議論し、**user 判断 = global.css 集約** (Q3 で「`Footer 関連を Astro <style> scoped block に変更`」選択肢を見送り)。理由:

- PR 1〜5b で確立した「`@layer components` 集約」パターンとの一貫性
- `.caption-wide` / `.text-icon` 等は cross-file 利用 (MobileDrawer + Sidebar / Header + MobileDrawer) のため scoped block 化が成立しない (component 跨ぎの依存になる)
- `.text-tertiary` / `.bg-badge` は PR 2 で確立した「色 token text/bg utility」series の延長
- Footer/MobileDrawer 専用 class (`.footer-bar` / `.text-footer-meta` / `.drawer-backdrop`) は scoped block 化の正当性が単体で見ればあるが、上 3 つを global に置く以上、命名 prefix で十分隔離できる (= scoped block と global の二重 home を作る不整合を避ける)

**将来の整理 PR (B 案完了後) で scoped block 化を再検討する余地は残す**が、本 PR scope 外。

### 1. `src/components/layout/Header.astro` (3 件)

| 行  | inline                                                                                  | 置換後                                                                   |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| L7  | `style="height: 64px; background: var(--color-bg); border-color: var(--color-border);"` | `class="... h-16 bg-default border-default"` (既存 utility + 既存 class) |
| L13 | `style="color: var(--color-primary); letter-spacing: 0.02em;"`                          | `class="... text-primary tracking-[0.02em]"` (既存 + arbitrary)          |
| L22 | `style="width: 44px; height: 44px; color: var(--color-neutral-700);"`                   | `class="... w-11 h-11 text-icon"` (Tailwind utility + 新規 `.text-icon`) |

### 2. `src/components/layout/Footer.astro` (4 件)

| 行  | inline                                                                           | 置換後                                                                                      |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| L5  | `style="background: var(--color-neutral-900); color: var(--color-neutral-300);"` | `class="footer-bar"` (新規 1 class に集約)                                                  |
| L8  | `style="letter-spacing: 0.02em; color: var(--color-neutral-500);"`               | `class="text-sm text-footer-meta tracking-[0.02em]"` (新規 `.text-footer-meta` + arbitrary) |
| L15 | `style="letter-spacing: 0.02em;"` (link)                                         | `class="... tracking-[0.02em]"` (arbitrary)                                                 |
| L20 | `style="letter-spacing: 0.02em;"` (link)                                         | `class="... tracking-[0.02em]"` (arbitrary)                                                 |

> **note**: Footer container の `color: var(--color-neutral-300)` は `.footer-bar` で `color` 設定済 → 子要素の link は `inherit` で OK (一部 link は `color` を別途指定したい場合 spec で明示)。Footer L8 paragraph は `color: var(--color-neutral-500)` で container と異なるため別 class `.text-footer-meta` に分離。

### 3. `src/components/layout/MobileDrawer.astro` (6 件)

| 行  | inline                                                                                              | 置換後                                                               |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| L16 | `style="z-index: 60;"`                                                                              | `class="... z-[60]"` (arbitrary)                                     |
| L21 | `style="background: rgba(17,24,39,0.5);"` (backdrop)                                                | `class="absolute inset-0 drawer-backdrop"` (新規 `.drawer-backdrop`) |
| L31 | `style="padding: 1rem; background: var(--color-bg);"`                                               | `class="... p-4 bg-default"` (Tailwind + 既存)                       |
| L39 | `style="width: 44px; height: 44px; color: var(--color-neutral-700);"`                               | `class="... w-11 h-11 text-icon"` (Header L22 と同パターン)          |
| L67 | `style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.08em; color: var(--color-muted);"` | `class="caption-wide text-muted"` (新規 `.caption-wide` + 既存)      |
| L82 | `style="min-height: 44px; font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em;"`          | `class="... min-h-11 caption"` (Tailwind + 既存 `.caption` 再利用)   |

### 4. `src/components/layout/Sidebar.astro` (2 件)

| 行  | inline                                                                                              | 置換後                                                                |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| L19 | `style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.08em; color: var(--color-muted);"` | `class="... caption-wide text-muted"` (MobileDrawer L67 と同パターン) |
| L37 | `style="min-height: 44px; font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em;"`          | `class="... min-h-11 caption"` (MobileDrawer L82 と同パターン)        |

### 5. `src/layouts/BaseLayout.astro` (1 件)

| 行  | inline                                                                          | 置換後                                                           |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| L45 | `style="background: var(--color-bg-surface); color: var(--color-text);"` (body) | `class="min-h-screen bg-surface text-default"` (既存 class のみ) |

### 6. `src/layouts/ToolLayout.astro` (5 件)

| 行  | inline                                                                                              | 置換後                                                                                      |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| L51 | `style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em; color: var(--color-muted);"` | `class="... caption text-muted"` (既存)                                                     |
| L57 | `style="color: var(--color-text);"`                                                                 | `class="text-default"` (既存)                                                               |
| L66 | `style="color: var(--color-primary);"`                                                              | `class="... text-primary"` (既存)                                                           |
| L71 | `style="font-size: 1.625rem; line-height: 1.5; letter-spacing: 0.02em; color: var(--color-text);"`  | `class="text-[1.625rem] leading-[1.5] tracking-[0.02em] text-default"` (arbitrary 3 + 既存) |
| L77 | `style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em; color: var(--color-muted);"` | `class="caption text-muted"` (L51 と同パターン)                                             |

> **note**: ToolLayout H1 (L71) は単発の typography pattern (`1.625rem; 1.5; 0.02em`) で、PR 5b の class 追加判断基準 (再利用 OR component-scoped 必須挙動) を満たさない。Tailwind v4 の arbitrary value 3 連 (`text-[1.625rem] leading-[1.5] tracking-[0.02em]`) で表現する。class 化したくなる誘惑はあるが YAGNI 採用 (PR 1〜5b と同じ judgement)。

### 7. `src/components/ui/CategoryBadge.astro` (1 件)

| 行  | inline                                                                                                                                  | 置換後                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| L11 | `style="font-size: 0.875rem; line-height: 1; letter-spacing: 0.02em; color: var(--color-tertiary); background: var(--color-badge-bg);"` | `class="... text-sm leading-none tracking-[0.02em] text-tertiary bg-badge"` (新規 2 class + Tailwind utility) |

> **note**: 既存 `.badge-category` (PR 2 の qr-ticket pill 専用、`color: primary; border: primary;`) とは色 token も用途も異なるため再利用しない。`.text-tertiary` / `.bg-badge` は PR 2 で確立した「色 token text/bg utility」series (`.text-primary` / `.bg-default` 等) に追従する命名。

### 8. `src/components/ui/ToolInfoSection.astro` (1 件)

| 行  | inline                                                                        | 置換後                                                |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| L7  | `style="background: var(--color-bg); border: 1px solid var(--color-border);"` | `class="... bg-default border border-default"` (既存) |

---

## `src/styles/global.css` への追加 (新規 7 class)

```css
@layer components {
  /* === PR 7a: Astro inline migration helpers === */

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
}
```

> **設計上の判断**:
>
> - **letter-spacing 0.02em は class 化せず Tailwind arbitrary** で対応 (4 件出現するが、`tracking-[0.02em]` は Tailwind v4 で auto-utility 化されるため class 追加は YAGNI)。`.caption` family と区別しやすくするためにも arbitrary 維持が望ましい。
> - **`.drawer-backdrop` は rgba 直書きで OK** (`color-mix(in srgb, var(--color-neutral-900) 50%, transparent)` でも書けるが、PR 1〜5 の前例で rgba 直書きあり (`.qr-video-preview` の `#000` 等)。color-mix 化は B 案完了後の整理 PR スコープ)。
> - **`.text-icon` の命名理由**: `text-neutral-700` は Tailwind 標準 auto-utility と衝突するため避ける。`var(--color-neutral-700)` は「アイコン色」が唯一の用途のため意味クラス化が成立する。

---

## `inline-style-migration.test.ts` への扱い

**本 PR では拡張しない**。理由:

- 現状 tracker は `src/components/**/*.tsx` のみ glob 対象 (PR 6 で確立)。
- PR 7a 完了時点では `src/pages/*.astro` 7 ファイル / 37 件 が未移行で残存しているため、Astro 検出網 (`src/**/*.astro` + `style="` regex) を本 PR で追加すると **PR 7b までの間 fail し続ける** (red CI ban)。
- Astro 検出網の追加は **PR 7b 内 (= 全 65 件移行完了時)** または **PR 8 (最終 flip)** で対応。PR 7b spec で再判断する。

---

## consumer 変更範囲 (PR 7a で touch するファイル)

```
src/components/layout/Header.astro
src/components/layout/Footer.astro
src/components/layout/MobileDrawer.astro
src/components/layout/Sidebar.astro
src/components/ui/CategoryBadge.astro
src/components/ui/ToolInfoSection.astro
src/layouts/BaseLayout.astro
src/layouts/ToolLayout.astro
src/styles/global.css                  # 新規 7 class 追加
```

合計 9 ファイル。

---

## 検証戦略

### unit / type check

- `npm run test` (Vitest) — global.css に直接依存する unit test は無いため、影響は migration tracker のみ。本 PR では tracker 拡張なしのため pass 維持を確認。
- `astro check` — typing 影響なし、pass 維持を確認。

### E2E (親直接実行、subagent 委譲なし)

memory `feedback_subagent_verification_trust.md` 準拠で **親 Opus が直接実行** (PR 6 / #292 と同パターン)。

```
npm run test:e2e
```

- layout 系の class 化は全 spec 横断 (Header / Footer / Sidebar) のため、**全 E2E pass** が最低条件。
- `applyProductionCsp` を効かせる spec (uuid-v7 / ulid-generator / config-converter 等) は `style-src 'unsafe-inline'` 維持下で動作するため、本 PR scope では新たな違反は発生しない (PR 8 で `'unsafe-inline'` 削除時に Astro inline 撤去の意義が CSP 側で実証される設計)。

### VRT (Visual Regression Test)

- CI Linux runner で `npm run test:vrt` (memory `feedback_vrt_ci_only.md`)。
- layout 系の class 化は **理論上 pixel-perfect** (Tailwind utility / 既存 class / 新規 class が inline と同等 CSS を生成するため)。差分が出たら spec / browser 検証で意図確認。
- 意図的差分があれば `update-visual-baseline.yml` workflow で baseline 更新。

### 手動検証 (browser)

- `/` (index) で Header / Footer / Sidebar の見た目が PR 前後で同一であることを確認。
- mobile viewport (375px 等) で MobileDrawer 開閉、backdrop 半透明 / hamburger ボタン色が同一であることを確認。
- ツールページ (例: `/tools/jwt-decoder`) で ToolLayout の breadcrumb / H1 / カテゴリバッジ表示が同一であることを確認。

---

## バッチ計画における本 PR の位置付け

| #              | スコープ                                                                             | 状態           |
| -------------- | ------------------------------------------------------------------------------------ | -------------- |
| PR 1〜5b       | React `style={{}}` 全廃 (B 案 PR 1〜5b)                                              | ✅ merged      |
| PR 6 (#290)    | `styles.ts` 削除 + migration tracker glob 化                                         | ✅ merged      |
| **PR 7a**      | **本 spec — Astro layout/ui inline 移行**                                            | 🔄 spec 起草中 |
| PR 7b          | Astro pages/ inline 移行 (37 件 / 7 ファイル)                                        | 未着手         |
| PR 8 最終 flip | `_headers` flip + `stripMetaStyleSrc` 撤去 + `decisions.md [067]` + Astro 検出網追加 | 未着手         |

---

## ブランチ命名 / コミット粒度 / 並列分担

### ブランチ

`feature/issue-289-pr7a-astro-layout-ui` (worktree path: `.claude/worktrees/issue-289-pr7a/`、base: `origin/develop` 必須 — memory `feedback_worktree_base_branch.md`)。

### 並列分担

**subagent 委譲なし、親 Opus 直接実装**。PR 6 / 292 と同パターン (memory `feedback_subagent_verification_trust.md`)。

理由:

- 8 ファイルで 23 件、規模が小さい (PR 5a の 31 件 / 3 ツール、PR 5b の 9 件 / 5 ツールと同等以下)。
- layout 系の class 化は VRT 影響評価が必要で、検証主体が親なら commit-and-verify-and-iterate が tight loop で回せる。
- subagent の「pass」報告 false positive を避ける (memory 同上)。

### コミット粒度

ファイル単位で意味的に commit を分け、4〜6 commit 程度を想定:

1. `feat(styles): #289 PR 7a — global.css に新規 7 class 追加 (caption-wide / text-icon / text-tertiary / bg-badge / footer-bar / text-footer-meta / drawer-backdrop)`
2. `refactor(layout): #289 PR 7a — Header / Footer Astro inline 撤去`
3. `refactor(layout): #289 PR 7a — Sidebar / MobileDrawer Astro inline 撤去`
4. `refactor(layouts): #289 PR 7a — BaseLayout / ToolLayout Astro inline 撤去`
5. `refactor(ui): #289 PR 7a — CategoryBadge / ToolInfoSection Astro inline 撤去`
6. `chore(docs): #289 PR 7a — 進捗 doc 更新` — `docs/projects/issue-176-b-plan-progress.md` に PR 7a 行を追加

> 進捗 doc 更新は本 PR 内に同梱 (議論ポイント §5 と整合)。merged 後 chore PR にする選択肢もあるが、PR 7b で次の更新が来るためまとめる方が doc lag が少ない。

---

## リスクと緩和

| リスク                                                                                                  | 程度 | 緩和策                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| layout 系 (全ページ波及) で意図せぬ visual regression                                                   | 中   | VRT pixel diff で検出 → spec 横断確認 → 意図的差分なら baseline 更新。PR 7a を独立 PR にして rollback を容易化 (本 spec § なぜ独立 PR §1〜§3)                                                           |
| Tailwind v4 の arbitrary value (`tracking-[0.02em]`) が `@layer components` の class より特異性で負ける | 低   | Tailwind utility は CSS 生成順で `@layer utilities` に入る。`@layer components` (PR 1 で導入) は utilities より前 layer のため、両者併用しても期待どおりの優先順位 (utility 勝ち、これは Tailwind 標準) |
| `.text-icon` の命名衝突 (将来 Tailwind 標準で `.text-icon` 等が auto-utility 化)                        | 低   | Tailwind v4 標準名 (`text-{size}` / `text-{color}` 系) と直接衝突しない。PR 6 完了時点で `--color-neutral-700` は `@theme` 未登録のため Tailwind が `text-neutral-700` を auto-utility 化する経路もない |
| `.footer-bar` 等 Footer 専用 class の hardcoded neutral 色 (dark mode 不可)                             | 低   | 現状 dark mode 未サポート (global.css L13 `@variant dark (&:where(.dark, .dark *));` は宣言のみで使われていない)。dark mode 対応時に semantic alias (`--color-bg-footer` 等) 化する想定                 |
| `.drawer-backdrop` の `rgba(17,24,39,0.5)` が `--color-neutral-900` 変更時に同期しない                  | 低   | dark mode 対応時にあわせて整理 (リスク行と同根)。本 PR scope では rgba 直書き許容、将来の `color-mix(in srgb, ...)` 化は YAGNI                                                                          |
| Astro inline 撤去で a11y semantic マーカー (aria-\*) を意図せず削除                                     | 低   | 本 PR は `style="..."` 属性のみ touch、`class="..."` 属性は merge 拡張、aria-\* / role / label 系は touch しない。CLAUDE.md 9.6 の "aria 削除検出" pre-create check も親が PR 作成前に実施              |
| user 確認した方針外で勝手に新規 class を増やす                                                          | 低   | 本 spec で **新規 7 class に限定**を明記。実装中に「もう 1 個欲しい」が出た場合は user に確認後追加                                                                                                     |

---

## 議論ポイント (本 spec 起草時 default 採用案を提示)

> brainstorming session で確認済の主要決定。再変更したい場合は本セクションの代替案を採用。

1. **`.caption-wide` 命名**: ✅ user 採用。代替案 (`.nav-category-label` / `.tracking-wide-caption`) は本 spec で採用しない。
2. **単発 typography (ToolLayout H1 / CategoryBadge text)**: ✅ user 判断 = Tailwind arbitrary value 採用。class 化は YAGNI で見送り。
3. **新規 7 class draft**: ✅ user 承認。Footer scoped CSS / `.drawer-backdrop` arbitrary 化等の代替案は採用しない。

### spec 起草時に default 採用とした追加判断

4. **`letter-spacing: 0.02em` 単独 (4 件) を class 化しない**: Tailwind arbitrary `tracking-[0.02em]` で対応。class 化すると `.caption` family との区別がつきにくくなり可読性低下、auto-utility のため CSS bundle にも 1 ルールしか出力されず DRY 観点でも arbitrary が劣らない。
5. **進捗 doc 更新の commit**: 本 PR 内に同梱する想定 (#6 commit)。merged 後 chore PR にする選択肢もあるが、PR 7b で次の更新が来るためまとめる方が doc lag が少ない。

---

## 関連

- 上位 issue: [#176](https://github.com/fumtas1k/devtools/issues/176) (B 案 = `style-src 'unsafe-inline'` 削減)
- 起票 issue: [#289](https://github.com/fumtas1k/devtools/issues/289) (Astro inline 65 件 follow-up)
- 直前 PR: [#290](https://github.com/fumtas1k/devtools/pull/290) (B 案 PR 6 — scope 縮小、`styles.ts` 削除 + tracker glob 化)
- B 案 series spec: [PR 1](./2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md) / [PR 1.5](./2026-05-04-issue-176-b1-5-ui-complex-design.md) / [PR 2](./2026-05-04-issue-176-b2-qr-ticket-design.md) / [PR 3](./2026-05-07-issue-176-b3-jwt-uuid-design.md) / [PR 4](./2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md) / [PR 5a](./2026-05-07-issue-176-b5a-config-qr-jan-design.md) / [PR 5b](./2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md) / [PR 6 (post-mortem)](./2026-05-07-issue-176-b6-csp-flip-and-cleanup-design.md)
- 進捗 SoT: [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md)
- Phase A revert commit (PR 8 で再利用): `8ae383a` (PR 6 で revert)
