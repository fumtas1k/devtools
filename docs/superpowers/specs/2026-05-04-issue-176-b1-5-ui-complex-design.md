# #176 B 案 PR 1.5: `ui/*` complex (`ResultTable` + `InputField`) 設計書

**作成日**: 2026-05-04
**Issue**: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B / PR 1.5
**前提**: A-1 ([#249](https://github.com/fumtas1k/devtools/pull/249)) + VRT 基盤 ([#254](https://github.com/fumtas1k/devtools/pull/254)) + PR 1 ([#256](https://github.com/fumtas1k/devtools/pull/256)) 完了済み
**参照**: バッチ計画全体は memory `project_b_plan_progress.md` を SoT とする。PR 1 spec は `docs/superpowers/specs/2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md` 参照（命名規約・`@layer components` 既存定義はそちらを継承）。

---

## ゴール

`src/components/ui/` の complex 2 ファイル（`ResultTable.tsx` / `InputField.tsx`）から JSX `style={{}}` を完全除去し、後続 PR 2-5 (qr-ticket / tools) が依存する公開 API も class-based に再設計する。

完了基準:

1. 対象 2 ファイルから `style={{` ヒット数 0、`element.style.X = Y` 形式の inline mutation 0
2. **API redesign**: `TableColumn<T>.cellStyle?: CSSProperties` を廃止し、代替 API（後述「採用する設計」§ 1.2）に置換。`InputField` 公開 props は不変（内部実装のみ class 化）
3. `ResultTable` の動的セレクション・行 zebra・最終行以外の区切り線を CSS 側で表現（`data-selected` / `:nth-child` / `:not(:last-child)` を使用、JSX 側に条件分岐 inline style を残さない）
4. `src/styles/global.css` の `@layer components` に PR 1.5 で必要な class のみ追加（YAGNI 厳守）
5. `src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array に 2 ファイルを追加（`ResultTable.tsx` / `InputField.tsx`）
6. **API 変更に伴う消費側更新**: `UlidGenerator.tsx` / `UuidV7Generator.tsx` の `columns` 配列内 `cellStyle: {...}` 記述をすべて新 API に変換。**ただし両ファイル内の `render` 関数内 `<span style={{...}}>` は本 PR では触らない**（render 関数は PR 3 (UuidV7Generator) / PR 5 (UlidGenerator) スコープ、MIGRATED_FILES にも未登録）
7. **VRT 検証**: `visual-regression.yml` で 36/36 baseline 比較。意図的差分があれば PR ブランチ上で `update-visual-baseline.yml` を `workflow_dispatch` trigger して baseline 更新（PR 1 と同フロー）。required check には**含まれない**
8. ローカル必須ゲート: push 前に `npm run test`（vitest）/ `npx astro check` / `npm run test:e2e` 全 green
9. `src/utils/styles.ts` 自体は **削除しない**（残存 import: PR 1.5 終了後は qr-ticket / 残り tools が継続参照、PR 6 で削除）
10. `docs/ui-conventions.md` Section 2.x は PR 1 で改訂済みのため**追加更新は行わない**（必要な原則は出揃っている）

非ゴール: qr-ticket / tools 側 migration（PR 2-5）、`UuidV7Generator` / `UlidGenerator` の render 関数内 inline style（PR 3 / PR 5）、CSP `_headers` flip（PR 6）、`docs/decisions.md` 新規エントリ（PR 6 [067] で B 案完了として一括記録）

---

## なぜ独立 PR か

PR 1 は「基礎工事 + simple 11 ファイル（props 内部のみ変更、API は不変）」のスコープに限定された。`ResultTable` / `InputField` を含めると以下の理由で PR が肥大化・性質も別物になる:

1. **公開 API 破壊変更**: `cellStyle: CSSProperties` 廃止は consumer 修正（UlidGenerator / UuidV7Generator）を強制し、PR 1 の「内部実装のみ変更」原則と相反
2. **動的スタイルの設計選択**: zebra + selection + 区切り線の組み合わせを CSS 側で表現する設計判断は PR 1 の foundation とは別軸の判断点を抱える
3. **VRT への影響面が広い**: ResultTable は 4 page（Ulid / UuidV7 + 各 mock 注入版）で baseline に乗る。同時に多 page を変更して差分を絞り込みづらくしないため、simple 11 から切り出す

memory 参照:

- `feedback_pr_size.md`（PR は review 単位で小さく、infra と feature 分離）
- `feedback_infra_feature_separation.md`
- `project_b_plan_progress.md`

---

## 採用する設計

### 1. `ResultTable` の class 化と API 再設計

#### 1.1 内部 `style={{}}` 8 件の除去戦略

| 現状 (style 件数 + 内訳)                                                       | 移行先                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 外枠 div: `border` + `overflow`                                                | `rounded-lg border border-default overflow-hidden`                                                                                                                                                                              |
| renderHeader 内 div: `bg-subtle` + `border-bottom`                             | `bg-subtle border-b border-default`（既に PR 1 で追加済み class）                                                                                                                                                               |
| overflow div: `overflowX: 'auto'`                                              | `overflow-x-auto`                                                                                                                                                                                                               |
| `<table>`: `width 100%` + `minWidth` (動的) + `borderCollapse`                 | `w-full border-collapse` + `minWidth` のみ CSS 変数注入で対応（後述）                                                                                                                                                           |
| `<thead><tr>`: `bg-surface` + `border-bottom`                                  | `bg-surface-row border-b border-default`（新規 `.bg-surface-row` を追加 — `var(--color-bg-surface)` 経由）                                                                                                                      |
| `<th>`: `caption + muted + textAlign + padding + nowrap + width`               | `.result-table-th` + `data-align` 属性（後述）。width は inline style ではなく `<col>` 要素で指定                                                                                                                               |
| `<tr>` 行 zebra + selection bg + cursor                                        | `.result-table-row` (zebra は `:nth-child(odd/even)`) + `data-selected` 属性 (selection bg) + `data-clickable="true"` (cursor)                                                                                                  |
| `<td>` 動的 `border-top/bottom` (selection マーカー) + `boxShadow`（区切り線） | `.result-table-row[data-selected="true"] > td { border-top/bottom: 2px solid var(--color-primary) }` + `.result-table-row:not(:last-child):not([data-selected="true"]) > td { box-shadow: inset 0 -1px 0 var(--color-border) }` |

**動的な `minWidth` の扱い**: prop で受けた `minWidth` 文字列は CSS 変数注入で対応:

```tsx
const tableRef = useRef<HTMLTableElement>(null);
useEffect(() => {
  if (tableRef.current && minWidth) {
    tableRef.current.style.setProperty('--result-table-min-width', minWidth);
  }
}, [minWidth]);
// className: 'w-full border-collapse result-table'
```

```css
.result-table {
  min-width: var(--result-table-min-width, 0);
}
```

**根拠**: `setProperty('--var', value)` は CSSOM API 経由で属性経由の inline style mutation と区別される（PR 1 の ToggleGroup と同じ手法、migration test も `setProperty` を許容パターンとしてスルー）。

**動的 `width` の `<th>` 列幅**: `col.width` を `<colgroup><col style="width: ...">` に逃がす案と、`data-col-width` + CSS attr() を使う案があるが、attr() は数値型サポートが新しめのブラウザに限られ、`<col style="width">` は HTML 標準属性扱いではなく CSS の inline style となるため CSP 上は同等の問題。**結論**: `<col>` 要素を生成し、各 `<col>` の `width` を `setProperty('--col-width-N', value)` で個別 CSS 変数として注入し、`colgroup col:nth-child(N) { width: var(--col-width-N) }` で参照する。N が動的（columns.length 可変）なため、render 時に `useEffect` で全列をループして注入。冗長だが CSP 準拠かつ JSX inline style 0。

**代替案 (Alt-A)**: `<col>` を捨てて、各 `<th>`/`<td>` に `data-col-key={col.key}` を付与し、columns 側で width を className 化する CSS-in-CSS 戦略。consumer が任意 width を渡す自由度が下がる。**今回は採用しない**（既存 API の `width?: string` を維持するため）。

#### 1.2 公開 API の再設計（**主要な breaking change**）

**現状**:

```ts
export interface TableColumn<T> {
  key: string;
  header: string;
  headerAlign?: 'left' | 'right' | 'center';
  cellAlign?: 'left' | 'right' | 'center';
  width?: string;
  className?: string;
  cellStyle?: CSSProperties; // ← 廃止対象
  render: (row: T, index: number) => ReactNode;
}
```

**新 API**:

```ts
export interface TableColumn<T> {
  key: string;
  header: string;
  headerAlign?: 'left' | 'right' | 'center';
  cellAlign?: 'left' | 'right' | 'center';
  width?: string;
  /** td に追加される className（typography / 色 / nowrap 等の修飾用） */
  className?: string;
  /** セルパディング。default: 'normal' (0.5rem 0.75rem)、compact (0.25rem 0.5rem) */
  cellPadding?: 'normal' | 'compact';
  render: (row: T, index: number) => ReactNode;
}
```

**設計判断 — 何を新 API として採用するか（議論ポイント）**:

| 案                                                                                       | pros                                               | cons                                                                               | 採否    |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- | ------- |
| **A. `cellPadding` flag + `className` 拡張**（推奨）                                     | 宣言的・consumer 側が短い・Tailwind 順序問題を回避 | 列挙型に縛られる（将来 `dense` / `loose` 等が必要になったら enum を拡張）          | ✅ 採用 |
| B. `className` のみで全部表現                                                            | 純粋に Tailwind 流儀、enum 不要                    | `px-3 py-2` (default) と override `px-2 py-1` の Tailwind ソース順序が依存性を持つ | ❌      |
| C. `td` に semantic class (`.result-table-cell`) を必ず付け、`className` 追加で override | 既存 default を CSS 側で集約                       | 既存 default を Tailwind utility で書ければ class 集約は冗長                       | ❌      |
| D. `cellStyle: CSSProperties` を維持（API 据え置き）                                     | API 互換                                           | inline style 残存。本 PR のゴール未達                                              | ❌      |

**採用する組み合わせ**: 案 A（`cellPadding` flag + `className` 拡張） + 案 C の混合。すなわち:

- ResultTable 側で各 `<td>` に **常に** `caption` typography class（既に PR 1 で `@layer components` 追加済）を baked-in 適用
- `cellPadding` flag で `px-3 py-2` または `px-2 py-1` を内部で選択（Tailwind utility）
- `className` 追加分で `text-muted` / `tabular-nums` / `whitespace-nowrap` / `font-mono` 等の修飾を consumer から付与

**消費側 mapping (UlidGenerator)**:

```ts
// Before
{ key: 'no', cellStyle: { ...caption, color: colors.muted, padding: '0.5rem 0.75rem', fontVariantNumeric: 'tabular-nums' }, ... }
// After
{ key: 'no', className: 'text-muted tabular-nums', /* cellPadding default = normal */ ... }

// Before
{ key: 'ulid', className: 'font-mono', cellStyle: { ...caption, color: colors.text, padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', letterSpacing: '0.02em' }, ... }
// After (font-mono は元から; caption + text-default は default; letterSpacing 0.02em は caption に含まれる)
{ key: 'ulid', className: 'font-mono whitespace-nowrap', ... }

// Before
{ key: 'timestamp', className: 'font-mono', cellStyle: { ...caption, color: colors.muted, padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }, ... }
// After
{ key: 'timestamp', className: 'font-mono text-muted whitespace-nowrap', ... }

// Before
{ key: 'copy', cellStyle: { padding: '0.25rem 0.5rem', whiteSpace: 'nowrap' }, ... }
// After
{ key: 'copy', cellPadding: 'compact', className: 'whitespace-nowrap', ... }
```

UuidV7Generator も同パターン。

#### 1.3 `<th>` の align 表現

`textAlign: col.headerAlign` を JSX inline で書かず、`data-align={col.headerAlign}` 属性に逃がし CSS で表現:

```css
.result-table-th[data-align='left'] {
  text-align: left;
}
.result-table-th[data-align='right'] {
  text-align: right;
}
.result-table-th[data-align='center'] {
  text-align: center;
}
.result-table-cell[data-align='left'] {
  text-align: left;
}
/* ... 同様 */
```

**Alt**: Tailwind utility `text-left` / `text-right` / `text-center` を className に直接 join。実装はこちらの方が短い。**採用**: Tailwind utility を className に join 方式（CSS の data-attr ルールは追加しない、可読性優先）。

```tsx
const alignClass = (a?: 'left' | 'right' | 'center') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
// <th className={`result-table-th text-muted ${alignClass(col.headerAlign)}`}>
```

### 2. `InputField` の class 化（API 不変）

#### 2.1 内部 `style={{}}` 4 件の除去

| 現状                                                                                                                      | 移行先                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| header div: `marginBottom: 0.75rem; minHeight: 2rem`                                                                      | `mb-3 min-h-8`                                                                                                                                         |
| `<label>`: `bodyEmphasis + color: colors.text`                                                                            | `body-emphasis text-default`                                                                                                                           |
| サンプル `<button>`: `caption + color: colors.link + background: none + border: none + ...`                               | 既存 `.text-link` class + 新規 `.btn-link-plain`（または Tailwind: `caption text-link bg-transparent border-0 p-0 cursor-pointer`）                    |
| input/textarea `baseInputStyle`: `caption + width 100% + border + radius + padding + bg + color + (mono) + (resize none)` | `caption w-full border rounded-lg px-3 py-2 bg-default text-default` + 条件 `border-error` / `border-input` + `font-mono` + `resize-none` / `resize-y` |
| hint `<p>`: `caption + color: colors.muted + marginTop: 0.25rem`                                                          | `caption text-muted mt-1`                                                                                                                              |

#### 2.2 `mono` / `resize` / `readOnly` / `error` 状態の合成

```tsx
const inputClass = [
  'caption w-full rounded-lg px-3 py-2 border',
  error ? 'border-error' : 'border-input',
  readOnly ? 'bg-surface-row' : 'bg-default',
  'text-default',
  mono && 'font-mono',
  multiline && !resize && 'resize-none',
  multiline && resize && 'resize-y',
]
  .filter(Boolean)
  .join(' ');
```

(`bg-surface-row` は §1.1 で新規追加予定の class、`var(--color-bg-surface)` 参照)

**注意**: `mono` の元の inline style には `letterSpacing: '0.02em'` が含まれているが、これは `caption` typography 定義（`.caption` class）に既に含まれているため `font-mono` のみで足りる。

### 3. `src/styles/global.css` への追記（PR 1.5 で**新規追加**する分のみ）

PR 1 で既に追加済みの class（`.caption` / `.body-emphasis` / `.text-default` / `.text-muted` / `.bg-default` / `.bg-subtle` / `.border-default` / `.border-input` / `.bg-error-tint` / 等）は再定義しない。本 PR で追加するのは以下:

```css
@layer components {
  /* === Surface bg (used by table thead row & InputField readOnly) === */
  .bg-surface-row {
    background: var(--color-bg-surface);
  }

  /* === ResultTable component-scoped === */
  .result-table {
    /* setProperty で注入される --result-table-min-width を min-width に反映。
       未注入時は 0（= no min-width 制約）。 */
    min-width: var(--result-table-min-width, 0);
  }
  .result-table-row:nth-child(odd) {
    background: var(--color-bg);
  }
  .result-table-row:nth-child(even) {
    background: var(--color-bg-surface);
  }
  .result-table-row[data-selected='true'] {
    background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg));
  }
  .result-table-row[data-clickable='true'] {
    cursor: pointer;
  }
  /* selection マーカー（border-top/bottom 2px primary） */
  .result-table-row[data-selected='true'] > td {
    border-top: 2px solid var(--color-primary);
    border-bottom: 2px solid var(--color-primary);
  }
  /* 区切り線（最終行と選択中の行を除く） */
  .result-table-row:not(:last-child):not([data-selected='true']) > td {
    box-shadow: inset 0 -1px 0 var(--color-border);
  }

  /* === InputField のサンプルボタン === */
  .btn-link-plain {
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
}
```

**衝突確認**:

- `.bg-surface-row` の対応 token (`--color-bg-surface`) は `:root` 直書きのため Tailwind v4 auto-utility は生成されない → 命名衝突なし
- `.result-table*` / `.btn-link-plain` は BEM 風命名で唯一性確保
- `data-selected` / `data-clickable` は WAI-ARIA の `aria-selected` / `aria-current` と意味的重複しないか?
  - `aria-selected` は「クリックで選択可能な行」のときのみ JSX 側で設定される（onRowClick がある時）
  - 本 spec の `data-selected` は **視覚** state を表し、a11y 用途ではない（CSS だけで参照）
  - `data-*` を別属性で持つのは責務分離として妥当。aria 属性に CSS から依存すると a11y 非対応行（onRowClick なし）で zebra + selection の組み合わせが破綻するため

### 4. `inline-style-migration.test.ts` への追加

```ts
const MIGRATED_FILES: readonly string[] = [
  // PR 1 で追加済み
  'src/components/ui/ActionButton.tsx',
  'src/components/ui/BareInput.tsx',
  // ... (PR 1 の 11 件、省略)

  // PR 1.5 で追加
  'src/components/ui/ResultTable.tsx',
  'src/components/ui/InputField.tsx',
];
```

陽性対照（positive control）テストブロック自体は PR 1 で導入済みのため変更不要。

### 5. consumer 変更範囲（**PR 1.5 で touch するファイル**）

| File                                                 | 変更内容                                                                                | 備考                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/components/ui/ResultTable.tsx`                  | inline style 全除去 + API 再設計                                                        | MIGRATED_FILES 登録                                                                 |
| `src/components/ui/InputField.tsx`                   | inline style 全除去                                                                     | MIGRATED_FILES 登録、API 不変                                                       |
| `src/styles/global.css`                              | §3 の `@layer components` 追記                                                          | PR 1 既存ブロックの末尾に追記                                                       |
| `src/components/tools/UlidGenerator.tsx`             | columns 配列の `cellStyle: {...}` を **すべて** `cellPadding` flag + `className` に変換 | render 関数内の `<span style={{...}}>` は **本 PR では触らない**（PR 5 スコープ）   |
| `src/components/tools/UuidV7Generator.tsx`           | columns 配列の `cellStyle: {...}` を **すべて** `cellPadding` flag + `className` に変換 | render 関数内の `<ColoredUuid>` 等の inline style は **本 PR では触らない**（PR 3） |
| `src/utils/__tests__/inline-style-migration.test.ts` | `MIGRATED_FILES` array に 2 件追加                                                      | -                                                                                   |

**MIGRATED_FILES 登録基準の再確認**: migration test は対象ファイル全体から `style={{` を検出する。`UlidGenerator.tsx` / `UuidV7Generator.tsx` は本 PR で MIGRATED_FILES に**追加しない**（render 関数の inline style が残るため、追加すると test fail）。columns 配列の `cellStyle: { ... }` は `style=` JSX 構文ではないため検出対象外で、本 PR の API 移行で消失するだけ。

### 6. 検証戦略

#### ローカル必須ゲート（push 前、PR 1 と同じ）

| 順  | コマンド                | 目的                                                                              | 失敗時                                                   |
| --- | ----------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | `npm run test` (vitest) | unit + migration test の MIGRATED_FILES 範囲拡大（13 件 × 2 spec = 26 spec 追加） | 該当ファイルの `style={{` を実コードで除去               |
| 2   | `npx astro check`       | TypeScript 型チェック（`TableColumn<T>` の API 変更で consumer が型エラーを露呈） | consumer 側を新 API（`cellPadding` + `className`）に修正 |
| 3   | `npm run test:e2e`      | functional E2E 全 pass（UlidGenerator / UuidV7Generator の操作 e2e は既存）       | regression を fix                                        |

#### CI（PR push で起動）

| workflow                | 実行内容                              | required?       |
| ----------------------- | ------------------------------------- | --------------- |
| `test.yml`              | vitest + e2e                          | ✅ required     |
| `visual-regression.yml` | `npm run test:vrt` (36 baseline 比較) | ❌ non-required |

#### VRT 差分の判断フロー

PR comment に diff があった場合（PR 1 と同じフロー）:

- 意図しない regression（行 zebra 反転 / 区切り線消失 / selection 色違い等）→ class 定義 / consumer className 修正
- ピクセル未満の anti-alias 差 → mask か threshold 緩和（事前合意必要）
- 意図的変化（cellPadding 'normal' を caption 行高に統一する等）→ PR ブランチで `update-visual-baseline.yml` を `workflow_dispatch` trigger → bot が新 baseline を commit back → PR 内で説明

#### a11y 退化検知

memory `feedback_commander_checklist.md` 準拠。本 PR で特に注意:

- `<tr>` の `aria-selected` 属性（onRowClick 時のみ設定される）が消失していないか
- `<th scope="col">` が消失していないか
- `<input>` / `<textarea>` の `aria-describedby` / `aria-invalid` / `htmlFor` が consumer で破綻していないか

親 Opus が PR 作成時に `git diff -- src/components/ui/{ResultTable,InputField}.tsx` で aria/role/scope/htmlFor の差分目視確認。

---

## バッチ計画における本 PR の位置付け

memory `project_b_plan_progress.md` のテーブル参照。

| #          | スコープ                                                                                | 状態           |
| ---------- | --------------------------------------------------------------------------------------- | -------------- |
| PR 0       | VRT 導入                                                                                | ✅ #254 merged |
| PR 1       | 基礎工事 + ui/\* simple 11                                                              | ✅ #256 merged |
| **PR 1.5** | **ui/\* complex (ResultTable + InputField) — API redesign 含む**                        | **本 PR**      |
| PR 2       | qr-ticket/\*                                                                            | 未着手         |
| PR 3       | JwtDecoder + UuidV7Generator                                                            | 未着手         |
| PR 4       | Gs1Databar + EncodingConverter + DummyText                                              | 未着手         |
| PR 5       | QrReader + ConfigConverter + JanCode + QrCode + 残り tools                              | 未着手         |
| PR 6       | flip + cleanup（CSP strict 化、`stripMetaStyleSrc()` 撤去、`src/utils/styles.ts` 削除） | 未着手         |

PR は**直列**（前 PR がマージされてから次 PR 着手）。

---

## スコープ外

- `qr-ticket/*` (PR 2)
- `JwtDecoder` / `UuidV7Generator` の **render 関数内 inline style**（PR 3）
- `Gs1Databar` / `EncodingConverter` / `DummyText` (PR 4)
- `QrReader` / `ConfigConverter` / `JanCode` / `QrCode` / **`UlidGenerator` の render 関数内 inline style** / 残り tools (PR 5)
- `_headers` の `style-src 'unsafe-inline'` 削除 (PR 6)
- `stripMetaStyleSrc()` 撤去 (PR 6)
- `src/utils/styles.ts` 削除 (PR 6)
- `docs/decisions.md` 新規エントリ（PR 6 [067] で B 案完了として一括記録）
- `docs/ui-conventions.md` 追記（PR 1 で必要な原則は出揃っている）
- `dads-design-system` skill の本格 rewrite (PR 6)

---

## リスクと緩和

| ID  | リスク                                                                                                                                                                                                           | 緩和                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `cellStyle` 廃止で消費側 (UlidGenerator / UuidV7Generator) の見た目が微妙にズレる（特に zebra と selection の合成）                                                                                              | VRT で `mock-ulid` / `mock-uuidv7` ページ（PR 0 の mock 注入版）を baseline 比較。`color-mix()` と `:nth-child(odd/even)` の組み合わせは現状 inline style と数学的に同一表現になることを spec 内で確認済（§1.1 の CSS 定義） |
| R2  | `setProperty('--result-table-min-width', ...)` の CSS 変数注入が一部ブラウザで反映されない                                                                                                                       | PR 1 の ToggleGroup `setProperty('--toggle-cols', ...)` で同手法が動作確認済。Playwright e2e で minWidth が反映されるかを VRT 経由で確認                                                                                     |
| R3  | `<col>` 要素を生成して列幅を CSS 変数注入する戦略が冗長で可読性を損なう                                                                                                                                          | 本 spec の代替案 Alt-A（width API 廃止）を選ばず、API 互換のため `<col>` + setProperty を採用。冗長さは ResultTable 内に閉じる（consumer は影響なし）。可読性のため useEffect ループに JSDoc コメントで意図を明示            |
| R4  | `data-selected` / `aria-selected` の二重管理が a11y 破綻を招く                                                                                                                                                   | spec §3「衝突確認」で責務分離（`data-selected` = 視覚、`aria-selected` = a11y、後者は onRowClick 時のみ）を明文化。テストで両属性の独立性を確認                                                                              |
| R5  | InputField の `readOnly` 状態 bg が `bg-surface-row` 経由になることで、既存 readOnly 表示の見た目が変わる（`var(--color-bg-surface)` 値は同じだが Tailwind 経由 vs CSS 変数経由で specificity 順位が変わりうる） | `@layer components` 内定義のため Tailwind utility と同 layer に置かれる。VRT で全 readOnly InputField page (e.g., GenerateTab の result 表示) を baseline 比較                                                               |
| R6  | API 変更が PR 1.5 内で UlidGenerator / UuidV7Generator の columns 定義を書き換えるため、両 consumer の差分が PR レビューで肥大化                                                                                 | columns 配列内 `cellStyle: {...}` の機械的変換に閉じる（render 関数は触らない）ため、各 consumer の diff は 4 列 × 4-5 行程度。PR description に「ResultTable 関連: ResultTable.tsx + 2 consumer」と明示                     |

---

## ブランチ命名 / コミット粒度 / PR ベース

### ブランチ命名

- `feature/issue-176-b1-5-ui-complex`（hyphen で区切る、`b1-5` は b1.5 の hyphen 表記）
- worktree 経由の場合は memory `feedback_worktree_base_branch.md` に従い `git worktree add ... origin/develop -b feature/issue-176-b1-5-ui-complex` を**明示**
- worktree の置き場所は memory `feedback_worktree_location.md` に従い `.claude/worktrees/<name>` または `$TMPDIR/<name>`

### コミット粒度

```
1. global.css に PR 1.5 用 @layer components 追記（.bg-surface-row / .result-table-* / .btn-link-plain）
2. ResultTable.tsx: 内部 style 撤去（API 維持 = cellStyle 残し、CSSOM 注入のみ先行）
   ↑ ※ 1 コミットに収まらないなら 2-1 (外枠/header/overflow), 2-2 (table/thead/th), 2-3 (tr/td 動的) に分割可
3. ResultTable.tsx: API 再設計（cellStyle 削除、cellPadding 追加、TableColumn 型更新）
4. UlidGenerator.tsx: columns の cellStyle → cellPadding/className 変換
5. UuidV7Generator.tsx: columns の cellStyle → cellPadding/className 変換
6. InputField.tsx: 内部 style 撤去（API 不変）
7. inline-style-migration.test.ts: MIGRATED_FILES に 2 件追加
8. （VRT 差分が出た場合のみ）update-visual-baseline.yml trigger 結果の baseline commit (bot が自動 push)
```

各 commit で migration test を「追加した範囲だけ pass」する状態に保つ（コミット 7 は最後の方が安全 — 6 までで両ファイルの style 撤去完了確認後）。

### PR ベース

`gh pr create --base develop` で必ず明示（memory `feedback_branch_workflow.md` / `feedback_pr_language.md`）。タイトル例:

> `refactor(ui): #176 B 案 PR 1.5 — ResultTable + InputField inline style 撤去 + cellStyle API 再設計`

---

## 議論ポイント（spec 確定前に user 判断を要する項目）

以下は本 spec 内で「採用」と書いたが、user の判断で別案に切り替え可能な箇所。実装着手前にレビューを推奨:

1. **§1.2 API 再設計の組み合わせ**: 案 A (`cellPadding` flag + `className`) を採用したが、案 B (`className` only) でもよいか?
   - 案 B の Tailwind 順序問題は Tailwind v4 の `@layer` 順序定義で解決可能（`utilities` layer 同士なので後勝ちは未保証だが、source order に依存）。
   - 採用判断: **案 A で進める**（明示性 + 順序非依存性を優先）。

2. **§1.1 動的 width の `<col>` + setProperty 戦略**: API 互換のため複雑化を許容したが、`width` を Tailwind utility class（`w-14` 等）に強制する代替案を採るなら API 破壊の幅が広がる。
   - 採用判断: **API 互換維持で `<col>` + setProperty**。consumer が任意 width 文字列を渡せる現 API を保つ。

3. **§3 `data-selected` vs `aria-selected` の責務分離**: 視覚と a11y を別属性で持つ設計。`aria-selected` を CSS 参照する案もあるが、a11y 非対応行（onRowClick なし）で zebra が破綻するため不採用。
   - 採用判断: **`data-selected` を新設**。

4. **§2.2 InputField サンプルボタン**: 新規 `.btn-link-plain` class を作るか、Tailwind utility 直接展開か?
   - 採用判断: **`.btn-link-plain` class 新設**（PR 1 の `.btn-clear` / `.btn-copy` と統一感）。Alt 案: Tailwind utility 直接 (`bg-transparent border-0 p-0 cursor-pointer text-link caption`)。

これら 4 項目に user が異論なければ、本 spec を最終とし plan ファイル (`docs/superpowers/plans/2026-05-04-issue-176-b1-5-ui-complex.md`) 作成 → 実装着手へ。

---

## 関連

- 起源 issue: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B
- 前提 PR: [#249](https://github.com/fumtas1k/devtools/pull/249) (A-1)、[#252](https://github.com/fumtas1k/devtools/pull/252) (meta-csp coverage)、[#254](https://github.com/fumtas1k/devtools/pull/254) (VRT 導入)、[#256](https://github.com/fumtas1k/devtools/pull/256) (PR 1 foundation + ui simple)
- 過去 decisions: [054]（CSP 初導入）／[064]（A-1 採用）／[066]（VRT 採用）
- memory: `project_b_plan_progress.md` / `feedback_vrt_setup_sequencing.md` / `feedback_infra_feature_separation.md` / `feedback_subagent_verification_trust.md` / `feedback_positive_control_for_gates.md` / `feedback_commander_checklist.md` / `feedback_pr_size.md` / `feedback_worktree_base_branch.md` / `feedback_worktree_location.md`
- PR 1 spec: `docs/superpowers/specs/2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md`（命名規約・既存 `@layer components` 定義は本 spec の前提）
