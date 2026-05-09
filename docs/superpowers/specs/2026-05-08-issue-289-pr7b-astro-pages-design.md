# `#176` B 案 follow-up #289 PR 7b — Astro inline `style="..."` 属性 (pages/\*.astro 7 ファイル) 移行

> **位置付け**: B 案 (style-src 削減) follow-up issue [#289](https://github.com/fumtas1k/devtools/issues/289) の 3 PR 分割のうち **PR 7b** (pages 系)。
>
> - PR 7a (#294 merged): `src/components/layout/*.astro` 4 + `src/layouts/*.astro` 2 + `src/components/ui/{CategoryBadge,ToolInfoSection}.astro` 2 = **8 ファイル / 23 件 / 新規 7 class** 完了。
> - PR 7b (本 spec): `src/pages/*.astro` 7 ファイル / **42 件 / 新規 3 class**。
> - PR 8 最終 flip: `_headers` から `style-src 'unsafe-inline'` 削除 + `stripMetaStyleSrc` 撤去 + `inline-style-migration.test.ts` への Astro 検出網追加 + `decisions.md [067]` 追加 (PR 6 で revert した `8ae383a` のコードを再利用)
>
> **前提となる context**:
>
> - 本 spec は PR 7a ([#294](https://github.com/fumtas1k/devtools/pull/294), `3d943bd`) merged 後の世界。layout/ui の 23 件移行 + 新規 7 class (`.caption-wide` / `.text-icon` / `.text-tertiary` / `.bg-badge` / `.footer-bar` / `.text-footer-meta` / `.drawer-backdrop`) 追加は済。
> - PR 7a 仕様書: [`docs/superpowers/specs/2026-05-08-issue-289-pr7a-astro-inline-layout-ui-design.md`](./2026-05-08-issue-289-pr7a-astro-inline-layout-ui-design.md)
> - PR 7b 完了で issue #289 の Astro inline 65 件全廃が完了し、PR 8 で `style-src 'unsafe-inline'` 削減を最終 flip できる状態になる。

---

## ゴール

`src/pages/*.astro` 7 ファイル / **42 件の Astro `<element style="...">` 属性** を全廃し、CSS class (Tailwind utility / 既存 `@layer components` 意味クラス / **新規 3 class**) に置換する。

**non-goal** (本 PR で実施しないこと):

- `style-src 'unsafe-inline'` の削除 (PR 8 最終 flip で実施)
- `astro.config.mjs` の `stripMetaStyleSrc()` 撤去 (PR 8)
- `inline-style-migration.test.ts` への `*.astro` 検出網追加 (**PR 8 で実施**、user 指示)
- `decisions.md [067]` 追加 (PR 8)
- visual regression baseline の意図的更新 (差分が出たら本 PR レビュー時に都度判断)

---

## 42 件カタログ (ファイル別件数)

| ファイル                            |   件数 |
| ----------------------------------- | -----: |
| `src/pages/index.astro`             |     13 |
| `src/pages/privacy.astro`           |     12 |
| `src/pages/about.astro`             |     10 |
| `src/pages/tools/jwt-decoder.astro` |      4 |
| `src/pages/tools/url-encode.astro`  |      1 |
| `src/pages/tools/json-xml.astro`    |      1 |
| `src/pages/tools/json-csv.astro`    |      1 |
| **計**                              | **42** |

## パターン分類とカバレッジ

| #   | パターン                                              | 件数 | カバレッジ判定                                                  |
| --- | ----------------------------------------------------- | ---: | --------------------------------------------------------------- |
| A   | code chip (`bg-subtle; 0.875rem`)                     |    7 | ✅ `.bg-subtle text-sm` (既存 utility)                          |
| B   | section heading (`1.125rem; 1.5; 0.02em`)             |   10 | ❌ **新規 `.section-heading`**                                  |
| C   | body text (`1rem; 1.8; 0.02em; neutral-700`)          |    8 | ❌ **新規 `.text-body`**                                        |
| D   | caption + muted (`.caption .text-muted`)              |    3 | ✅ 既存                                                         |
| D'  | caption 色無                                          |    1 | ✅ `.caption`                                                   |
| D"  | list `1rem; 1.7` 色無                                 |    1 | △ Tailwind arbitrary                                            |
| E   | H1 1.75rem (`1.4; 0.02em + text-default`)             |    2 | △ arbitrary (YAGNI)                                             |
| E'  | H1 2rem (`1.4; 0.01em + text-default`)                |    1 | △ arbitrary (YAGNI)                                             |
| F   | hero subtitle (`1rem; 1.7; 0.02em; neutral-600`)      |    1 | △ arbitrary `text-[var(--color-neutral-600)]` (単発、user 判断) |
| G   | small label (`0.875rem; 0.02em` 色無)                 |    2 | ✅ `text-sm tracking-[0.02em]`                                  |
| H   | hero card bg (`color-background + blue-100 border-b`) |    1 | △ arbitrary 2連 (単発、user 判断)                               |
| I   | scroll snap container (5 prop + webkit)               |    1 | ❌ **新規 `.scroll-snap-x`** (5 prop で arbitrary 連鎖は冗長)   |
| J   | scroll snap item (`flex/snap/min-w-0`)                |    1 | ✅ Tailwind utility 5連                                         |
| K   | tool card bg (`bg + border`)                          |    1 | ✅ `.bg-default border border-default`                          |
| L   | scroll container border                               |    1 | ✅ `.border-default`                                            |
| M   | ToolIcon style prop (SVG color)                       |    1 | ✅ `class="text-primary"` (ToolIcon は `class` prop 対応済)     |

**カバレッジ集計**:

| 区分                                          | 件数 |                                      % |
| --------------------------------------------- | ---: | -------------------------------------: |
| ✅ 既存資産 + Tailwind utility で完全カバー   |   17 |                                    40% |
| △ Tailwind arbitrary (YAGNI 単発 typography)  |    4 | 10% (D"/E/E'×1, F/H/D" 内訳は次節参照) |
| ❌ 新規 class 強候補 (B 10件 + C 8件 + I 1件) |   19 |                                    45% |
| △ 単発 arbitrary (F/H)                        |    2 |                                     5% |

**所感**: 新規 3 class (`.section-heading` / `.text-body` / `.scroll-snap-x`) で 19 件 (45%) を一気にカバー。PR 7a (23 件で 7 class 追加) と比べて class 追加密度は低いが、本文ページ独自 typography の集約として意味クラス化の正当性が強い。

---

## 採用する設計 (ファイル別)

### 表記ルール

各表の「置換後」列での `class="... XXX"` 表記は、**元の `class` 属性を維持し、新規 class (XXX) を末尾に追加**することを意味する。`class` 属性を新規付与する場合 (元属性が無いケース) はその旨明記する。

### 1. `src/pages/index.astro` (13 件)

| 行   | inline                                                                                                                                                               | 置換後                                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| L29  | `style="background: var(--color-background); border-bottom: 1px solid var(--color-blue-100);"` (hero card)                                                           | `class="... bg-[var(--color-background)] border-b border-[var(--color-blue-100)]"` (arbitrary 2連)                                           |
| L33  | `style="font-size: 2rem; line-height: 1.4; letter-spacing: 0.01em; color: var(--color-text);"` (H1)                                                                  | `class="... text-[2rem] leading-[1.4] tracking-[0.01em] text-default"` (arbitrary 3 + 既存)                                                  |
| L38  | `style="font-size: 1rem; line-height: 1.7; letter-spacing: 0.02em; color: var(--color-neutral-600);"` (hero subtitle)                                                | `class="... text-base leading-[1.7] tracking-[0.02em] text-[var(--color-neutral-600)]"` (arbitrary 4、neutral-600 は project 内で唯一の利用) |
| L53  | `style="border-color: var(--color-border);"` (scroll container border)                                                                                               | `class="... border-default"` (既存)                                                                                                          |
| L62  | `style="font-size: 0.875rem; letter-spacing: 0.02em;"` (small label)                                                                                                 | `class="... text-sm tracking-[0.02em]"`                                                                                                      |
| L75  | `style="font-size: 0.875rem; letter-spacing: 0.02em;"` (small label)                                                                                                 | `class="... text-sm tracking-[0.02em]"` (L62 と同)                                                                                           |
| L87  | `style="overflow-x: scroll; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; -webkit-overflow-scrolling: touch;"` (carousel container) | `class="... scroll-snap-x"` (新規)                                                                                                           |
| L95  | `style="flex: 0 0 100%; scroll-snap-align: start; min-width: 0;"` (carousel item)                                                                                    | `class="... basis-full shrink-0 grow-0 snap-start min-w-0"` (Tailwind utility 5連)                                                           |
| L104 | `style="background: var(--color-bg); border: 1px solid var(--color-border);"` (tool card)                                                                            | `class="... bg-default border border-default"` (既存)                                                                                        |
| L107 | `<ToolIcon ... style="color: var(--color-primary);" />`                                                                                                              | `<ToolIcon ... class="text-primary" />` (既存、`ToolIcon.astro` は `class` prop 対応済 — 既存 `class` props 上書きなし、新規付与)            |
| L112 | `style="font-size: 1.125rem; line-height: 1.5; letter-spacing: 0.02em;"` (card title 色無)                                                                           | `class="... section-heading"` (新規、color は親要素の text 継承で OK)                                                                        |
| L118 | `style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em; color: var(--color-muted);"` (card description)                                               | `class="... caption text-muted"` (既存)                                                                                                      |
| L124 | `style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em;"` (card body 色無)                                                                            | `class="... caption"` (既存)                                                                                                                 |

> **note**: `color: var(--color-background)` (#eff6ff = blue-50) と `color: var(--color-blue-100)` (#dbeafe) は project 内で hero card のみで利用する単発 token のため、新規 class `.hero-card` 化は YAGNI で見送り、Tailwind arbitrary 2連で対応。

### 2. `src/pages/about.astro` (10 件)

| 行   | inline                                                                                                                | 置換後                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| L23  | `style="font-size: 1.75rem; line-height: 1.4; letter-spacing: 0.02em; color: var(--color-text);"` (H1)                | `class="... text-[1.75rem] leading-[1.4] tracking-[0.02em] text-default"` (arbitrary 3 + 既存)                                     |
| L31  | `style="font-size: 1.125rem; line-height: 1.5; letter-spacing: 0.02em; color: var(--color-text);"` (H2)               | `class="... section-heading text-default"` (新規 + 既存)                                                                           |
| L36  | `style="font-size: 1rem; line-height: 1.8; letter-spacing: 0.02em; color: var(--color-neutral-700);"` (body)          | `class="... text-body"` (新規、color baked-in)                                                                                     |
| L47  | (L31 と同) H2                                                                                                         | `class="... section-heading text-default"`                                                                                         |
| L53  | (L36 と同) body                                                                                                       | `class="... text-body"`                                                                                                            |
| L71  | (L31 と同) H2                                                                                                         | `class="... section-heading text-default"`                                                                                         |
| L82  | `style="font-size: 1rem; line-height: 1.7; letter-spacing: 0.02em;"` (list item、line-height 1.7、色無)               | `class="... text-base leading-[1.7] tracking-[0.02em]"` (arbitrary 3、L36 の body と異なる line-height のため `.text-body` 不適用) |
| L88  | `style="font-size: 0.875rem; line-height: 1.7; letter-spacing: 0.02em; color: var(--color-muted);"` (caption + muted) | `class="... caption text-muted"` (既存)                                                                                            |
| L101 | (L31 と同) H2                                                                                                         | `class="... section-heading text-default"`                                                                                         |
| L107 | (L36 と同) body                                                                                                       | `class="... text-body"`                                                                                                            |

### 3. `src/pages/privacy.astro` (12 件)

| 行   | inline                                     | 置換後                                                                    |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------- |
| L24  | (about L23 と同) H1 1.75rem                | `class="... text-[1.75rem] leading-[1.4] tracking-[0.02em] text-default"` |
| L30  | (about L88 と同) caption + muted           | `class="... caption text-muted"`                                          |
| L38  | (about L31 と同) H2 1.125rem               | `class="... section-heading text-default"`                                |
| L43  | (about L36 と同) body 1rem 1.8 neutral-700 | `class="... text-body"`                                                   |
| L53  | (L38 と同) H2                              | `class="... section-heading text-default"`                                |
| L58  | (L43 と同) body                            | `class="... text-body"`                                                   |
| L68  | (L38 と同) H2                              | `class="... section-heading text-default"`                                |
| L73  | (L43 と同) body                            | `class="... text-body"`                                                   |
| L82  | (L38 と同) H2                              | `class="... section-heading text-default"`                                |
| L87  | (L43 と同) body                            | `class="... text-body"`                                                   |
| L103 | (L38 と同) H2                              | `class="... section-heading text-default"`                                |
| L108 | (L43 と同) body                            | `class="... text-body"`                                                   |

### 4. `src/pages/tools/{jwt-decoder,url-encode,json-xml,json-csv}.astro` (7 件、code chip)

すべて同 pattern: `style="background: var(--color-bg-subtle); font-size: 0.875rem;"` → `class="... bg-subtle text-sm"` (既存 utility のみ)

| ファイル            | 行                    | 置換後                              |
| ------------------- | --------------------- | ----------------------------------- |
| `jwt-decoder.astro` | L17 / L21 / L25 / L29 | `class="... bg-subtle text-sm"` × 4 |
| `url-encode.astro`  | L18                   | `class="... bg-subtle text-sm"`     |
| `json-xml.astro`    | L17                   | `class="... bg-subtle text-sm"`     |
| `json-csv.astro`    | L18                   | `class="... bg-subtle text-sm"`     |

> **note**: 既存 `class` 属性が `<code>` element に付いている可能性があるので、現状を確認しつつ末尾追加。class 属性なしなら新規付与。

---

## `src/styles/global.css` への追加 (新規 3 class)

```css
@layer components {
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
}
```

> **設計上の判断**:
>
> - **`.section-heading` は色非内包**: 10 件中 1 件 (index L112 card title) が色無しのため、bake-in すると opt-out コストが発生。`.caption` / `.body-emphasis` precedent (typography only) に従う。
> - **`.text-body` は色 baked-in**: 8 件全て neutral-700 で一致しており、`.footer-bar` precedent (bg+color combined) を流用。命名は color family 風 (`.text-X`) だが、内部は typography+color combined。命名と内容のずれは許容 (`.text-default` / `.text-muted` 等の純色 class とは性質が異なるが、`.text-body` という単語が typography 役割を強く示唆するため誤解しにくい)。
> - **`.scroll-snap-x` 命名**: Tailwind v4 の `snap-x` utility (`scroll-snap-type: x var(--tw-scroll-snap-strictness)`) と class 名衝突しない。`.scroll-` prefix で「scroll 系コンテナ utility 集約」の semantic を担保。
> - **arbitrary 採用の根拠**: 単発 typography (H1 2 種 / hero subtitle / list item / hero card bg / scroll snap item) は **PR 7a §126 ToolLayout H1 の YAGNI 判断**と同じ。class 化の誘惑はあるが、3+ occurrences 基準を満たさず arbitrary 採用が一貫性。

---

## `inline-style-migration.test.ts` への扱い

**本 PR では拡張しない**。理由:

- 現状 tracker は `src/components/**/*.tsx` のみ glob 対象 (PR 6 で確立)。
- user 指示で **PR 8 (最終 flip) で Astro 検出網を追加** する方針。本 PR で追加すると PR 8 までの間 tracker が green であり続けるが、PR 8 で `style-src 'unsafe-inline'` 削除と Astro 検出網追加を bundle する方が「flip と検出網が同時 commit」で意味的に整合する。
- 本 PR 完了時点で `grep -rn 'style="' src/pages/ --include='*.astro' src/components/**/*.astro src/layouts/*.astro` = **0** であることは別途検証 (検証戦略節参照)。

---

## consumer 変更範囲 (PR 7b で touch するファイル)

```
src/pages/index.astro
src/pages/about.astro
src/pages/privacy.astro
src/pages/tools/jwt-decoder.astro
src/pages/tools/url-encode.astro
src/pages/tools/json-xml.astro
src/pages/tools/json-csv.astro
src/styles/global.css                    # 新規 3 class 追加
```

合計 **8 ファイル**。

---

## 検証戦略

### unit / type check

- `npm run test` (Vitest) — global.css に直接依存する unit test は無いため、影響は migration tracker のみ。本 PR では tracker 拡張なし (PR 8 で対応) のため pass 維持を確認。
- `astro check` — typing 影響なし、pass 維持を確認。

### Astro inline 完全削除の確認 (本 PR 専用ガード)

PR 7b 完了時点で Astro inline `style="..."` が完全に消えていることを以下で確認 (tracker 不在の補完):

```bash
grep -rn 'style="' src --include='*.astro'
# 期待値: 0 件 (本 PR 完了時点で src/*.astro 全体から inline style 撤去完了)
```

> 0 件にならない場合は spec 漏れか、実装漏れ。レビュー前に必ず確認。
> 検証範囲を `src` 全体としたのは、PR 7a 完了で src/pages 以外の subdirs はすでに 0 件のため (本 PR 着手時点で全 7 inline style 持ち file は src/pages 配下のみ、検証済)。

### E2E (親直接実行、subagent 委譲なし)

memory `feedback_subagent_verification_trust.md` 準拠で **親 Opus が直接実行** (PR 7a / PR 6 / #292 と同パターン)。

```
npm run test:e2e
```

- pages 系の class 化は対象 page のみ影響 (layout 系より影響範囲狭)。
- `applyProductionCsp` を効かせる spec (uuid-v7 / ulid-generator / config-converter 等) は `style-src 'unsafe-inline'` 維持下で動作するため、本 PR scope では新たな違反は発生しない。

### VRT (Visual Regression Test)

- CI Linux runner で `npm run test:vrt` (memory `feedback_vrt_ci_only.md`)。
- pages 系の class 化は **理論上 pixel-perfect** (Tailwind utility / 既存 class / 新規 class が inline と同等 CSS を生成するため)。差分が出たら spec / browser 検証で意図確認。
- 意図的差分があれば `update-visual-baseline.yml` workflow で baseline 更新。

### 手動検証 (browser)

- `/` (index) で hero / カルーセル / tool card / ToolIcon の見た目が PR 前後で同一であることを確認。
- `/about` / `/privacy` で H1 / H2 / 本文段落のサイズ・行間・色が同一であることを確認。
- `/tools/jwt-decoder` / `/tools/url-encode` / `/tools/json-xml` / `/tools/json-csv` で `<code>` chip の bg / 文字サイズが同一であることを確認。

---

## バッチ計画における本 PR の位置付け

| #              | スコープ                                                                             | 状態           |
| -------------- | ------------------------------------------------------------------------------------ | -------------- |
| PR 1〜5b       | React `style={{}}` 全廃 (B 案 PR 1〜5b)                                              | ✅ merged      |
| PR 6 (#290)    | `styles.ts` 削除 + migration tracker glob 化                                         | ✅ merged      |
| PR 7a (#294)   | Astro layout/ui 23 件移行 + 新規 7 class                                             | ✅ merged      |
| **PR 7b**      | **本 spec — Astro pages 42 件移行 + 新規 3 class**                                   | 🔄 spec 起草中 |
| PR 8 最終 flip | `_headers` flip + `stripMetaStyleSrc` 撤去 + `decisions.md [067]` + Astro 検出網追加 | 未着手         |

---

## ブランチ命名 / コミット粒度 / 並列分担

### ブランチ

`feature/issue-289-pr7b-astro-pages` (worktree path: `.claude/worktrees/issue-289-pr7b/`、base: `origin/develop` 必須 — memory `feedback_worktree_base_branch.md`)。

### 並列分担

**subagent 委譲なし、親 Opus 直接実装**。PR 7a / PR 6 / #292 と同パターン (memory `feedback_subagent_verification_trust.md`)。

理由:

- 7 ファイルで 42 件、規模は PR 5a (31 件 / 3 ツール) を超えるが、**置換 pattern が高度に均質** (B + C で 18 件、A code chip で 7 件、合計 25 件 = 60% が単純 pattern)。subagent 並列の merit が薄い。
- pages 系の class 化は VRT 影響評価が必要で、検証主体が親なら commit-and-verify-and-iterate が tight loop で回せる。
- subagent の「pass」報告 false positive を避ける (memory 同上)。

### コミット粒度

ファイル単位 / pattern 単位で意味的に commit を分け、5 commit 程度を想定:

1. `feat(styles): #289 PR 7b — global.css に新規 3 class 追加 (section-heading / text-body / scroll-snap-x)`
2. `refactor(pages): #289 PR 7b — index.astro Astro inline 撤去 (13 件)` — hero card / carousel / tool card / ToolIcon class prop 化を含む波及大の commit
3. `refactor(pages): #289 PR 7b — about.astro / privacy.astro Astro inline 撤去 (22 件)` — 本文 page、section-heading + text-body の主消費先
4. `refactor(pages/tools): #289 PR 7b — jwt-decoder + url-encode + json-xml + json-csv code chip 撤去 (7 件)` — `<code>` chip 7 件均質置換
5. `chore(docs): #289 PR 7b — issue-176-b-plan-progress.md 更新` — PR 7b 行を ✅ merged に、PR 8 を 🔄 に進行

> 進捗 doc 更新は本 PR 内に同梱 (PR 7a と同方針)。

---

## リスクと緩和

| リスク                                                                                        | 程度 | 緩和策                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pages 系 page で意図せぬ visual regression                                                    | 中   | VRT pixel diff で検出 → spec 横断確認 → 意図的差分なら baseline 更新。pages 系の影響は対象 page のみで layout 系 (PR 7a) より局所                                                          |
| `.text-body` neutral-700 baked-in color が dark mode 時に困る                                 | 低   | 現状 dark mode 未サポート。dark mode 対応時に semantic alias (`--color-text-body` 等) 化する想定 (PR 7a `.footer-bar` と同根)                                                              |
| `.scroll-snap-x` が `@layer components` に置かれることで Tailwind utility と特異性負け        | 低   | Tailwind utility は `@layer utilities` で `@layer components` より後 layer = 勝ち。本 class は単独使用で utility と衝突しない (utility 側に該当 class 不在)                                |
| `.section-heading` 命名衝突 (将来 Tailwind 標準で同名 utility 化)                             | 低   | Tailwind v4 標準 utility 系 (`text-{size}` / `leading-{n}` 等) と衝突しない命名                                                                                                            |
| `bg-[var(--color-background)]` の Tailwind arbitrary が本番 build で生成されない (purge 漏れ) | 低   | Astro + Tailwind v4 では `class="..."` 文字列を build 時に scan するため arbitrary value も拾われる。PR 7a で同パターン (`tracking-[0.02em]` 等) 検証済                                    |
| ToolIcon の既存 `class` prop 上書きでスタイル崩れ                                             | 低   | `index.astro` L107 の ToolIcon は元 `style="color:..."` のみで `class` prop なし。新規 `class="text-primary"` 付与は安全 (検証: spec で確認済)                                             |
| Astro inline 撤去で a11y semantic マーカー (aria-\*) を意図せず削除                           | 低   | 本 PR は `style="..."` 属性のみ touch、`class="..."` 属性は merge 拡張、aria-\* / role / label 系は touch しない。CLAUDE.md 9.6 の "aria 削除検出" pre-create check も親が PR 作成前に実施 |
| Astro inline 撤去漏れ (本 PR 完了時に grep 0 件にならない)                                    | 中   | 検証戦略節の `grep -rn 'style="' src` で本 PR 完了時に 0 件確認。漏れた場合は最終 commit に追加                                                                                            |
| user 確認した方針外で勝手に新規 class を増やす                                                | 低   | 本 spec で **新規 3 class に限定**を明記。実装中に「もう 1 個欲しい」が出た場合は user に確認後追加                                                                                        |

---

## 議論ポイント (本 spec 起草時 brainstorming 採用案)

> brainstorming session で確認済の主要決定。再変更したい場合は本セクションの代替案を採用。

1. **B/C 新規 class 方針**: ✅ user 採用 = `.section-heading` (typography only) + `.text-body` (typography+color baked-in)。代替案 (B のみ class 化 / 全 arbitrary) は採用しない。
2. **F (hero subtitle, neutral-600 単発)**: ✅ user 判断 = Tailwind arbitrary `text-[var(--color-neutral-600)]` 採用。`.text-muted` 代用 (色違い) / 新規 class は不採用。
3. **H (hero card bg, color-background + blue-100)**: ✅ user 判断 = Tailwind arbitrary 2連採用。新規 `.hero-card` class は YAGNI で見送り。
4. **I (scroll snap container, 5 prop)**: ✅ user 判断 = 新規 class `.scroll-snap-x` 追加。Tailwind arbitrary 6連は不採用。
5. **B vs C 命名**: ✅ user 承認 = `.section-heading` (`<descriptor>-<noun>` 自然語順) + `.text-body` (色 family 風 prefix だが内容は combined)。

### spec 起草時に default 採用とした追加判断

6. **inline-style-migration.test.ts の Astro 検出網**: 本 PR では追加しない (PR 8 で flip と同時 commit する方が意味的整合)。
7. **ToolIcon `class` prop 採用**: index.astro L107 で `style="color: var(--color-primary);"` を `class="text-primary"` に置換。ToolIcon は `class` prop 既存対応 (line 5, 12) 確認済。
8. **進捗 doc 更新の commit**: 本 PR 内に同梱 (#5 commit)。PR 7a と同方針で doc lag を最小化。

---

## 関連

- 上位 issue: [#176](https://github.com/fumtas1k/devtools/issues/176) (B 案 = `style-src 'unsafe-inline'` 削減)
- 起票 issue: [#289](https://github.com/fumtas1k/devtools/issues/289) (Astro inline 65 件 follow-up)
- 直前 PR: [#294](https://github.com/fumtas1k/devtools/pull/294) (PR 7a — layout/ui 23 件 + 新規 7 class、`3d943bd`)
- B 案 series spec: [PR 1](./2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md) / [PR 1.5](./2026-05-04-issue-176-b1-5-ui-complex-design.md) / [PR 2](./2026-05-04-issue-176-b2-qr-ticket-design.md) / [PR 3](./2026-05-07-issue-176-b3-jwt-uuid-design.md) / [PR 4](./2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md) / [PR 5a](./2026-05-07-issue-176-b5a-config-qr-jan-design.md) / [PR 5b](./2026-05-07-issue-176-b5b-rest-tools-and-ulid-e2e-design.md) / [PR 6 (post-mortem)](./2026-05-07-issue-176-b6-csp-flip-and-cleanup-design.md) / [PR 7a](./2026-05-08-issue-289-pr7a-astro-inline-layout-ui-design.md)
- 進捗 SoT: [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md)
- Phase A revert commit (PR 8 で再利用): `8ae383a` (PR 6 で revert)
