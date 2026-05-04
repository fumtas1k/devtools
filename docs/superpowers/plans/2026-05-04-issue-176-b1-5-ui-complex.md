# #176 B 案 PR 1.5: ResultTable + InputField 移行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/components/ui/{ResultTable,InputField}.tsx` から JSX `style={{}}` を完全除去し、`TableColumn<T>.cellStyle: CSSProperties` を `cellPadding: 'normal' | 'compact'` flag + `className` 拡張に置換する。

**Architecture:** 動的スタイル（行 zebra・selection bg・区切り線・min-width）を `:nth-child` / `data-selected` 属性 / `setProperty('--var', ...)` 経由 CSS 変数注入で表現。consumer (`UlidGenerator`, `UuidV7Generator`) の `columns` 定義のみ新 API に書き換え（`render` 関数内の inline style は触らない、PR 3/5 スコープ）。

**Tech Stack:** React + TypeScript / Tailwind v4 (`@theme` + `@layer components`) / Vitest + Playwright / Astro Check

**Spec:** `docs/superpowers/specs/2026-05-04-issue-176-b1-5-ui-complex-design.md`

---

## File Structure

| File                                                 | 役割                                                               | 操作   |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ------ |
| `src/styles/global.css`                              | PR 1.5 用 `@layer components` class 群を末尾に追記                 | Modify |
| `src/components/ui/ResultTable.tsx`                  | inline style 撤去 + `TableColumn<T>` API 再設計                    | Modify |
| `src/components/ui/InputField.tsx`                   | inline style 撤去（API 不変）                                      | Modify |
| `src/components/tools/UlidGenerator.tsx`             | columns の `cellStyle: {...}` → `cellPadding` + `className` に変換 | Modify |
| `src/components/tools/UuidV7Generator.tsx`           | 同上                                                               | Modify |
| `src/utils/__tests__/inline-style-migration.test.ts` | `MIGRATED_FILES` array に 2 件追加                                 | Modify |

---

## Working Order Strategy

API 破壊変更 (`cellStyle` 削除) を atomic commit で行うと一時的に astro check が壊れるため、以下の順序で進める:

1. CSS 追加（依存なし）
2. ResultTable 内部 style 撤去 + **新 API `cellPadding` 追加（旧 `cellStyle` も残す）** — 両方が共存する過渡状態
3. consumer 2 件を新 API に移行
4. ResultTable から旧 `cellStyle` を削除（API atomic 削除）
5. InputField 移行
6. MIGRATED_FILES 登録 → 全体 validation

各 commit で `npx astro check` / `npm run test` が green を維持する。

---

### Task 1: `global.css` に PR 1.5 用 `@layer components` 追記

**Files:**

- Modify: `src/styles/global.css`（既存 `@layer components` ブロックの末尾、または新規 `@layer components` ブロックを追加）

- [ ] **Step 1: 既存 `@layer components` ブロックの位置を確認**

Run: `grep -n "@layer components" src/styles/global.css`
Expected: PR 1 で追加された `@layer components { ... }` ブロックが 1 箇所以上ヒット

- [ ] **Step 2: 該当ブロックの末尾（`}` の直前）に以下を追記**

```css
/* === PR 1.5: Surface bg (used by table thead row & InputField readOnly) === */
.bg-surface {
  background: var(--color-bg-surface);
}

/* === PR 1.5: ResultTable component-scoped === */
.result-table {
  /* setProperty('--result-table-min-width', ...) で注入。未注入時は 0 (= no min-width 制約) */
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
/* selection マーカー (border-top/bottom 2px primary) */
.result-table-row[data-selected='true'] > td {
  border-top: 2px solid var(--color-primary);
  border-bottom: 2px solid var(--color-primary);
}
/* 区切り線 (最終行と選択中の行を除く) */
.result-table-row:not(:last-child):not([data-selected='true']) > td {
  box-shadow: inset 0 -1px 0 var(--color-border);
}

/* === PR 1.5: InputField サンプルボタン === */
.btn-link-plain {
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}
```

- [ ] **Step 3: dev server で CSS が build エラーにならないか確認**

Run: `npm run dev` をバックグラウンド起動 → `curl -s http://localhost:4321/` で 200 確認 → kill

または素早く: `npx astro check`
Expected: error なし（CSS は astro check の対象外だが、import 連鎖で壊れていれば検出される）

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css
git commit -m "style(global): #176 B 案 PR 1.5 用 @layer components 追記 (.result-table-* / .bg-surface / .btn-link-plain)"
```

---

### Task 2: ResultTable の内部 style 撤去 + `cellPadding` flag 追加（旧 `cellStyle` は残す過渡状態）

**Files:**

- Modify: `src/components/ui/ResultTable.tsx`

- [ ] **Step 1: ResultTable.tsx 全体を以下に置換**

```tsx
import type { ReactNode, CSSProperties } from 'react';
import { useEffect, useRef } from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  headerAlign?: 'left' | 'right' | 'center';
  cellAlign?: 'left' | 'right' | 'center';
  width?: string;
  /** td に追加される className (typography / 色 / nowrap 等の修飾用) */
  className?: string;
  /** セルパディング。default: 'normal' (0.5rem 0.75rem)、compact (0.25rem 0.5rem) */
  cellPadding?: 'normal' | 'compact';
  /**
   * @deprecated PR 1.5 で `cellPadding` + `className` に置換。本 PR 内の過渡 API。次の commit で削除。
   */
  cellStyle?: CSSProperties;
  render: (row: T, index: number) => ReactNode;
}

interface Props<T> {
  rows: T[];
  columns: TableColumn<T>[];
  getKey: (row: T) => string | number;
  minWidth?: string;
  selectedIndex?: number | null;
  onRowClick?: (index: number) => void;
  renderHeader?: () => ReactNode;
}

const alignClass = (a?: 'left' | 'right' | 'center') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

const paddingClass = (p?: 'normal' | 'compact') => (p === 'compact' ? 'px-2 py-1' : 'px-3 py-2');

export function ResultTable<T>({
  rows,
  columns,
  getKey,
  minWidth,
  selectedIndex = null,
  onRowClick,
  renderHeader,
}: Props<T>) {
  const tableRef = useRef<HTMLTableElement>(null);
  const colgroupRef = useRef<HTMLTableColElement[]>([]);

  useEffect(() => {
    if (tableRef.current && minWidth) {
      tableRef.current.style.setProperty('--result-table-min-width', minWidth);
    }
  }, [minWidth]);

  useEffect(() => {
    columns.forEach((col, i) => {
      const colEl = colgroupRef.current[i];
      if (colEl && col.width) {
        colEl.style.setProperty('--col-width', col.width);
      }
    });
  }, [columns]);

  return (
    <div className="rounded-lg border border-default overflow-hidden">
      {renderHeader && (
        <div className="flex flex-col gap-2 px-4 py-3 bg-subtle border-b border-default">
          {renderHeader()}
        </div>
      )}
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full border-collapse result-table">
          <colgroup>
            {columns.map((col, i) => (
              <col
                key={col.key}
                ref={(el) => {
                  if (el) colgroupRef.current[i] = el;
                }}
                style={col.width ? undefined : undefined}
                className={col.width ? 'result-table-col' : undefined}
              />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-surface border-b border-default">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`caption text-muted font-semibold whitespace-nowrap ${paddingClass(col.cellPadding)} ${alignClass(col.headerAlign)}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isSelected = selectedIndex === i;
              return (
                <tr
                  key={getKey(row)}
                  onClick={onRowClick ? () => onRowClick(i) : undefined}
                  className="result-table-row"
                  data-selected={isSelected ? 'true' : 'false'}
                  data-clickable={onRowClick ? 'true' : 'false'}
                  aria-selected={onRowClick ? isSelected : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={col.cellStyle}
                      className={`caption text-default ${paddingClass(col.cellPadding)} ${alignClass(col.cellAlign)} ${col.className ?? ''}`}
                    >
                      {col.render(row, i)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `<col>` の width を CSS 変数注入する補助 CSS を `global.css` に追加**

`src/styles/global.css` の `@layer components` ブロック内（PR 1.5 ブロックの末尾）に追記:

```css
.result-table-col {
  width: var(--col-width, auto);
}
```

- [ ] **Step 3: 型チェック**

Run: `npx astro check`
Expected: error 0（`cellStyle` は `@deprecated` 注記つきで残しているため consumer 側もまだ動く）

- [ ] **Step 4: 既存 unit テストで回帰確認**

Run: `npm run test -- src/utils/__tests__/inline-style-migration.test.ts`
Expected: PASS（ResultTable.tsx はまだ MIGRATED_FILES に未登録 + 旧 `cellStyle` 経由の inline style があるが、検出される `style={{` は 1 箇所のみ → MIGRATED_FILES 登録は Task 6 まで先送り）

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ResultTable.tsx src/styles/global.css
git commit -m "refactor(ui): ResultTable 内部 inline style を class 化 + cellPadding flag 追加 (#176 B 案 PR 1.5)"
```

---

### Task 3: UlidGenerator の `columns` 定義を新 API に変換

**Files:**

- Modify: `src/components/tools/UlidGenerator.tsx`（columns 配列のみ）

**注意**: `render` 関数内 (`<span style={{ color: colors.primary }}>...`) は触らない（PR 5 スコープ）。

- [ ] **Step 1: `columns` の各 cellStyle を新 API に書き換え**

`src/components/tools/UlidGenerator.tsx` 45-99 行目（`const columns: TableColumn<UlidRow>[] = [...]`）を以下に置換:

```tsx
const columns: TableColumn<UlidRow>[] = [
  {
    key: 'no',
    header: 'No.',
    headerAlign: 'right',
    cellAlign: 'right',
    width: '3.5rem',
    className: 'text-muted tabular-nums',
    render: (_, i) => i + 1,
  },
  {
    key: 'ulid',
    header: 'ULID',
    className: 'font-mono whitespace-nowrap',
    render: (row) => (
      <>
        <span style={{ color: colors.primary }}>{row.id.slice(0, 10)}</span>
        <span>{row.id.slice(10)}</span>
      </>
    ),
  },
  {
    key: 'timestamp',
    header: 'タイムスタンプ（ISO 8601）',
    className: 'font-mono text-muted whitespace-nowrap',
    render: (row) => row.timestamp,
  },
  {
    key: 'copy',
    header: 'コピー',
    headerAlign: 'center',
    cellAlign: 'center',
    width: '6rem',
    cellPadding: 'compact',
    className: 'whitespace-nowrap',
    render: (row) => <CopyButton text={formatId(row.id)} compact />,
  },
];
```

- [ ] **Step 2: 不要になった import を削除**

`UlidGenerator.tsx` のファイル先頭 import を確認:

Run: `grep -n "from '@/utils/styles'" src/components/tools/UlidGenerator.tsx`

`caption` が他で使われていないか確認:

Run: `grep -n "caption" src/components/tools/UlidGenerator.tsx`
Expected: render 関数内（`<span style={{ ...bodyEmphasis, color: colors.text }}>`）に残る `bodyEmphasis` は別物。`caption` は columns で使っていたので **未使用なら削除**

import 行を `import { bodyEmphasis, colors } from '@/utils/styles';` に変更（`caption` 削除）

- [ ] **Step 3: 型チェック**

Run: `npx astro check`
Expected: error 0

- [ ] **Step 4: e2e で UlidGenerator のテーブル描画が動くことを目視確認（dev server）**

Run: `npm run dev` をバックグラウンド起動 → ブラウザで `http://localhost:4321/ulid-generator/` → 「生成」クリック → 表が描画される / zebra / コピー列 compact padding が見える
**完了後**: dev server を kill

- [ ] **Step 5: Commit**

```bash
git add src/components/tools/UlidGenerator.tsx
git commit -m "refactor(ui): UlidGenerator columns を ResultTable 新 API (cellPadding/className) に移行 (#176 B 案 PR 1.5)"
```

---

### Task 4: UuidV7Generator の `columns` 定義を新 API に変換

**Files:**

- Modify: `src/components/tools/UuidV7Generator.tsx`（columns 配列のみ）

**注意**: `render` 関数内（`<ColoredUuid uuid={row.id} ...>` 等）は触らない（PR 3 スコープ）。

- [ ] **Step 1: `columns` の各 cellStyle を新 API に書き換え**

`src/components/tools/UuidV7Generator.tsx` 124-166 行目（`const columns: TableColumn<UuidRow>[] = [...]`）を以下に置換:

```tsx
const columns: TableColumn<UuidRow>[] = [
  {
    key: 'no',
    header: 'No.',
    headerAlign: 'right',
    cellAlign: 'right',
    width: '3.5rem',
    className: 'text-muted tabular-nums',
    render: (_, i) => i + 1,
  },
  {
    key: 'uuid',
    header: 'UUID',
    render: (row) => <ColoredUuid uuid={row.id} quoteStyle={quoteStyle} />,
  },
  {
    key: 'timestamp',
    header: 'タイムスタンプ（ISO 8601）',
    className: 'font-mono text-muted whitespace-nowrap',
    render: (row) => row.timestamp,
  },
  {
    key: 'copy',
    header: 'コピー',
    headerAlign: 'center',
    cellAlign: 'center',
    width: '6rem',
    cellPadding: 'compact',
    className: 'whitespace-nowrap',
    render: (row) => <CopyButton text={formatId(row.id)} compact />,
  },
];
```

- [ ] **Step 2: 不要になった import を削除**

Run: `grep -n "caption" src/components/tools/UuidV7Generator.tsx`
未使用なら import から `caption` 削除（`bodyEmphasis` / `colors` は render 関数で残る前提）

- [ ] **Step 3: 型チェック**

Run: `npx astro check`
Expected: error 0

- [ ] **Step 4: dev server で UuidV7Generator の動作目視確認**

Run: `npm run dev` → `http://localhost:4321/uuid-v7-generator/` → 「生成」 → テーブル描画 / 行クリックで selection bg + border-top/bottom が出る / 区切り線が選択行以外で見える
**完了後**: kill

- [ ] **Step 5: Commit**

```bash
git add src/components/tools/UuidV7Generator.tsx
git commit -m "refactor(ui): UuidV7Generator columns を ResultTable 新 API (cellPadding/className) に移行 (#176 B 案 PR 1.5)"
```

---

### Task 5: ResultTable から `cellStyle` 削除（API atomic 削除）

**Files:**

- Modify: `src/components/ui/ResultTable.tsx`

- [ ] **Step 1: `TableColumn<T>` から `cellStyle` フィールドと関連 import を削除**

`src/components/ui/ResultTable.tsx` 内:

1. `import type { ReactNode, CSSProperties } from 'react';` → `import type { ReactNode } from 'react';`（`CSSProperties` 未使用化）
2. `TableColumn<T>` から `cellStyle?: CSSProperties;` 行を削除（`@deprecated` 注記ごと）
3. `<td>` レンダリング内の `style={col.cellStyle}` 属性を削除

該当差分（Task 2 で書いた ResultTable.tsx に対する変更）:

```diff
-import type { ReactNode, CSSProperties } from 'react';
+import type { ReactNode } from 'react';
 import { useEffect, useRef } from 'react';

 export interface TableColumn<T> {
   key: string;
   header: string;
   headerAlign?: 'left' | 'right' | 'center';
   cellAlign?: 'left' | 'right' | 'center';
   width?: string;
   className?: string;
   cellPadding?: 'normal' | 'compact';
-  /**
-   * @deprecated PR 1.5 で `cellPadding` + `className` に置換。本 PR 内の過渡 API。次の commit で削除。
-   */
-  cellStyle?: CSSProperties;
   render: (row: T, index: number) => ReactNode;
 }
```

```diff
                     <td
                       key={col.key}
-                      style={col.cellStyle}
                       className={`caption text-default ${paddingClass(col.cellPadding)} ${alignClass(col.cellAlign)} ${col.className ?? ''}`}
                     >
                       {col.render(row, i)}
                     </td>
```

- [ ] **Step 2: 全 consumer が cellStyle を使っていないことを確認**

Run: `grep -rn "cellStyle" src/`
Expected: ヒット 0（PR 1.5 で全消失）

ヒットがあれば該当 consumer を Task 3/4 と同じ要領で修正してから戻る。

- [ ] **Step 3: 型チェック**

Run: `npx astro check`
Expected: error 0

- [ ] **Step 4: ResultTable.tsx の `style={{` ヒット数確認**

Run: `grep -c "style={{" src/components/ui/ResultTable.tsx`
Expected: `0`

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ResultTable.tsx
git commit -m "refactor(ui)!: ResultTable から cellStyle API を削除 (#176 B 案 PR 1.5)"
```

---

### Task 6: MIGRATED_FILES に ResultTable を登録（migration test を強制 pass 化）

**Files:**

- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: `MIGRATED_FILES` array に `ResultTable.tsx` を追加**

`src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array 末尾（PR 1 で追加された 11 件の後）に追記:

```ts
  // PR 1.5 で追加
  'src/components/ui/ResultTable.tsx',
```

- [ ] **Step 2: migration test 実行**

Run: `npm run test -- src/utils/__tests__/inline-style-migration.test.ts`
Expected: PASS（ResultTable.tsx は Task 5 で `style={{` ヒット 0 になっているため）

万一 fail する場合: ResultTable.tsx 内に未撤去の `style={{` が残っている → grep で発見して撤去 → Task 5 に戻る

- [ ] **Step 3: Commit**

```bash
git add src/utils/__tests__/inline-style-migration.test.ts
git commit -m "test(migration): MIGRATED_FILES に ResultTable を登録 (#176 B 案 PR 1.5)"
```

---

### Task 7: InputField の内部 style 撤去（API 不変）

**Files:**

- Modify: `src/components/ui/InputField.tsx`

- [ ] **Step 1: InputField.tsx 全体を以下に置換**

```tsx
import type { InputHTMLAttributes, ReactNode } from 'react';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

interface Props {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  error?: string;
  hint?: string;
  onSampleClick?: () => void;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number;
  readOnly?: boolean;
  mono?: boolean;
  resize?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement | HTMLInputElement>;
}

export function InputField({
  id,
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 4,
  error,
  hint,
  onSampleClick,
  inputMode,
  maxLength,
  readOnly = false,
  mono = false,
  resize = false,
  onKeyDown,
}: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  const inputClass = [
    'caption w-full rounded-lg px-3 py-2 border text-default',
    error ? 'border-error' : 'border-input',
    readOnly ? 'bg-surface' : 'bg-default',
    mono && 'font-mono',
    multiline && !resize && 'resize-none',
    multiline && resize && 'resize-y',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <div className="flex items-center justify-between mb-3 min-h-8">
        <label htmlFor={id} className="body-emphasis text-default">
          {label}
        </label>
        {onSampleClick && (
          <button
            type="button"
            onClick={onSampleClick}
            className="caption text-link btn-link-plain"
          >
            サンプルを入力
          </button>
        )}
      </div>

      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={rows}
          readOnly={readOnly}
          maxLength={maxLength}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          className={inputClass}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          readOnly={readOnly}
          maxLength={maxLength}
          inputMode={inputMode}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          className={inputClass}
        />
      )}

      {error ? (
        <ErrorMessage id={errorId} message={error} />
      ) : hint ? (
        <p id={hintId} className="caption text-muted mt-1">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
```

**変更点**:

- `import { bodyEmphasis, caption, colors } from '@/utils/styles';` 削除（`@/utils/styles` 自体は他で使われ続けるので消えない）
- 全 `style={{...}}` を className 化
- `baseInputStyle` を `inputClass` (string) に置換、合成は `[...].filter(Boolean).join(' ')`
- `readOnly` 時の bg は `bg-surface`、通常時は `bg-default`（`@layer components` で PR 1 / PR 1.5 に定義済）

- [ ] **Step 2: `style={{` ヒット数確認**

Run: `grep -c "style={{" src/components/ui/InputField.tsx`
Expected: `0`

- [ ] **Step 3: 型チェック**

Run: `npx astro check`
Expected: error 0

- [ ] **Step 4: dev server で InputField を使う任意の tool（例: JsonXml / EncodingConverter）の見た目確認**

Run: `npm run dev` → `http://localhost:4321/json-xml/` または `/encoding-converter/`

- ラベル: body-emphasis (太字 + line-height 1.7) で描画
- input/textarea: caption typography + border-input + bg-default
- error 状態: error 用 input が `border-error` で赤く
- readOnly 状態: bg-surface（薄い surface 色）
- サンプルを入力ボタン: text-link 色 + 装飾なし
- mono = true の tool（QrCode 等）: font-mono が適用される

**完了後**: kill

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/InputField.tsx
git commit -m "refactor(ui): InputField 内部 inline style を class 化 (#176 B 案 PR 1.5)"
```

---

### Task 8: MIGRATED_FILES に InputField を登録

**Files:**

- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: `MIGRATED_FILES` array に `InputField.tsx` を追加**

```ts
  // PR 1.5 で追加（ResultTable に続けて）
  'src/components/ui/InputField.tsx',
```

- [ ] **Step 2: migration test 実行**

Run: `npm run test -- src/utils/__tests__/inline-style-migration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/utils/__tests__/inline-style-migration.test.ts
git commit -m "test(migration): MIGRATED_FILES に InputField を登録 (#176 B 案 PR 1.5)"
```

---

### Task 9: Push 前ハードゲート（local 必須 3 検証）

**Files:** なし（実行のみ）

- [ ] **Step 1: vitest 全 spec 実行**

Run: `npm run test`
Expected: 全 PASS（migration test の MIGRATED_FILES 13 件 × 2 spec + 既存 unit test）

fail があれば原因を特定して該当 task に戻る。

- [ ] **Step 2: astro check（型）**

Run: `npx astro check`
Expected: error 0

- [ ] **Step 3: e2e**

Run: `npm run test:e2e`
Expected: 全 PASS

memory `feedback_subagent_testing.md` / `feedback_e2e_before_pr.md` に従い、push 前に必ず 3 つすべて green を確認。

- [ ] **Step 4: aria/role/scope/htmlFor 退化検知**

Run: `git diff origin/develop -- src/components/ui/ResultTable.tsx src/components/ui/InputField.tsx | grep -E '(aria-|role=|scope=|htmlFor=)'`
Expected: 削除行 (`-` 始まり) と追加行 (`+` 始まり) で aria/role/scope/htmlFor の登場数が一致（実質変化なし）

memory `feedback_commander_checklist.md` 準拠。差分があれば該当箇所を補完して Task 2 / Task 7 に戻る。

- [ ] **Step 5: 全 inline style 状況の最終確認**

Run: `grep -c "style={{" src/components/ui/ResultTable.tsx src/components/ui/InputField.tsx`
Expected: 両ファイルとも `0`

Run: `grep -c "cellStyle" src/`
Expected: `0`（残存していない）

---

### Task 10: Push + PR 作成（親セッションで実施）

**Files:** なし（git/gh 操作のみ）

memory `feedback_subagent_workflow.md` に従い、push と PR 作成は親 Opus が引き取る分業。

- [ ] **Step 1: Push**

```bash
git push -u origin feature/issue-176-b1-5-ui-complex
```

- [ ] **Step 2: PR 作成（base develop 必須 / 日本語 / HEREDOC で backtick エスケープなし）**

```bash
gh pr create --base develop --title "refactor(ui): #176 B 案 PR 1.5 — ResultTable + InputField inline style 撤去 + cellStyle API 再設計" --body "$(cat <<'EOF'
## 概要

`#176` B 案 PR 1.5: `src/components/ui/ResultTable.tsx` / `src/components/ui/InputField.tsx` から JSX `style={{}}` を完全除去し、`TableColumn<T>.cellStyle: CSSProperties` を `cellPadding: 'normal' | 'compact'` flag + `className` 拡張に置換する。

PR 1 ([#256](https://github.com/fumtas1k/devtools/pull/256)) で simple 11 件を migration 済。本 PR は API 破壊変更を伴う complex 2 件を独立に処理。

## 主要な変更

- `ResultTable.tsx`: 内部 8 件の `style={{}}` を class 化。動的 `minWidth` / 列 `width` は `setProperty('--var', ...)` で CSS 変数注入（PR 1 の ToggleGroup と同手法）。selection / zebra / 区切り線は `data-selected` 属性 + `:nth-child` + `:not(:last-child)` で表現
- `ResultTable.tsx` API: `cellStyle?: CSSProperties` を **削除**、代わりに `cellPadding?: 'normal' | 'compact'` を追加（破壊変更）
- `InputField.tsx`: 内部 4 件の `style={{}}` を class 化（API 不変）
- `UlidGenerator.tsx` / `UuidV7Generator.tsx`: columns 配列の `cellStyle: {...}` を新 API に変換（**render 関数内 inline style は本 PR では touch せず、PR 3 / PR 5 スコープ**）
- `global.css`: `@layer components` に `.bg-surface` / `.result-table-*` / `.btn-link-plain` / `.result-table-col` を追加
- `inline-style-migration.test.ts`: `MIGRATED_FILES` に 2 件追加（計 13 件）

## 検証

- ローカル: `npm run test` / `npx astro check` / `npm run test:e2e` 全 green
- CI: `test.yml`（required）/ `visual-regression.yml`（non-required、差分あれば baseline 更新後 commit back）
- a11y 退化検知: `aria-selected` / `scope=` / `htmlFor=` の登場数が diff で保たれている

## 関連

- 起源 issue: #176（B 案）
- 直前の PR: #256（PR 1）
- spec: `docs/superpowers/specs/2026-05-04-issue-176-b1-5-ui-complex-design.md`
- plan: `docs/superpowers/plans/2026-05-04-issue-176-b1-5-ui-complex.md`

## バッチ計画における位置付け

| #        | スコープ                                                           | 状態           |
| -------- | ------------------------------------------------------------------ | -------------- |
| PR 0     | VRT 導入                                                           | ✅ #254 merged |
| PR 1     | 基礎工事 + ui/* simple 11                                          | ✅ #256 merged |
| **PR 1.5** | **ui/* complex (ResultTable + InputField) — API redesign**     | **本 PR**      |
| PR 2     | qr-ticket/*                                                        | 未着手         |
| PR 3-6   | tools / flip                                                       | 未着手         |
EOF
)"
```

- [ ] **Step 3: PR 作成後の確認**

Run: `gh pr view --json baseRefName,title,url`
Expected: `baseRefName: "develop"`、title が日本語、URL が表示される

- [ ] **Step 4: PR URL を user に報告**

PR URL を user に伝える。VRT に意図的差分があれば PR comment で確認後、`update-visual-baseline.yml` を `workflow_dispatch` trigger（PR 1 と同フロー）。

- [ ] **Step 5: PR マージ後（user 承認 + CI green 後）**

memory `feedback_worktree_merge_order.md` に従い:

```bash
gh pr merge --squash --delete-branch
# worktree クリーンアップ
git worktree remove .claude/worktrees/issue-176-b1-5-ui-complex
git branch -D feature/issue-176-b1-5-ui-complex 2>/dev/null || true
```

- [ ] **Step 6: 進捗 memory 更新**

`/Users/fumta/.claude/projects/-Users-fumta-projects-devtools/memory/project_b_plan_progress.md` の進捗状況テーブルで `PR 1.5` の状態を `✅ merged` に更新、PR URL を記録。

---

## Self-Review チェック結果

**1. Spec coverage**:

- [x] § 1.1（内部 style 撤去）→ Task 2 + Task 5
- [x] § 1.2（API 再設計）→ Task 2（`cellPadding` 追加）+ Task 5（`cellStyle` 削除）
- [x] § 1.3（th align Tailwind utility）→ Task 2 内 `alignClass` helper
- [x] § 2.1 / 2.2（InputField class 化）→ Task 7
- [x] § 3（global.css 追記）→ Task 1 + Task 2 Step 2
- [x] § 4（MIGRATED_FILES 追加）→ Task 6 + Task 8
- [x] § 5（consumer 範囲）→ Task 3 + Task 4
- [x] § 6（検証戦略）→ Task 9
- [x] § ブランチ命名 / commit 粒度 / PR ベース → Task 10

**2. Placeholder scan**: 「TBD」「TODO」「implement later」等は本 plan 内に存在しない。

**3. Type consistency**:

- `paddingClass()` / `alignClass()` helper は Task 2 で定義、Task 5 でも引き続き使用
- `TableColumn<T>` の `cellPadding` は Task 2-5 / Task 3-4 (consumer) で同一シグネチャ
- `inputClass` は Task 7 のみ

**4. 留意点**:

- Task 2 → Task 5 の間（Task 3, 4）で旧 `cellStyle` が残っているが、`@deprecated` JSDoc 付きで consumer 移行が完了するまでの過渡状態。PR 内の commit chain で見れば squash merge 後は cellStyle が完全消失する（破壊変更を atomic に提示）

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-04-issue-176-b1-5-ui-complex.md`.**
