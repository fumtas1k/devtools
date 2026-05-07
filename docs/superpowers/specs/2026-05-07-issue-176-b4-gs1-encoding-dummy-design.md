# #176 B 案 PR 4: `Gs1Databar` + `EncodingConverter` + `DummyText` inline style 撤去 設計書

**作成日**: 2026-05-07
**Issue**: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B / PR 4
**前提**: A-1 ([#249](https://github.com/fumtas1k/devtools/pull/249)) + VRT 基盤 ([#254](https://github.com/fumtas1k/devtools/pull/254)) + PR 1 ([#256](https://github.com/fumtas1k/devtools/pull/256)) + PR 1.5 ([#261](https://github.com/fumtas1k/devtools/pull/261)) + PR 2 ([#272](https://github.com/fumtas1k/devtools/pull/272)) + PR 3 ([#275](https://github.com/fumtas1k/devtools/pull/275)) 完了済み
**参照**: バッチ計画全体は repo SoT [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md)。PR 1 / 1.5 / 2 / 3 spec の命名規約・既存 `@layer components` 定義を継承。

---

## ゴール

`src/components/tools/Gs1Databar.tsx` (20 件) + `src/components/tools/EncodingConverter.tsx` (20 件) + `src/components/tools/DummyText.tsx` (13 件) から JSX inline style を完全撤去 + Gs1Databar 内の `e.currentTarget.style.X = Y` 形式の CSSOM 直接 mutation 9 件 (`onMouseEnter`/`onMouseLeave` hover state) を撤去し、`@layer components` の意味クラス + Tailwind utility (`hover:` modifier 含む) に置換する。

完了基準:

1. 対象 3 ファイルから `style={{` ヒット数 0、`element.style.X = Y` 形式の inline mutation 0
2. `src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array に 3 件追加 (合計 21 件) して migration test pass
3. `src/styles/global.css` の `@layer components` に **新規 1 class のみ** 追加 (`.summary-no-marker`、§4 参照)
4. **Phase 1 race 回避運用**: subagent は **commit せず** ファイル編集 + self-verification (vitest, astro check) のみ実施、親 Opus が Phase 1.5 で順次 commit (PR 3 の commit 結合 race の反省、§9.4 参照)
5. **VRT 検証**: `visual-regression.yml` で baseline 比較。意図的差分があれば PR ブランチ上で `update-visual-baseline.yml` を `workflow_dispatch` trigger
6. ローカル必須ゲート: push 前に `npm run test` (vitest) / `npx astro check` / `npm run test:e2e` 全 green (親 Opus 直接実行)
7. `src/utils/styles.ts` 自体は **削除しない** (PR 6 で削除)。本 PR では `bodyEmphasis` / `caption` / `colors` の **import 削除** のみ

非ゴール:

- `QrReader` / `ConfigConverter` / `JanCode` / `QrCode` / `UlidGenerator` (PR 5)、`flip + cleanup` (PR 6)
- `applyProductionCsp` E2E gate 追加 (#234 / #262 残部分は PR 5 で対応、本 PR 対象 3 ツールは setProperty 未使用のため CSP gate 必須性低)
- `_headers` の `style-src 'unsafe-inline'` 撤去 (PR 6)
- `docs/decisions.md` 新規エントリ (PR 6 [067] で B 案完了として一括記録)
- ハードコード hex の token 化 (本 PR 新規 hex なし、`hover:bg-blue-50` は既存 `--color-blue-50` token を Tailwind auto-utility 経由で参照)

---

## なぜ独立 PR か

| 観点                    | 説明                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR サイズ規律**       | 3 ファイル合計 53 件の inline style + 9 件の CSSOM hover refactor + 新規 class 追加。PR 5 と bundle すると review unit が 90 件超に肥大化 (memory `feedback_pr_size.md`)。 |
| **VRT 影響面の独立性**  | gs1-databar.astro / encoding-converter.astro / dummy-text.astro は独立 page で baseline に乗る。PR 5 (QrReader 等) と差分原因を切り分けやすい。                            |
| **新 class の責務範囲** | 本 PR 新規追加は `.summary-no-marker` の 1 件のみ。Gs1Databar `<details>` 固有命名で他 tool との衝突なし。                                                                 |
| **race 回避運用の検証** | PR 3 で並列 dispatch 時 commit 結合 race が発生。本 PR は subagent 非 commit 方式を初採用、運用検証も兼ねる (§9.4)。                                                       |

memory 参照:

- `project_b_plan_progress.md` (pointer; SoT は repo `docs/projects/issue-176-b-plan-progress.md`)
- `feedback_pr_size.md`
- `feedback_subagent_verification_trust.md`
- `feedback_commander_checklist.md`
- `feedback_e2e_before_pr.md`
- `feedback_subagent_model.md`

---

## 採用する設計 (ファイル別)

### 1. `Gs1Databar.tsx` (20 件 + 9 件 hover refactor)

#### 1.1 カード wrapper / ヘッダー (line 184-218)

```tsx
// Before
<div className="rounded-lg" style={{ border: `1px solid ${colors.borderInput}`, background: colors.bg }}>
  <div className="flex items-center justify-between px-4 py-3 rounded-t-lg"
       style={{ background: colors.bgSubtle, borderBottom: `1px solid ${colors.border}` }}>
    <span style={{ ...caption, fontWeight: 700, color: colors.text }}>
      バーコード {index + 1}
      {gtinResult && (
        <span className="font-mono ml-2" style={{ ...caption, color: colors.muted, fontWeight: 400 }}>
          — {gtinResult.fullGtin}
        </span>
      )}
    </span>
    {canRemove && (
      <button type="button" onClick={onRemove}
              className="rounded px-2 py-1 transition-colors"
              style={{ ...caption, color: colors.error, background: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = colors.errorBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              aria-label={`バーコード ${index + 1} を削除`}>削除</button>
    )}
  </div>

// After
<div className="rounded-lg border border-input bg-default">
  <div className="flex items-center justify-between px-4 py-3 rounded-t-lg bg-subtle border-b border-default">
    <span className="caption font-bold text-default">
      バーコード {index + 1}
      {gtinResult && (
        <span className="font-mono ml-2 caption text-muted">— {gtinResult.fullGtin}</span>
      )}
    </span>
    {canRemove && (
      <button type="button" onClick={onRemove}
              className="rounded px-2 py-1 transition-colors caption text-error bg-transparent hover:bg-error-tint"
              aria-label={`バーコード ${index + 1} を削除`}>削除</button>
    )}
  </div>
```

`onMouseEnter`/`onMouseLeave` を **削除**。Tailwind `hover:bg-error-tint` で hover bg 表現 (`bg-error-tint` は PR 1 既存 class)。

#### 1.2 GTIN 計算結果ボックス (line 238-265)

```tsx
<div className="rounded-lg p-3 flex flex-wrap items-center gap-x-6 gap-y-2 border border-default bg-surface">
  <div className="flex items-center gap-2">
    <span className="caption text-muted">チェックディジット</span>
    <span className="body-emphasis text-primary">{gtinResult.checkDigit}</span>
  </div>
  <div className="flex items-center gap-2">
    <span className="caption text-muted">GTIN-14</span>
    <span className="font-mono body-emphasis text-default tracking-[0.1em]">
      {gtinResult.fullGtin}
    </span>
    <span className="hidden sm:inline-flex">
      <CopyButton text={gtinResult.fullGtin} label="コピー" />
    </span>
    <span className="sm:hidden inline-flex">
      <CopyButton text={gtinResult.fullGtin} compact />
    </span>
  </div>
</div>
```

`tracking-[0.1em]` は Tailwind 4 arbitrary value (CSP-safe、build 時に静的 CSS 生成)。

#### 1.3 AI フィールド label / 追加ボタン / エラー / 削除 ✕ ボタン (line 268-340)

```tsx
<div>
  <div className="mb-2 flex items-center justify-between">
    <span className="caption text-default font-semibold">合成シンボル（任意）</span>
    {canAddField && (
      <button
        type="button"
        onClick={addAiField}
        className="caption text-link-color hover:underline"
      >
        + フィールド追加
      </button>
    )}
  </div>
  <div className="space-y-3">
    {aiFields.map((field, i) => {
      // ...
      return (
        <div key={i} className="flex flex-col sm:flex-row gap-2 items-start">
          {/* Select / BareInput 部省略 */}
          {field.error && (
            <p role="alert" className="caption text-error mt-1">
              {field.error}
            </p>
          )}
          <button
            type="button"
            onClick={() => removeAiField(i)}
            className="rounded-lg p-2 transition-colors shrink-0 caption text-muted bg-transparent hover:bg-subtle mt-[2px]"
            aria-label="フィールドを削除"
          >
            ✕
          </button>
        </div>
      );
    })}
  </div>
</div>
```

#### 1.4 バーコードプレビュー / GS1 文字列 details (line 344-393)

```tsx
{
  /* バーコードプレビュー */
}
{
  svgContent && (
    <div
      className="rounded-lg flex flex-col items-center gap-4 p-5 border border-default bg-surface"
      role="status"
      aria-live="polite"
    >
      <div
        aria-label={`GS1 DataBar ${gtinResult?.fullGtin} のバーコード`}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
      <DownloadButtonGroup onDownloadSvg={downloadSvg} onDownloadPng={downloadPng} />
    </div>
  );
}

{
  /* GS1 文字列 details */
}
{
  gtinResult && (
    <details className="rounded-lg border border-default">
      <summary className="cursor-pointer px-4 py-3 rounded-lg transition-colors caption font-bold text-default bg-transparent hover:bg-subtle summary-no-marker">
        GS1文字列を見る
      </summary>
      <div className="px-4 pb-4 pt-2">
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded px-3 py-2 font-mono break-all caption bg-subtle text-default">
            {gs1String}
          </code>
          <CopyButton text={gs1String} label="コピー" />
        </div>
      </div>
    </details>
  );
}
```

`.summary-no-marker` (新規 class、§4 で定義):

```css
.summary-no-marker {
  list-style: none;
}
.summary-no-marker::-webkit-details-marker {
  display: none;
}
```

`onMouseEnter`/`onMouseLeave` 削除。`hover:bg-subtle` で表現。

#### 1.5 カード追加ボタン (line 484-500)

```tsx
<button
  type="button"
  onClick={addCard}
  className="rounded px-4 py-2 transition-colors caption font-bold border border-primary bg-transparent text-primary hover:bg-blue-50"
>
  + バーコードを追加
</button>
```

`bg-blue-50` は Tailwind auto-utility (`--color-blue-50` = `#eff6ff` = `colors.bgPrimary`)。`hover:bg-blue-50` で hover bg 表現。

#### 1.6 MAX 件数メッセージ (line 503)

```tsx
<span className="caption text-muted">最大 {MAX_CARDS} 件まで追加できます</span>
```

#### 1.7 import 整理

```ts
// Before
import { bodyEmphasis, caption, colors } from '@/utils/styles';
// After (削除)
```

---

### 2. `EncodingConverter.tsx` (20 件)

新規 class 不要。全箇所が既存 class + Tailwind 標準 utility でカバー。

#### 2.1 入力ラベル + dropzone label (line 240-329)

```tsx
{/* 入力方式 */}
<div className="flex items-center gap-3">
  <span className="caption text-muted">入力:</span>
  <ToggleGroup ... />
</div>

{/* ファイル入力 dropzone */}
{inputMethod === 'file' && (
  <div>
    <div className="caption text-default font-bold mb-3">ファイルを選択</div>
    <label className="flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer transition-colors caption border border-dashed border-default bg-subtle text-muted">
      <svg ... />
      <span>{fileName || 'クリックしてファイルを選択'}</span>
      <input ref={fileInputRef} type="file" className="sr-only" ... />
    </label>
    <p className="text-xs text-muted mt-1">
      対応形式: テキストファイル（.txt / .csv / .json / .xml / .yaml / .toml 等）・最大 10 MB
    </p>
    {fileBytes && (
      <div className="mt-2 rounded-lg px-3 py-2 font-mono caption text-muted bg-subtle border border-default break-all">
        <span className="text-default">{formatBytes(fileBytes.length)}</span>
        {'　'}
        {hexPreview(fileBytes)}
      </div>
    )}
  </div>
)}
```

`border-dashed` は Tailwind 標準。`break-all` は Tailwind 標準 (`word-break: break-all`)。

#### 2.2 判定結果カード (line 336-373)

```tsx
{
  detection && (
    <div
      data-testid="detection-result"
      className="rounded-lg px-4 py-3 space-y-1 border border-default bg-subtle"
    >
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span data-testid="detection-encoding" className="caption text-muted">
          文字コード:{' '}
          <strong className="text-default">{ENCODING_LABELS[detection.encoding]}</strong>
        </span>
        <span data-testid="detection-bom" className="caption text-muted">
          BOM: <strong className="text-default">{detection.hasBom ? 'あり' : 'なし'}</strong>
        </span>
        <span className="caption text-muted">
          サイズ: <strong className="text-default">{formatBytes(detection.byteLength)}</strong>
        </span>
      </div>
      {decodedPreview && (
        <div className="mt-2 font-mono rounded px-2 py-1.5 overflow-auto caption text-default bg-default border border-default max-h-24 whitespace-pre-wrap break-all">
          {decodedPreview}
        </div>
      )}
    </div>
  );
}
```

`max-h-24` = 6rem ✓、`whitespace-pre-wrap` / `break-all` は Tailwind 標準。

#### 2.3 変換設定 / 出力 (line 376-471)

```tsx
{mode === 'convert' && (
  <div className="space-y-3">
    <div>
      <label htmlFor="enc-source" className="caption text-muted mb-2 block">元の文字コード:</label>
      <Select id="enc-source" ... />
    </div>
    <div>
      <label htmlFor="enc-target" className="caption text-muted mb-2 block">変換後の文字コード:</label>
      <Select id="enc-target" ... />
    </div>
    {UTF16_ENCODINGS.has(targetEnc) ? (
      <div className="caption text-muted">改行コード: UTF-16 では改行コード正規化は適用されません</div>
    ) : (
      <div>
        <div className="caption text-muted mb-2">改行コード:</div>
        <ToggleGroup ... />
      </div>
    )}
    {bomActive && (
      <label className="flex items-center gap-2 cursor-pointer caption text-default">
        <input type="checkbox" checked={withBom} onChange={...} aria-label="BOM を付与する" />
        BOM を付与する
      </label>
    )}
  </div>
)}

{mode === 'convert' && outputBytes && (
  <div data-testid="output-hex-preview" className="caption text-muted mt-1">
    {formatBytes(outputBytes.length)}　先頭: {hexPreview(outputBytes, 16)}
  </div>
)}
```

#### 2.4 import 整理

```ts
// Before
import { caption, colors } from '@/utils/styles';
// After (削除 — EncodingConverter は bodyEmphasis を import していない、現状確認済)
```

---

### 3. `DummyText.tsx` (13 件)

新規 class 不要。

#### 3.1 文字種 / 文字数 / 改行 / 結果 表示 (line 96-217)

```tsx
return (
  <div className="space-y-6">
    {/* 文字種 */}
    <div>
      <p className="body-emphasis text-default mb-3">文字種</p>
      <ToggleGroup ... />
    </div>

    {/* 文字数 */}
    <div>
      <label htmlFor="dummy-length" className="body-emphasis text-default block mb-1">文字数</label>
      <input id="dummy-length" type="number" min={1} max={5000}
             value={lengthInput} onChange={...} onBlur={...} onKeyDown={...}
             className="rounded-lg px-3 py-2 caption w-32 border border-input outline-none bg-default text-default" />
      <p className="caption text-muted mt-1">1〜5000文字</p>
    </div>

    {/* 改行 */}
    <div>
      <p className="body-emphasis text-default mb-1">改行</p>
      <div className="flex items-center gap-3 flex-wrap">
        <ToggleGroup ... />
        {lineBreak && (
          <div className="flex items-center gap-2">
            <label htmlFor="chunk-size" className="caption text-muted">間隔</label>
            <input id="chunk-size" type="number" min={1} max={1000}
                   value={chunkInput} onChange={...} onBlur={...}
                   className="rounded-lg px-3 py-2 caption w-20 border border-input outline-none bg-default text-default" />
            <span className="caption text-muted">文字ごと（1〜1000）</span>
          </div>
        )}
      </div>
    </div>

    {/* 結果 */}
    {result && (
      <div className="rounded-lg border border-default overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-subtle border-b border-default">
          <span className="body-emphasis text-default">{result.length} 文字</span>
          <div className="flex items-center gap-2">
            <CopyButton text={result} label="コピー" />
            <ClearButton onClick={() => setResult('')} />
          </div>
        </div>
        <div className="px-4 py-4 bg-default">
          <p className="caption text-default leading-[1.8] break-all whitespace-pre-wrap m-0">
            {result}
          </p>
        </div>
      </div>
    )}
  </div>
);
```

`outline-none` の維持理由: global の `:where(input, ...):focus-visible { outline: var(--focus-ring); outline-offset: 2px }` rule が a11y 担保 (キーボード focus 時 focus ring 復活)。

`leading-[1.8]` arbitrary (`leading-7` = 1.75 だと厳密一致せず VRT diff リスク)。

`w-32` = 8rem / `w-20` = 5rem、`m-0` は Tailwind 標準。

#### 3.2 import 整理

```ts
// Before
import { bodyEmphasis, caption, colors } from '@/utils/styles';
// After (削除)
```

---

## 4. `src/styles/global.css` への追記 (PR 4 で **新規追加** する分のみ)

PR 1 / 1.5 / 2 / 3 で追加済の class はすべて再利用 (`.caption` / `.body-emphasis` / `.text-default` / `.text-muted` / `.bg-default` / `.bg-subtle` / `.bg-surface` / `.border-default` / `.border-input` / `.bg-error-tint` / `.bg-success-tint` / `.text-error` / `.text-error-text` / `.text-success` / `.text-primary` / `.text-link-color` 等)。本 PR 追加分:

```css
@layer components {
  /* === PR 4: Gs1Databar <details>/<summary> marker hide === */
  .summary-no-marker {
    list-style: none;
  }
  .summary-no-marker::-webkit-details-marker {
    display: none;
  }
}
```

**衝突確認**:

- `.summary-no-marker` は BEM 風命名で唯一性確保
- `::-webkit-details-marker` は WebKit/Blink、`list-style: none` は Firefox の marker を消すため、両方カバー
- 他 tool で `<details>` が再利用される場合は同 class を流用可

**Tailwind 4 arbitrary value の利用箇所** (build 時に静的 CSS、CSP-safe):

| utility            | 用途                            | 該当              |
| ------------------ | ------------------------------- | ----------------- |
| `tracking-[0.1em]` | GTIN-14 文字間隔                | Gs1Databar 1 箇所 |
| `mt-[2px]`         | AI フィールド削除ボタンの微調整 | Gs1Databar 1 箇所 |
| `leading-[1.8]`    | DummyText 結果テキスト行間      | DummyText 1 箇所  |

これらは Tailwind 4 標準機能。新 class 化のコスト>利益のため utility 利用に留める。

---

## 5. `inline-style-migration.test.ts` への追加

```ts
const MIGRATED_FILES: readonly string[] = [
  // PR 1 で追加済 (11 件、省略)
  // PR 1.5 で追加済 (2 件)
  // PR 2 で追加済 (3 件)
  // PR 3 で追加済 (2 件)
  // PR 4 で追加
  'src/components/tools/Gs1Databar.tsx',
  'src/components/tools/EncodingConverter.tsx',
  'src/components/tools/DummyText.tsx',
];
```

陽性対照テストブロックは PR 1 で導入済 → 変更不要。合計 21 ファイル。

---

## 6. consumer 変更範囲 (PR 4 で touch するファイル)

| File                                                 | 変更内容                                                                      | 備考                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------- |
| `src/components/tools/Gs1Databar.tsx`                | inline style 20 件除去 + `e.currentTarget.style.X = Y` 9 件除去 + import 整理 | MIGRATED_FILES 登録           |
| `src/components/tools/EncodingConverter.tsx`         | inline style 20 件除去 + import 整理                                          | MIGRATED_FILES 登録           |
| `src/components/tools/DummyText.tsx`                 | inline style 13 件除去 + import 整理                                          | MIGRATED_FILES 登録           |
| `src/styles/global.css`                              | `@layer components` に `.summary-no-marker` 1 件追加                          | PR 1/1.5/2/3 既存ブロック末尾 |
| `src/utils/__tests__/inline-style-migration.test.ts` | `MIGRATED_FILES` array に 3 件追加 (合計 21 件)                               | -                             |
| `docs/projects/issue-176-b-plan-progress.md`         | PR 4 の状態を current 化 (PR 3 経験を踏まえ merge 待ち間 SoT 反映)            | 進捗 + follow-up table 更新   |

**触らない**:

- `src/components/tools/__tests__/*.test.ts` (logic test、本 PR の class 化は DOM 構造を変えない)
- `src/utils/styles.ts` (PR 6 で削除、本 PR は import 削除のみ)
- `src/utils/csp.ts` / `public/_headers` (PR 6 でstrict 化)
- `tests/e2e/*.spec.ts` (本 PR で applyProductionCsp gate 追加せず、#234 は PR 5 / 6 で対応)

---

## 7. 検証戦略

### 7.1 ローカル必須ゲート (push 前、親 Opus 直接実行)

| 順  | コマンド           | 目的                                                                    |
| --- | ------------------ | ----------------------------------------------------------------------- |
| 1   | `npm run test`     | unit + migration test (18 → 21、6 spec 追加 = 3 ファイル × 2 件 / file) |
| 2   | `npx astro check`  | TypeScript 型チェック                                                   |
| 3   | `npm run test:e2e` | gs1-databar / encoding-converter / dummy-text の既存 E2E 全 pass        |

memory `feedback_subagent_verification_trust.md`: 親 Opus 直接実行 (subagent の "pass" 報告は信頼しない)。

### 7.2 CI

| workflow                | 内容                               | required?       |
| ----------------------- | ---------------------------------- | --------------- |
| `test.yml`              | vitest + e2e                       | ✅ required     |
| `visual-regression.yml` | `npm run test:vrt` (baseline 比較) | ❌ non-required |

memory `feedback_vrt_ci_only.md`: ローカル `npm run test:vrt` は走らせない。

### 7.3 a11y 退化検知 (memory `feedback_commander_checklist.md`)

PR 作成前に親が下記実行:

```bash
git diff origin/develop -- src/components/tools/Gs1Databar.tsx src/components/tools/EncodingConverter.tsx src/components/tools/DummyText.tsx \
  | grep -E '^-.*(aria-|role=|data-testid=|htmlFor=)' | grep -vE '^---|^\+\+\+'
# 出力 0 行 = OK (reformatted で行移動した削除行が出る場合は現コードで存在を grep 確認、PR 3 と同運用)
```

特に注意:

- Gs1Databar の各 button の `aria-label` 維持 (削除/追加/AI削除)
- Gs1Databar `<details>/<summary>` の `<details>` semantic 維持 (browser default 構造を class 化で壊さない)
- Gs1Databar `data-testid="gs1-databar-tool"` 等の維持
- EncodingConverter の `data-testid` 維持 (`detection-result` / `detection-encoding` / `detection-bom` / `output-hex-preview`)
- DummyText の `htmlFor` / `<label>` 構造維持
- `<button type="button">` 属性維持 (PR 1 follow-up #258/#269 で追加済)

### 7.4 VRT 差分の判断フロー (PR 1 / 1.5 / 2 / 3 と同じ)

PR comment に diff があった場合:

- 意図しない regression (button hover 色違い / dashed border 太さ違い等) → class 定義 / consumer className 修正
- ピクセル未満の anti-alias 差 → mask か threshold 緩和 (事前合意必要)
- 意図的変化 → PR ブランチで `update-visual-baseline.yml` を `workflow_dispatch` trigger → bot が新 baseline を commit back

---

## 8. バッチ計画における本 PR の位置付け

repo SoT [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md) のテーブル参照。

| #        | スコープ                                                                                                       | 状態           |
| -------- | -------------------------------------------------------------------------------------------------------------- | -------------- |
| PR 0     | VRT 導入                                                                                                       | ✅ #254 merged |
| PR 1     | 基礎工事 + ui/\* simple 11                                                                                     | ✅ #256 merged |
| PR 1.5   | ui/\* complex (ResultTable + InputField)                                                                       | ✅ #261 merged |
| PR 2     | qr-ticket/\*                                                                                                   | ✅ #272 merged |
| PR 3     | JwtDecoder + UuidV7Generator + #262 partial                                                                    | ✅ #275 merged |
| **PR 4** | **Gs1Databar + EncodingConverter + DummyText (本 PR)**                                                         | **本 PR**      |
| PR 5     | QrReader + ConfigConverter + JanCode + QrCode + UlidGenerator + 残り tools + #262 close + #276 (前段 infra PR) | 未着手         |
| PR 6     | flip + cleanup                                                                                                 | 未着手         |

PR は **直列** (前 PR がマージされてから次 PR 着手)。

---

## 9. ブランチ命名 / コミット粒度 / 並列 subagent 分担 + race 回避運用

### 9.1 ブランチ命名

- `feature/issue-176-b4-gs1-encoding-dummy`
- worktree: `git worktree add .claude/worktrees/issue-176-b4 origin/develop -b feature/issue-176-b4-gs1-encoding-dummy` (memory `feedback_worktree_base_branch.md` / `feedback_worktree_location.md`)

### 9.2 コミット粒度

```
1. (Phase 0) chore(spec): #176 B 案 PR 4 spec / plan / global.css foundation (.summary-no-marker)
2. (Phase 1.5) refactor(tools): #176 B 案 PR 4 — Gs1Databar.tsx inline style 撤去 + hover を CSS に移行
3. (Phase 1.5) refactor(tools): #176 B 案 PR 4 — EncodingConverter.tsx inline style 撤去
4. (Phase 1.5) refactor(tools): #176 B 案 PR 4 — DummyText.tsx inline style 撤去
5. (Phase 2) test(migration): MIGRATED_FILES に PR 4 対象 3 件追加
6. (Phase 2) docs(progress): PR 4 (#XXX) の状態を反映
```

### 9.3 並列 subagent 分担 (sonnet × 3 Track)

memory `feedback_subagent_model.md` に従い `model: "sonnet"` 明示:

| Track | 担当ファイル            | inline style 件数 + 特殊事項        |
| ----- | ----------------------- | ----------------------------------- |
| **A** | `Gs1Databar.tsx`        | 20 件 + 9 件 hover refactor (CSSOM) |
| **B** | `EncodingConverter.tsx` | 20 件                               |
| **C** | `DummyText.tsx`         | 13 件                               |

### 9.4 **Phase 1 race 回避運用 (PR 3 反省)**

PR 3 で並列 dispatch 時に commit が結合される race が発生 (Track A の prettier hook が Track B のファイルを巻き込み、commit message と内容が不一致になった事案)。本 PR では下記方針で **race 自体を防ぐ**:

#### 採用方針: subagent は commit せず、親が Phase 1.5 で順次 commit

各 subagent への明示指示:

```
- ファイル編集 + self-verification (vitest, astro check) のみ実施
- git add / git commit は実行しない (親が後段で実施)
- 完了報告: 「変更ファイル list (git diff --name-only) + self-verification 結果」のみ
```

親 Opus が Phase 1 完了後、Phase 1.5 で:

1. Track A の変更を確認 → `git add src/components/tools/Gs1Databar.tsx` → `git commit -m "..."`
2. Track B の変更を確認 → `git add src/components/tools/EncodingConverter.tsx` → `git commit -m "..."`
3. Track C の変更を確認 → `git add src/components/tools/DummyText.tsx` → `git commit -m "..."`

#### 利点

- subagent 間の commit race 完全消去
- prettier hook の巻き込み reformat も親が制御 (1 commit に閉じる、他 Track ファイルが入らない)
- 各 commit のメッセージと内容が完全一致
- subagent の self-verification (vitest / astro check) は維持

### 9.5 PR ベース

`gh pr create --base develop` で必ず明示 (memory `feedback_branch_workflow.md` / `feedback_pr_language.md` / `CLAUDE.md` 最重要ルール)。タイトル例:

> `refactor(tools): #176 B 案 PR 4 — Gs1Databar + EncodingConverter + DummyText inline style 撤去`

PR 本文は `--body-file /tmp/claude/pr_body_b4.md` 経由 (memory `feedback_heredoc_no_escape.md`)。

---

## 10. リスクと緩和

| ID  | リスク                                                                      | 緩和                                                                                                                                 |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | `tracking-[0.1em]` / `leading-[1.8]` arbitrary が Tailwind 4 で生成されない | Tailwind 4 標準機能、`config-converter` 等で実績あり。astro check で型 break しないか確認、E2E で実描画確認                          |
| R2  | `outline-none` が a11y 退化を起こす                                         | global の `:focus-visible { outline: var(--focus-ring); outline-offset: 2px }` rule で focus ring 復活。E2E で keyboard focus 確認可 |
| R3  | `.summary-no-marker` が Firefox で marker 残存                              | `list-style: none` が Firefox の marker を消す。`::-webkit-details-marker` は Chromium 用 fallback。両対応                           |
| R4  | `hover:bg-blue-50` が Tailwind auto-utility として未生成                    | `--color-blue-50` は global.css line 22 で `@theme` 内定義済、Tailwind 4 が自動 utility 生成。astro check で型 break しないか確認    |
| R5  | カードヘッダー `caption font-bold` の優先度問題                             | Tailwind utility (`@layer utilities`) は components より後に解決。`font-bold` (700) が caption の fontWeight 400 を override         |
| R6  | Phase 1 で subagent が指示違反して commit してしまう                        | 親が Phase 1.5 で `git status` / `git log --oneline -1` を確認して回復可能。最悪 reset --soft で再 commit (PR 3 の経験)              |
| R7  | `<summary>` の hover bg が summary タグ全体に効いて子要素も影響             | `<summary>` の背景は通常 expand/collapse トリガ全体に効くのが期待挙動。原 inline style と挙動同等                                    |
| R8  | EncodingConverter の dropzone `border-dashed` が Tailwind 標準で生成不可    | Tailwind 4 標準、`border-style: dashed` 生成。astro check で型 break しないか確認                                                    |

---

## 11. 議論ポイント (spec 確定前 user 判断、本 spec に既に user 承認済)

### D1. `<summary>` marker 非表示の方法

- **採用**: 新 class `.summary-no-marker` (`list-style: none` + `::-webkit-details-marker { display: none }`)
- **代替**: Tailwind arbitrary `[&::-webkit-details-marker]:hidden marker:hidden` 利用
- **判断**: 採用案 (user 承認済 2026-05-07、PR 2/3 reviewer が named class を好む傾向、可読性向上)

### D2. `tracking-[0.1em]` / `leading-[1.8]` の arbitrary value 利用

- **採用**: Tailwind 4 arbitrary value をそのまま利用 (`.gtin-14-display` / `.dummy-result-text` 等の class 化はしない)
- **代替**: 専用 class を新設
- **判断**: 採用案 (user 承認済 2026-05-07、1 箇所のみの利用、class 増やすコスト>利益)

### D3. Phase 1 race 回避運用 (subagent commit せず、親が一括 commit)

- **採用**: 上記 §9.4 の手法 (PR 3 の race 反省)
- **代替**: PR 3 同様 subagent commit + 親が事後 reset --soft で split
- **判断**: 採用案 (user 承認済 2026-05-07、race 自体を防ぐ方が確実)

### D4. `<input type="number">` の outline-none 維持

- **採用**: `outline-none` を維持 (global の `:focus-visible` rule が a11y 担保)
- **代替**: `outline-none` を撤去 (browser default outline 復活)
- **判断**: 採用案 (user 承認済 2026-05-07、元 inline style と挙動同等、global rule で a11y 担保)

### D5. カード追加ボタンの `hover:bg-blue-50` 利用

- **採用**: Tailwind auto-utility `bg-blue-50` (`--color-blue-50` 経由) を hover に適用
- **代替**: 新 class `.btn-card-add` 作成 + その中で `:hover` 定義
- **判断**: 採用案 (user 承認済 2026-05-07、utility 1 件で完結、新 class 不要)

---

## 関連

- 起源 issue: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B
- 前提 PR: [#249](https://github.com/fumtas1k/devtools/pull/249) (A-1) / [#252](https://github.com/fumtas1k/devtools/pull/252) (meta-csp) / [#254](https://github.com/fumtas1k/devtools/pull/254) (VRT) / [#256](https://github.com/fumtas1k/devtools/pull/256) (PR 1) / [#261](https://github.com/fumtas1k/devtools/pull/261) (PR 1.5) / [#272](https://github.com/fumtas1k/devtools/pull/272) (PR 2) / [#275](https://github.com/fumtas1k/devtools/pull/275) (PR 3)
- 過去 decisions: [054]（CSP 初導入）/ [064]（A-1 採用）/ [066]（VRT 採用）
- repo SoT: [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md)
- memory: `feedback_pr_size.md` / `feedback_subagent_model.md` / `feedback_subagent_verification_trust.md` / `feedback_commander_checklist.md` / `feedback_vrt_ci_only.md` / `feedback_e2e_before_pr.md` / `feedback_branch_workflow.md` / `feedback_pr_language.md` / `feedback_heredoc_no_escape.md` / `feedback_worktree_base_branch.md` / `feedback_worktree_location.md` / `feedback_worktree_merge_order.md`
- PR 1 spec: `docs/superpowers/specs/2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md`
- PR 1.5 spec: `docs/superpowers/specs/2026-05-04-issue-176-b1-5-ui-complex-design.md`
- PR 2 spec: `docs/superpowers/specs/2026-05-04-issue-176-b2-qr-ticket-design.md`
- PR 3 spec: `docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md`
