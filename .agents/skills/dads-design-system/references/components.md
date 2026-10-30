# DADS コンポーネント仕様

Claude Design の DADS デザインシステム（`project/components/components.css` と各 `*.prompt.md`）の要点。本リポジトリでは `src/components/ui/` の既存コンポーネントの見た目をこの仕様に寄せる（移行計画 Phase 5）。実装は `global.css` の `@layer components` の意味クラスで行い、hover / focus は擬似クラスごと定義する（`.agents/rules/common.md` 7.1）。

| DADS                    | 本リポジトリの対応先                                                |
| :---------------------- | :------------------------------------------------------------------ |
| Button                  | `ActionButton`、`CopyButton` / `DownloadButton` / `FileInputButton` |
| Input / Textarea        | `InputField` / `BareInput` / `OutputField`                          |
| Select                  | `Select`                                                            |
| NotificationBanner      | `NotificationBanner`                                                |
| StatusBadge             | `StatusBadge`                                                       |
| ChipLabel               | `ChipLabel`、`ToggleChips`（チップの見た目）                        |
| Table                   | `ResultTable`                                                       |
| Checkbox / Radio        | 現状は専用コンポーネントなし                                        |
| Accordion / Breadcrumbs | 現状は使用箇所なし                                                  |

DS にない `ToggleGroup` / `ToggleChips` は Button（outline / solid-fill）と ChipLabel の規約から派生させる。

## Button

- variant: **solid-fill**（主要操作、1 画面 1 つが目安）/ **outline**（副次操作）/ **text**（軽い操作）
- size: `lg` 56px（最小幅 136px）/ `md` 48px（96px）/ `sm` 36px（80px、角丸 6px）/ `xs` 28px（72px、14px 文字、角丸 4px）。lg / md の角丸は 8px
- 文字は 16px Bold、行高 1（Oneline）

| variant    | 通常                                             | hover                                    | active                                 | disabled                                    |
| :--------- | :----------------------------------------------- | :--------------------------------------- | :------------------------------------- | :------------------------------------------ |
| solid-fill | `blue-900` 塗り・白文字・**4px double の透明枠** | `blue-1000` + 下線                       | `blue-1200` + 下線                     | `solid-gray-300` 塗り・`solid-gray-50` 文字 |
| outline    | 白地・`blue-900` 文字と 1px 枠                   | `blue-200` 地・`blue-1000` 文字 + 下線   | `blue-300` 地・`blue-1200` 文字 + 下線 | 白地・`solid-gray-300` 文字                 |
| text       | 透明・`blue-900` 文字・下線（offset 3px）        | `blue-50` 地・`blue-1000` 文字・下線 3px | `blue-100` 地・`blue-1200` 文字        | `solid-gray-300` 文字                       |

disabled は pointer-events を止める。hover と `:focus-visible` は同じ視覚反応で定義する（`ui-conventions.md` 2.1）。

## Input / Textarea / Select

- 高さ `lg` 56 / `md` 48 / `sm` 40px、左右 padding 16px、角丸 8px、文字 16px
- 枠 1px `solid-gray-600`、hover（編集可能時）で黒
- placeholder `solid-gray-536`
- エラー（`aria-invalid="true"`）は枠 `error-1`、hover で `red-1000`
- read-only は**破線枠**
- disabled は枠 `solid-gray-300`・地 `solid-gray-50`・文字 `solid-gray-420`
- textarea は行高 1.7、padding 12px 16px、縦リサイズのみ
- select は `appearance: none` + 右 16px に SVG の chevron（`currentColor`）
- ラベルは入力欄の上。必須 / 任意のバッジを付ける

## Checkbox / Radio

- 18px の枠（2px `solid-gray-600`）、クリック領域は 24px の箱 + ラベル
- 未チェックの hover は枠を黒にする
- checked は `blue-900` 塗り（radio は中心の円）。checkbox の checked hover は `blue-1100`（radio には無い）
- エラーは `error-1`、disabled は `solid-gray-300`

## NotificationBanner

- 3px の枠（`currentColor`）、角丸 12px、padding 16px 24px 24px
- 見出し 18px Bold + 28px のアイコン、本文 16px / 1.7
- 種類と色: info1 `blue-900` / info2 `solid-gray-536` / success `success-2` / warning `warning-yellow-2` / error `error-1`
- color-chip 型: 枠 2px + 左に 16px の色帯（inset box-shadow）

## StatusBadge

- 塗りのピル（角丸 8px）、padding 8px、文字 16px / 行高 1、白文字
- 既定の塗りは `solid-gray-536`。状態色を使うときは白文字で 4.5:1 を満たす `-2`（`success-2` / `error-2` / `warning-*-2`）を塗る（`-1` は success / warning で不足する）

## ChipLabel

- 最小高 32px、角丸 8px、padding 4px 8px、文字 16px
- outline（1px `currentColor` 枠）/ fill（塗り + 白文字）

## Table

- 全幅、文字 16px / 1.5、セル padding 12px 16px、下罫線 1px `solid-gray-420`
- `thead th` は `solid-gray-50` 地・Bold・下罫線 2px `solid-gray-400`
- 行 hover で `blue-50`、行見出し（`th[scope="row"]`）は Bold
- caption は左寄せ 18px Bold

## Link

- `blue-1000`・下線（offset 3px）。hover で下線 3px、active で `orange-800`、visited は magenta（`magenta-800` / `900` は移行時に確定）

## Accordion

- `<details>` / `<summary>`。下罫線 `solid-gray-420`
- summary は 16px Bold、左に 32px の円形アイコン（`blue-1000`）、開くと 180° 回転（0.15s）
- hover で `solid-gray-50` 地

## Breadcrumbs

- `<nav aria-label>` + `<ol>`。区切りは SVG の caret、現在ページは `aria-current="page"` で本文色
