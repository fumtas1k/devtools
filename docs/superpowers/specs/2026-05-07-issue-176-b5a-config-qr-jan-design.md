# #176 B 案 PR 5a: `ConfigConverter` + `QrReader` + `JanCode` inline style 撤去 設計書

**作成日**: 2026-05-07
**Issue**: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B / PR 5a
**前提**: A-1 ([#249](https://github.com/fumtas1k/devtools/pull/249)) + VRT 基盤 ([#254](https://github.com/fumtas1k/devtools/pull/254)) + PR 1 ([#256](https://github.com/fumtas1k/devtools/pull/256)) + PR 1.5 ([#261](https://github.com/fumtas1k/devtools/pull/261)) + PR 2 ([#272](https://github.com/fumtas1k/devtools/pull/272)) + PR 3 ([#275](https://github.com/fumtas1k/devtools/pull/275)) + PR 4 ([#277](https://github.com/fumtas1k/devtools/pull/277)) + 前段 infra ([#278](https://github.com/fumtas1k/devtools/pull/278)) 完了済み
**参照**: バッチ計画全体は repo SoT [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md)。PR 1 / 1.5 / 2 / 3 / 4 spec の命名規約・既存 `@layer components` 定義を継承。

---

## ゴール

`src/components/tools/ConfigConverter.tsx` (11 件) + `src/components/tools/QrReader.tsx` (11 件) + `src/components/tools/JanCode.tsx` (9 件) から JSX inline style を完全撤去 + JanCode 内の `e.currentTarget.style.X = Y` 形式の CSSOM 直接 mutation 2 件 (`<summary>` の `onMouseEnter`/`onMouseLeave` hover state) を撤去し、`@layer components` の意味クラス + Tailwind utility に置換する。

完了基準:

1. 対象 3 ファイルから `style={{` ヒット数 0、`element.style.X = Y` 形式の inline mutation 0
2. `src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array に 3 件追加 (合計 24 件) して migration test pass
3. `src/styles/global.css` の `@layer components` に **新規 1 class のみ** 追加 (`.qr-video-preview`、§4 参照)。JanCode `<summary>` hover は **PR 4 既存の `.hover-bg-subtle` を再利用** (新規不要)
4. **Phase 1 race 回避運用**: subagent は **commit せず** ファイル編集 + self-verification (vitest, astro check) のみ実施、親 Opus が Phase 1.5 で順次 commit (PR 4 の運用継承、§9.4 参照)
5. **VRT 検証**: `visual-regression.yml` で baseline 比較。意図的差分があれば PR ブランチ上で `update-visual-baseline.yml` を `workflow_dispatch` trigger
6. ローカル必須ゲート: push 前に `npm run test` (vitest) / `npx astro check` / `npm run test:e2e` 全 green (親 Opus 直接実行)
7. `src/utils/styles.ts` 自体は **削除しない** (PR 6 で削除)。本 PR では `bodyEmphasis` / `caption` / `colors` の **import 削除** のみ

非ゴール:

- `Base64Codec` / `JsonCsv` / `JsonXml` / `QrCode` / `UlidGenerator` / `QrTicket (root)` / `UrlEncoder` (PR 5b)、`flip + cleanup` (PR 6)
- `applyProductionCsp` E2E gate 追加 (#262 残部分 = ulid-generator は PR 5b で対応、本 PR 対象 3 ツールは setProperty 未使用のため CSP gate 必須性低)
- `_headers` の `style-src 'unsafe-inline'` 撤去 (PR 6)
- `docs/decisions.md` 新規エントリ (PR 6 [067] で B 案完了として一括記録)
- `withProductionCsp` ラッパ自体の meta-test ([#281](https://github.com/fumtas1k/devtools/issues/281)、PR 5b 着手前に再確認、本 PR 5a スコープ外)
- QrReader の camera API (`getUserMedia()`) 利用に伴う CSP `media-src` directive 追加要否判断 (PR 6 で実機確認、本 PR 5a は flag のみ)

---

## なぜ独立 PR (5a / 5b 分割) か

| 観点                       | 説明                                                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR サイズ規律**          | PR 5 全体は 9 ツール / 44 inline style + 2 CSSOM。PR 4 と同等規模で bundle すると review unit が 75 件超に肥大化 (memory `feedback_pr_size.md`)。5a (大物 3 つ) と 5b (残り + #262 close + ulid E2E) に分割 |
| **VRT 影響面の独立性**     | config-converter.astro / qr-reader.astro / jan-code.astro は独立 page で baseline に乗る。5b (Base64/JsonCsv/QrCode/UlidGenerator) と差分原因を切り分けやすい                                               |
| **新 class の責務範囲**    | 本 PR 新規追加は `.qr-video-preview` の 1 件のみ。QrReader の `<video>` 専用命名で他 tool との衝突なし                                                                                                      |
| **CSSOM hover refactor**   | JanCode の 2 件 hover mutation は PR 4 Gs1Databar 9 件で確立した pattern (`.hover-bg-subtle`) を流用。5a で完結させる                                                                                       |
| **race 回避運用の安定化**  | PR 4 で初採用した「subagent 非 commit + 親で順次 commit」方式を 2 回目運用。本 PR でも採用                                                                                                                  |
| **5a 採用基準**            | inline style ≥ 7 OR CSSOM hover あり = 大物中物 (SoT 分割設計メモ参照)。3 ツール並列 sonnet 構成は PR 4 実績がある                                                                                          |
| **QrReader camera 隔離性** | QrReader は `getUserMedia` / `<video>` / `<canvas>` 等の特殊要素を含み、他 tool より影響が読みづらい。5a で先に検証することで PR 6 (`media-src` 検討) の前提情報を確保                                      |

memory 参照:

- `project_b_plan_progress.md` (pointer; SoT は repo `docs/projects/issue-176-b-plan-progress.md`)
- `feedback_pr_size.md`
- `feedback_subagent_verification_trust.md`
- `feedback_subagent_model.md`
- `feedback_commander_checklist.md`
- `feedback_e2e_before_pr.md`
- `feedback_tailwind_v4_layer_variant.md` (PR 4 review 由来、`hover:` variant が `@layer components` の手書き class に効かない件)

---

## 採用する設計 (ファイル別)

### 1. `ConfigConverter.tsx` (11 件)

新規 class 不要。全箇所が既存 `@layer components` class + Tailwind 標準 utility + Tailwind auto-utility (`@theme` 由来) でカバー。

#### 1.1 変換元 / 変換先ラベル (line 138-158)

```tsx
// Before
<span style={{ ...caption, color: colors.muted, minWidth: '2.5rem' }}>変換元</span>
<span style={{ ...caption, color: colors.muted, minWidth: '2.5rem' }}>変換先</span>

// After
<span className="caption text-muted min-w-10">変換元</span>
<span className="caption text-muted min-w-10">変換先</span>
```

`min-w-10` = 2.5rem ✓ (Tailwind 4 標準: `0.25rem * 10`)。

#### 1.2 InputField/OutputField wrapper alignItems (line 160)

```tsx
// Before
<div className="flex flex-col md:flex-row gap-4" style={{ alignItems: 'flex-start' }}>

// After
<div className="flex flex-col md:flex-row gap-4 items-start">
```

#### 1.3 警告メッセージカード (line 195-206)

```tsx
// Before
<div
  className="rounded-lg p-3"
  style={{ background: colors.warningBg, border: `1px solid ${colors.warning}` }}
>
  <ul style={{ ...caption, color: colors.text, margin: 0, paddingLeft: '1.25rem' }}>
    {warnings.map((w, i) => <li key={i}>{w}</li>)}
  </ul>
</div>

// After
<div className="rounded-lg p-3 border border-warning bg-warning-tint">
  <ul className="caption text-default m-0 pl-5">
    {warnings.map((w, i) => <li key={i}>{w}</li>)}
  </ul>
</div>
```

`border-warning` は Tailwind auto-utility (`--color-warning` が `@theme` 内定義のため自動生成)。`bg-warning-tint` は PR 3 既存 (`global.css` line 474-476)。`pl-5` = 1.25rem ✓。

#### 1.4 schema toggle ボタン + arrow (line 208-235)

```tsx
// Before
<button
  ...
  className="flex items-center gap-1"
  style={{ ...caption, color: colors.link, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
>
  <span aria-hidden="true" style={{
    display: 'inline-block',
    transform: schemaOpen ? 'rotate(90deg)' : 'none',
    transition: 'transform 0.2s',
  }}>▶</span>
  JSON Schema で検証する
</button>

// After
<button
  type="button"
  onClick={() => setSchemaOpen((o) => !o)}
  aria-expanded={schemaOpen}
  aria-controls="config-converter-schema-panel"
  className="flex items-center gap-1 caption text-link-color btn-link-plain"
>
  <span
    aria-hidden="true"
    className={`inline-block transition-transform duration-200 ${schemaOpen ? 'rotate-90' : ''}`}
  >
    ▶
  </span>
  JSON Schema で検証する
</button>
```

- `text-link-color` は PR 1 既存 (`global.css`)
- `.btn-link-plain` (PR 1.5 既存): `background: transparent; border: 0; padding: 0; cursor: pointer` — まさに今欲しい組み合わせ
- `rotate-90` / `transition-transform duration-200` は Tailwind 標準

#### 1.5 Cmd/Ctrl+Enter kbd (line 267-272)

```tsx
// Before
<kbd style={{ ...caption, color: colors.muted, fontFamily: 'monospace' }} aria-hidden="true">
  Cmd/Ctrl+Enter
</kbd>

// After
<kbd className="caption text-muted font-mono" aria-hidden="true">
  Cmd/Ctrl+Enter
</kbd>
```

`font-mono` は Tailwind 標準 (`global.css` の `--font-mono` を参照)。

#### 1.6 検証結果カード (line 274-304)

```tsx
// Before
<div
  className="rounded-lg p-3"
  role={validationResult.valid ? 'status' : 'alert'}
  aria-live={validationResult.valid ? 'polite' : 'assertive'}
  style={{
    background: validationResult.valid ? colors.successBg : colors.errorBg,
    border: `1px solid ${validationResult.valid ? colors.success : colors.error}`,
  }}
>
  {validationResult.valid ? (
    <p style={{ ...caption, color: colors.text }}>...</p>
  ) : (
    <ul style={{ ...caption, color: colors.errorText, margin: 0, paddingLeft: '1.25rem' }}>...</ul>
  )}
</div>

// After
<div
  className={`rounded-lg p-3 border ${validationResult.valid ? 'alert-success' : 'alert-error'}`}
  role={validationResult.valid ? 'status' : 'alert'}
  aria-live={validationResult.valid ? 'polite' : 'assertive'}
>
  {validationResult.valid ? (
    <p className="caption text-default">...</p>
  ) : (
    <ul className="caption text-error-text m-0 pl-5">...</ul>
  )}
</div>
```

`.alert-success` / `.alert-error` は PR 2 既存 (`global.css` line 388-395)。`border` (= `1px solid currentColor` Tailwind 標準) + `border-color` (alert-\* で上書き) の組合せ。

#### 1.7 import 整理

```ts
// Before
import { caption, colors } from '@/utils/styles';
// After (削除)
```

---

### 2. `QrReader.tsx` (11 件)

新規 class 1 件 (`.qr-video-preview`)。他は既存 class + Tailwind utility でカバー。

#### 2.1 module-level スタイル定数の解体 (line 17-70)

```tsx
// Before (削除)
const rescanButtonStyle: React.CSSProperties = { ... };
const startCameraButtonStyle = { ... };
const stopCameraButtonStyle = { ... };
const uploadLabelStyle = (enabled: boolean): React.CSSProperties => ({ ... });
```

すべて consumer 側に className 化して inline。module-level 定数は全削除する。

#### 2.2 startCamera ボタン (line 177)

`startCameraButtonStyle` 解体:

```tsx
// Before
<button type="button" onClick={camera.startCamera} style={startCameraButtonStyle}>
  カメラを起動
</button>

// After
<button
  type="button"
  onClick={camera.startCamera}
  className="caption font-semibold inline-flex items-center px-5 py-2 rounded-lg bg-primary text-on-primary border-0 cursor-pointer"
>
  カメラを起動
</button>
```

- `bg-primary` は Tailwind auto-utility (`--color-primary` @theme 由来)
- `.text-on-primary` は PR 1 既存 (`--color-text-on-primary` :root 由来、auto-utility 不在)
- `border-0` は Tailwind 標準
- `cursor-pointer` は global rule (`:where(button, ...) { cursor: pointer }`) で自動適用されるが、明示でも害なし。consistency のため記述

#### 2.3 video preview (line 182-194) — **新規 class 利用**

```tsx
// Before
<video
  ref={camera.videoRef}
  playsInline
  muted
  style={{
    width: '100%',
    maxWidth: '400px',
    borderRadius: '0.5rem',
    display: camera.cameraActive ? 'block' : 'none',
    background: '#000',
  }}
  aria-label="カメラプレビュー"
/>

// After
<video
  ref={camera.videoRef}
  playsInline
  muted
  className={`w-full max-w-[400px] rounded-lg qr-video-preview ${camera.cameraActive ? '' : 'hidden'}`}
  aria-label="カメラプレビュー"
/>
```

- `max-w-[400px]` は Tailwind 4 arbitrary value (CSP-safe、build 時静的 CSS)
- `hidden` は Tailwind 標準 (`display: none`)
- `.qr-video-preview` は本 PR 新規追加 (§4 参照)、`background: #000` を保持

#### 2.4 stopCamera ボタン (line 196)

```tsx
// Before
<button type="button" onClick={stopCamera} style={stopCameraButtonStyle}>
  カメラを停止
</button>

// After
<button
  type="button"
  onClick={stopCamera}
  className="caption font-semibold inline-flex items-center px-5 py-2 rounded-lg border border-error bg-error-tint text-error cursor-pointer"
>
  カメラを停止
</button>
```

- `border-error` は Tailwind auto-utility (`--color-error` @theme 由来)
- `.bg-error-tint` は PR 1 既存 (`--color-error-bg` の semantic alias)
- `.text-error` は PR 2 既存

#### 2.5 canvas (line 200)

```tsx
// Before
<canvas ref={camera.canvasRef} style={{ display: 'none' }} aria-hidden="true" />

// After
<canvas ref={camera.canvasRef} className="hidden" aria-hidden="true" />
```

#### 2.6 image upload 説明文 (line 204)

```tsx
// Before
<p style={{ ...caption, color: colors.muted }}>
  QRコードが写った画像（PNG・JPG 等）をアップロードしてください
</p>

// After
<p className="caption text-muted">
  QRコードが写った画像（PNG・JPG 等）をアップロードしてください
</p>
```

#### 2.7 visible-hidden file input + label (line 208-226)

```tsx
// Before
<input
  id="qr-image-input"
  type="file"
  accept="image/*"
  onChange={handleImageUpload}
  style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
/>
<label htmlFor="qr-image-input" style={uploadLabelStyle(true)}>
  画像を選択
</label>
<p style={{ fontSize: '0.75rem', color: colors.muted, marginTop: '0.25rem' }}>
  対応形式: PNG / JPEG / WebP / GIF / SVG・最大 15 MB
</p>

// After
<input
  id="qr-image-input"
  type="file"
  accept="image/*"
  onChange={handleImageUpload}
  className="sr-only"
/>
<label
  htmlFor="qr-image-input"
  className="caption font-semibold inline-block px-4 py-2 rounded-lg border border-input bg-subtle text-default cursor-pointer"
>
  画像を選択
</label>
<p className="text-xs text-muted mt-1">
  対応形式: PNG / JPEG / WebP / GIF / SVG・最大 15 MB
</p>
```

- `.sr-only` は Tailwind 標準 (アクセス可能な visually-hidden)。元 inline style (`position: absolute; width: 1; height: 1; opacity: 0; pointerEvents: none`) と完全等価ではないが、a11y 担保 (label `htmlFor` 経由のクリック / Tab focus) は同等以上 (sr-only は `clip: rect(0,0,0,0)` も含む)
- 元の `uploadLabelStyle(true)` 引数 `enabled: true` 固定で常時呼び出されている (第 2 引数なし) ため、`enabled === true` 分岐のみ展開して disabled state は **削除** (デッドコード扱い、現コードで使われていない)

`uploadLabelStyle(false)` の呼び出し有無確認は §6 で grep 命令を明記。

#### 2.8 読取結果テキスト表示 (line 240-256)

```tsx
// Before
<div className="rounded-lg p-3" style={{ background: colors.bgSubtle, border: `1px solid ${colors.border}` }}>
  <pre style={{
    ...caption,
    color: colors.text,
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    fontFamily: 'monospace',
  }}>
    {content.raw}
  </pre>
</div>

// After
<div className="rounded-lg p-3 border border-default bg-subtle">
  <pre className="caption text-default m-0 whitespace-pre-wrap break-all font-mono">
    {content.raw}
  </pre>
</div>
```

#### 2.9 再スキャンボタン (line 261)

`rescanButtonStyle` 解体:

```tsx
// Before
<button type="button" onClick={handleRescan} style={rescanButtonStyle}>
  再スキャン
</button>

// After
<button
  type="button"
  onClick={handleRescan}
  className="caption font-bold leading-none inline-flex items-center gap-1.5 px-3 py-2 rounded border border-default bg-subtle text-default cursor-pointer whitespace-nowrap"
>
  再スキャン
</button>
```

- `leading-none` は Tailwind 標準 (`line-height: 1`)
- `gap-1.5` = 0.375rem ✓
- `px-3` = 0.75rem ✓ / `py-2` = 0.5rem ✓
- `rounded` = 0.25rem ✓

#### 2.10 URL 警告カード (line 267-298)

```tsx
// Before
<div
  className="rounded-lg p-4 space-y-2"
  style={{ background: colors.warningBg, border: `1px solid ${colors.warning}` }}
>
  <p style={{ ...caption, color: colors.text }}>
    <strong style={{ color: colors.text }}>{content.hostname}</strong>{' '}
    への外部リンクが含まれています。URLをよく確認してから開いてください。
  </p>
  <a
    href={content.raw}
    target="_blank"
    rel="noopener noreferrer"
    style={{
      ...caption,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.375rem 0.875rem',
      borderRadius: '0.375rem',
      border: `1px solid ${colors.warning}`,
      background: colors.bg,
      color: colors.text,
      textDecoration: 'none',
    }}
  >
    URLを開く
  </a>
</div>

// After
<div className="rounded-lg p-4 space-y-2 border border-warning bg-warning-tint">
  <p className="caption text-default">
    <strong className="text-default">{content.hostname}</strong>{' '}
    への外部リンクが含まれています。URLをよく確認してから開いてください。
  </p>
  <a
    href={content.raw}
    target="_blank"
    rel="noopener noreferrer"
    className="caption font-semibold inline-flex items-center px-3.5 py-1.5 rounded-md border border-warning bg-default text-default no-underline"
  >
    URLを開く
  </a>
</div>
```

- `px-3.5` = 0.875rem ✓ / `py-1.5` = 0.375rem ✓ / `rounded-md` = 0.375rem ✓
- `no-underline` は Tailwind 標準
- `border-warning` (auto-utility) は §1.3 と同じ

#### 2.11 import 整理

```ts
// Before
import { caption, colors } from '@/utils/styles';
// After (削除)
```

`React` named import (`React.CSSProperties` / `React.ChangeEvent`) は **保持** (line 1)。`React.ChangeEvent<HTMLInputElement>` の参照が `handleImageUpload` 引数に残るため。

---

### 3. `JanCode.tsx` (9 件 + 2 件 hover refactor)

新規 class 不要。`<summary>` の hover bg は **PR 4 既存の `.hover-bg-subtle`** を再利用。

#### 3.1 結果カード wrapper (line 100-104)

```tsx
// Before
<div
  data-testid="jan-code-result"
  className="rounded-lg p-4 space-y-3"
  style={{ border: `1px solid ${colors.border}`, background: colors.bgSurface }}
>

// After
<div
  data-testid="jan-code-result"
  className="rounded-lg p-4 space-y-3 border border-default bg-surface"
>
```

#### 3.2 チェックディジット行 (line 106-107)

```tsx
// Before
<span style={{ ...caption, color: colors.muted }}>チェックディジット</span>
<span style={{ ...bodyEmphasis, color: colors.primary }}>{result.checkDigit}</span>

// After
<span className="caption text-muted">チェックディジット</span>
<span className="body-emphasis text-primary">{result.checkDigit}</span>
```

#### 3.3 完成コード行 (line 110-117)

```tsx
// Before
<span style={{ ...caption, color: colors.muted }}>完成コード</span>
<span className="font-mono" style={{ ...bodyEmphasis, color: colors.text, letterSpacing: '0.1em' }}>
  {result.fullCode}
</span>

// After
<span className="caption text-muted">完成コード</span>
<span className="font-mono body-emphasis text-default tracking-[0.1em]">
  {result.fullCode}
</span>
```

`tracking-[0.1em]` は Tailwind 4 arbitrary value (PR 4 Gs1Databar §1.2 と同じ pattern、CSP-safe)。

#### 3.4 計算過程 details / summary + hover refactor (line 124-141)

**重要: ここで CSSOM mutation 2 件を撤去する**

```tsx
// Before
<details className="rounded-lg" style={{ border: `1px solid ${colors.border}` }}>
  <summary
    className="cursor-pointer px-4 py-3 font-bold rounded-lg transition-colors"
    style={{
      ...caption,
      fontWeight: 700,
      color: colors.muted,
      listStyle: 'none',
      background: 'transparent',
    }}
    onMouseEnter={(e) => (e.currentTarget.style.background = colors.bgSubtle)}
    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
  >
    計算過程を見る
  </summary>
  <div
    className="px-4 pb-4 pt-2 space-y-1 font-mono"
    style={{ ...caption, color: colors.text }}
  >
    {/* ... 計算過程 ... */}
  </div>
</details>

// After
<details className="rounded-lg border border-default">
  <summary className="cursor-pointer px-4 py-3 rounded-lg caption font-bold text-muted bg-transparent summary-no-marker hover-bg-subtle">
    計算過程を見る
  </summary>
  <div className="px-4 pb-4 pt-2 space-y-1 font-mono caption text-default">
    {/* ... 計算過程 ... */}
  </div>
</details>
```

- `onMouseEnter` / `onMouseLeave` を **削除**
- `.summary-no-marker` は PR 4 既存 (`global.css` line 508-513) — `list-style: none` + `::-webkit-details-marker { display: none }` で marker 非表示
- `.hover-bg-subtle` は PR 4 既存 (`global.css` line 532-537) — `transition-colors` 込みで hover bg を CSS で表現
- 既存の `transition-colors` Tailwind utility は `.hover-bg-subtle` に組み込まれているので削除して OK

memory `feedback_tailwind_v4_layer_variant.md`: `hover:bg-subtle` のような Tailwind variant は `@layer components` の手書き class に効かない (silent regression)。本 PR でも PR 4 と同じ `.hover-bg-subtle` (専用 hover class) を再利用する。

#### 3.5 バーコードプレビュー wrapper (line 182-185)

```tsx
// Before
<div
  className="rounded-lg flex flex-col items-center gap-4 p-4"
  style={{ border: `1px solid ${colors.border}`, background: colors.bg }}
>

// After
<div className="rounded-lg flex flex-col items-center gap-4 p-4 border border-default bg-default">
```

#### 3.6 import 整理

```ts
// Before
import { bodyEmphasis, caption, colors } from '@/utils/styles';
// After (削除)
```

---

## 4. `src/styles/global.css` への追記 (PR 5a で **新規追加** する分のみ)

PR 1 / 1.5 / 2 / 3 / 4 で追加済の class はすべて再利用 (`.caption` / `.body-emphasis` / `.text-default` / `.text-muted` / `.text-on-primary` / `.text-error` / `.text-error-text` / `.text-primary` / `.text-link-color` / `.text-warning` / `.bg-default` / `.bg-subtle` / `.bg-surface` / `.bg-error-tint` / `.bg-warning-tint` / `.border-default` / `.border-input` / `.alert-success` / `.alert-error` / `.btn-link-plain` / `.summary-no-marker` / `.hover-bg-subtle`)。

本 PR 追加分:

```css
@layer components {
  /* === PR 5a: QrReader video preview background === */
  /* QRリーダーの <video> 要素は `getUserMedia` 開始前 (display:none で隠蔽中) の
     コントラスト確保 + 起動失敗時のフォールバック (黒画面) として黒背景を維持する。
     一意の用途のため component-scoped class とする (色 token 化はしない)。 */
  .qr-video-preview {
    background: #000;
  }
}
```

**衝突確認**:

- `.qr-video-preview` は QrReader の `<video>` 専用、他 tool で同名 class 利用なし (grep 確認 §6)
- `#000` の literal hex 利用は `--color-*` token に該当値がないため許容。`.jwt-json-value { color: #6e4f0e }` (PR 3、`global.css` line 455) と同じ pattern (one-off で意味のある色)

**Tailwind 4 arbitrary value の利用箇所** (build 時に静的 CSS、CSP-safe):

| utility            | 用途                       | 該当            |
| ------------------ | -------------------------- | --------------- |
| `max-w-[400px]`    | QrReader video 最大幅      | QrReader 1 箇所 |
| `tracking-[0.1em]` | JanCode 完成コード文字間隔 | JanCode 1 箇所  |

これらは Tailwind 4 標準機能。新 class 化のコスト>利益のため utility 利用に留める (PR 4 との整合性)。

---

## 5. `inline-style-migration.test.ts` への追加

```ts
const MIGRATED_FILES: readonly string[] = [
  // PR 1 で追加済 (11 件、省略)
  // PR 1.5 で追加済 (2 件)
  // PR 2 で追加済 (3 件)
  // PR 3 で追加済 (2 件)
  // PR 4 で追加済 (3 件)
  // PR 5a で追加
  'src/components/tools/ConfigConverter.tsx',
  'src/components/tools/QrReader.tsx',
  'src/components/tools/JanCode.tsx',
];
```

陽性対照テストブロックは PR 1 で導入済 → 変更不要。合計 24 ファイル。

---

## 6. consumer 変更範囲 (PR 5a で touch するファイル)

| File                                                 | 変更内容                                                                     | 備考                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------- |
| `src/components/tools/ConfigConverter.tsx`           | inline style 11 件除去 + import 整理                                         | MIGRATED_FILES 登録         |
| `src/components/tools/QrReader.tsx`                  | inline style 11 件除去 + module-level スタイル定数 4 個削除 + import 整理    | MIGRATED_FILES 登録         |
| `src/components/tools/JanCode.tsx`                   | inline style 9 件除去 + `e.currentTarget.style.X = Y` 2 件除去 + import 整理 | MIGRATED_FILES 登録         |
| `src/styles/global.css`                              | `@layer components` に `.qr-video-preview` 1 件追加                          | PR 4 既存ブロック末尾       |
| `src/utils/__tests__/inline-style-migration.test.ts` | `MIGRATED_FILES` array に 3 件追加 (合計 24 件)                              | -                           |
| `docs/projects/issue-176-b-plan-progress.md`         | PR 5a の状態を current 化 (PR 4 経験を踏まえ merge 待ち間 SoT 反映)          | 進捗 + follow-up table 更新 |

**触らない**:

- `src/components/tools/__tests__/*.test.ts` (logic test、本 PR の class 化は DOM 構造を変えない)
- `src/utils/styles.ts` (PR 6 で削除、本 PR は import 削除のみ)
- `src/utils/csp.ts` / `public/_headers` (PR 6 でstrict 化)
- `tests/e2e/*.spec.ts` (本 PR で applyProductionCsp gate 追加せず、#262 残部分 = ulid-generator は PR 5b で対応)
- `src/hooks/useQrCamera.ts` (logic、本 PR スコープ外)

**事前 grep 確認**:

```bash
# uploadLabelStyle(false) 呼び出しがないこと (= disabled 分岐がデッドコード) を確認
grep -n "uploadLabelStyle" src/components/tools/QrReader.tsx
# 期待: 関数定義 (line 60) + 呼び出し 1 箇所 (line 221、enabled=true 固定) のみ

# .qr-video-preview class 名衝突がないこと
grep -rn "qr-video-preview" src/

# .hover-bg-subtle / .summary-no-marker が PR 4 既存定義にあること
grep -n "hover-bg-subtle\|summary-no-marker" src/styles/global.css
```

---

## 7. 検証戦略

### 7.1 ローカル必須ゲート (push 前、親 Opus 直接実行)

| 順  | コマンド           | 目的                                                                    |
| --- | ------------------ | ----------------------------------------------------------------------- |
| 1   | `npm run test`     | unit + migration test (21 → 24、6 spec 追加 = 3 ファイル × 2 件 / file) |
| 2   | `npx astro check`  | TypeScript 型チェック (Tailwind utility の型 break 検知)                |
| 3   | `npm run test:e2e` | config-converter / qr-reader / jan-code の既存 E2E 全 pass              |

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
git diff origin/develop -- src/components/tools/ConfigConverter.tsx src/components/tools/QrReader.tsx src/components/tools/JanCode.tsx \
  | grep -E '^-.*(aria-|role=|data-testid=|htmlFor=)' | grep -vE '^---|^\+\+\+'
# 出力 0 行 = OK (reformatted で行移動した削除行が出る場合は現コードで存在を grep 確認、PR 3-4 と同運用)
```

特に注意:

- ConfigConverter の schema toggle button の `aria-expanded` / `aria-controls` 維持
- ConfigConverter の `<kbd aria-hidden="true">` 維持
- ConfigConverter の検証結果 alert の `role` / `aria-live` 維持 (動的に `status` ↔ `alert`)
- QrReader の `<input id="qr-image-input">` ↔ `<label htmlFor="qr-image-input">` 関連付け維持
- QrReader の `<video aria-label="カメラプレビュー">` 維持
- QrReader の `<canvas aria-hidden="true">` 維持 (display:none → hidden に変わるが a11y は同等)
- JanCode の `data-testid="jan-code-result"` 維持
- 全 button の `type="button"` 維持 (PR 1 follow-up #258/#269 で追加済)
- JanCode `<details>/<summary>` semantic 維持 (browser default 構造を class 化で壊さない、PR 4 Gs1Databar と同じ運用)

### 7.4 VRT 差分の判断フロー (PR 1〜4 と同じ)

PR comment に diff があった場合:

- 意図しない regression (ボタン色違い / video bg 抜け / hover bg 効かない) → class 定義 / consumer className 修正
- ピクセル未満の anti-alias 差 → mask か threshold 緩和 (事前合意必要)
- 意図的変化 → PR ブランチで `update-visual-baseline.yml` を `workflow_dispatch` trigger → bot が新 baseline を commit back

特に確認すべき差分点:

- QrReader video element: `display:none` → `hidden` class、初期状態で video が描画されないこと
- QrReader file input: `position: absolute` 視覚消去 → `sr-only` (clip + margin -1) で同等の不可視性
- JanCode summary: hover 時 `bg-subtle` 適用 (CSSOM mutation 撤去後も bg 変化が見える)
- ConfigConverter schema toggle arrow: `rotate-90` で 90 度回転 (transition-duration 200ms)

### 7.5 functional E2E 観点

| ツール          | 既存 spec ファイル                         | 本 PR で重要な assertion                                       |
| --------------- | ------------------------------------------ | -------------------------------------------------------------- |
| ConfigConverter | `tests/e2e/config-converter.spec.ts`       | サンプル投入 → 変換結果 / schema 検証 / clear ボタン           |
| QrReader        | `tests/e2e/qr-reader.spec.ts` (存在確認要) | mode 切替 (camera / upload) / file upload 動作 / 結果表示      |
| JanCode         | `tests/e2e/jan-code.spec.ts`               | JAN-13 / JAN-8 サンプル投入 → SVG 描画 / 計算過程 details 開閉 |

**特に**: QrReader の visible-hidden input (`sr-only`) で `htmlFor` クリックが動くこと、video 要素の `hidden` 属性切替が動くこと。E2E で再現できない実機 camera は手動確認 (post-merge、PR 6 前段)。

---

## 8. バッチ計画における本 PR の位置付け

repo SoT [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md) のテーブル参照。

| #         | スコープ                                                                                                | 状態           |
| --------- | ------------------------------------------------------------------------------------------------------- | -------------- |
| PR 0      | VRT 導入                                                                                                | ✅ #254 merged |
| PR 1      | 基礎工事 + ui/\* simple 11                                                                              | ✅ #256 merged |
| PR 1.5    | ui/\* complex (ResultTable + InputField)                                                                | ✅ #261 merged |
| PR 2      | qr-ticket/\*                                                                                            | ✅ #272 merged |
| PR 3      | JwtDecoder + UuidV7Generator + #262 partial                                                             | ✅ #275 merged |
| PR 4      | Gs1Databar + EncodingConverter + DummyText                                                              | ✅ #277 merged |
| infra     | `withProductionCsp` ラッパ helper                                                                       | ✅ #278 merged |
| **PR 5a** | **ConfigConverter + QrReader + JanCode (本 PR)**                                                        | **本 PR**      |
| PR 5b     | Base64 + JsonCsv + JsonXml + QrCode + UlidGenerator + zero-style 登録 + ulid-generator E2E + #262 close | 未着手         |
| PR 6      | flip + cleanup                                                                                          | 未着手         |

PR は **直列** (前 PR がマージされてから次 PR 着手)。

---

## 9. ブランチ命名 / コミット粒度 / 並列 subagent 分担 + race 回避運用

### 9.1 ブランチ命名

- `feature/issue-176-b5a-config-qr-jan`
- worktree: `git worktree add .claude/worktrees/issue-176-b5a origin/develop -b feature/issue-176-b5a-config-qr-jan` (memory `feedback_worktree_base_branch.md` / `feedback_worktree_location.md`)

### 9.2 コミット粒度

```
1. (Phase 0) chore(spec): #176 B 案 PR 5a spec / plan / global.css foundation (.qr-video-preview)
2. (Phase 1.5) refactor(tools): #176 B 案 PR 5a — ConfigConverter.tsx inline style 撤去
3. (Phase 1.5) refactor(tools): #176 B 案 PR 5a — QrReader.tsx inline style 撤去 + module-level スタイル定数撤去
4. (Phase 1.5) refactor(tools): #176 B 案 PR 5a — JanCode.tsx inline style 撤去 + summary hover を CSS に移行
5. (Phase 2) test(migration): MIGRATED_FILES に PR 5a 対象 3 件追加
6. (Phase 2) docs(progress): PR 5a (#XXX) の状態を反映
```

### 9.3 並列 subagent 分担 (sonnet × 3 Track)

memory `feedback_subagent_model.md` に従い `model: "sonnet"` 明示:

| Track | 担当ファイル          | inline style 件数 + 特殊事項                                  |
| ----- | --------------------- | ------------------------------------------------------------- |
| **A** | `ConfigConverter.tsx` | 11 件                                                         |
| **B** | `QrReader.tsx`        | 11 件 + module-level スタイル定数 4 個解体 + sr-only への置換 |
| **C** | `JanCode.tsx`         | 9 件 + 2 件 hover refactor (CSSOM、`.hover-bg-subtle` 再利用) |

### 9.4 **Phase 1 race 回避運用 (PR 4 運用継承)**

PR 3 で並列 dispatch 時に commit が結合される race が発生 → PR 4 で「subagent 非 commit」運用を初採用 → 成功。本 PR でも継承:

#### 採用方針: subagent は commit せず、親が Phase 1.5 で順次 commit

各 subagent への明示指示:

```
- ファイル編集 + self-verification (vitest, astro check) のみ実施
- git add / git commit は実行しない (親が後段で実施)
- 完了報告: 「変更ファイル list (git diff --name-only) + self-verification 結果」のみ
```

親 Opus が Phase 1 完了後、Phase 1.5 で:

1. Track A の変更を確認 → `git add src/components/tools/ConfigConverter.tsx` → `git commit -m "..."`
2. Track B の変更を確認 → `git add src/components/tools/QrReader.tsx` → `git commit -m "..."`
3. Track C の変更を確認 → `git add src/components/tools/JanCode.tsx` → `git commit -m "..."`

#### 利点 (PR 4 で確認済)

- subagent 間の commit race 完全消去
- prettier hook の巻き込み reformat も親が制御 (1 commit に閉じる、他 Track ファイルが入らない)
- 各 commit のメッセージと内容が完全一致
- subagent の self-verification (vitest / astro check) は維持

### 9.5 PR ベース

`gh pr create --base develop` で必ず明示 (memory `feedback_branch_workflow.md` / `feedback_pr_language.md` / `CLAUDE.md` 最重要ルール)。タイトル例:

> `refactor(tools): #176 B 案 PR 5a — ConfigConverter + QrReader + JanCode inline style 撤去`

PR 本文は `--body-file /tmp/claude/pr_body_b5a.md` 経由 (memory `feedback_heredoc_no_escape.md`)。

---

## 10. リスクと緩和

| ID  | リスク                                                                                              | 緩和                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `max-w-[400px]` arbitrary が Tailwind 4 で生成されない                                              | Tailwind 4 標準機能、`tracking-[0.1em]` (PR 4) で実績あり。astro check で型 break しないか確認、E2E で実描画確認                               |
| R2  | `sr-only` が元 `position: absolute` 等の inline style と挙動同等でない                              | sr-only は label 経由 click + Tab focus を担保、a11y 同等以上 (clip + margin -1 も含む)。E2E で `<label>` クリック → 画像選択ダイアログ確認可  |
| R3  | `.qr-video-preview` の `#000` literal hex が `--color-*` token と乖離                               | one-off 用途、token 化のコスト>利益。`.jwt-json-value { color: #6e4f0e }` (PR 3) と同じ pattern。`docs/decisions.md` 記録不要                  |
| R4  | `border-warning` Tailwind auto-utility が生成されない                                               | `--color-warning: #854d0e` は `global.css` line 51 で `@theme` 内定義済、Tailwind 4 が自動 utility 生成。astro check で型 break しないか確認   |
| R5  | `.alert-success` / `.alert-error` の border 優先度問題 (`border` Tailwind utility との competition) | PR 2 review で実害なし確認済 (memory `progress doc` 末尾 PR 6 checklist 末尾「Tailwind `border` utility と `@layer components` の優先度」参照) |
| R6  | `.hover-bg-subtle` が JanCode `<summary>` で hover 効かない                                         | PR 4 で動作確認済 (Gs1Databar の AI フィールド削除 button、GS1 文字列 `<summary>`)。JanCode は同 pattern 流用                                  |
| R7  | Phase 1 で subagent が指示違反して commit してしまう                                                | 親が Phase 1.5 で `git status` / `git log --oneline -1` を確認して回復可能。最悪 reset --soft で再 commit (PR 3 の経験)                        |
| R8  | QrReader の `<video hidden>` で video element 自体が DOM から消える / videoRef.current が null      | Tailwind `hidden` = `display: none`、要素は DOM に残る (videoRef.current 維持)。元 inline `display: 'none'` と挙動同等。E2E で起動後再表示確認 |
| R9  | `uploadLabelStyle(false)` 呼び出しが残存していて disabled 分岐削除で regression                     | §6 の grep 命令で事前確認。実際は line 221 のみ呼び出しで `enabled=true` 固定                                                                  |
| R10 | QrReader の `getUserMedia()` が CSP strict 化 (PR 6) で動かなくなる                                 | 本 PR スコープ外、PR 6 で `media-src` directive 検討時に flag。本 PR は inline style 撤去のみで camera 機能は変えない                          |

---

## 11. 議論ポイント (spec 確定前 user 判断、本 spec に既に user 承認済 2026-05-07)

### D1. `.qr-video-preview` 新規 class の責務範囲

- **採用**: `background: #000` のみ持つ singleton class
- **代替 1**: `--color-video-bg: #000` を `:root` に追加 + `.bg-video-bg` class
- **代替 2**: Tailwind 4 arbitrary `bg-[#000]` を className に書く
- **判断ポイント**: token 化のコスト vs one-off 利用 (PR 3 `.jwt-json-value` と同じ判断)
- **判断**: 採用案 (user 承認済 2026-05-07、1 class で命名意図が明確、token 化コスト>利益)

### D2. QrReader file input の visible-hidden を `sr-only` に置換

- **採用**: Tailwind 標準 `sr-only` (clip + margin -1 込み、a11y 担保)
- **代替**: 元 inline style と完全同等な `.qr-file-input-hidden` class (`position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none`)
- **判断ポイント**: `sr-only` が業界標準で a11y 同等以上。VRT で diff 出る可能性は低 (両方とも視覚的に消える)
- **判断**: 採用案 (user 承認済 2026-05-07、Tailwind 標準活用、a11y 同等以上)

### D3. JanCode `<summary>` hover を `.hover-bg-subtle` (PR 4) で再利用

- **採用**: PR 4 で確立した `.hover-bg-subtle` 利用、新規 class 不要
- **代替**: JanCode 専用 class (`.summary-jan-hover` 等)
- **判断**: 採用案 (user 承認済 2026-05-07、PR 4 で同 pattern 確立、再利用 rational)

### D4. ConfigConverter schema toggle arrow の rotation を Tailwind utility で表現

- **採用**: `rotate-90` (Tailwind 標準) を conditional className で適用
- **代替**: 専用 class (`.rotate-on-open`) を新設
- **判断**: 採用案 (user 承認済 2026-05-07、Tailwind utility で完結、新 class 不要)

### D5. QrReader module-level スタイル定数 4 個 (`rescanButtonStyle` / `startCameraButtonStyle` / `stopCameraButtonStyle` / `uploadLabelStyle`) の解体

- **採用**: 全削除して consumer 側 className 化
- **代替**: 一部を `.btn-camera-start` 等の専用 class として残す
- **判断ポイント**: 新規 class を最小化する方針 (本 PR `.qr-video-preview` のみ)。className のみで完結する箇所は class 化しない
- **判断**: 採用案 (user 承認済 2026-05-07、定数全削除、className 化)

### D6. `uploadLabelStyle(enabled)` の `enabled=false` 分岐削除

- **採用**: `enabled=false` 呼び出しがないことを §6 grep で確認後、`enabled=true` 分岐のみ展開して disabled state は削除
- **代替**: enabled state を保持して将来の disabled 利用に備える
- **判断ポイント**: YAGNI / 現コードに `uploadLabelStyle(false)` 呼び出しなし
- **判断**: 採用案 (user 承認済 2026-05-07、YAGNI、現コードで未使用 code path 削除、PR 6 cleanup と同じ精神)

### D7. CSSOM hover refactor pattern (JanCode `<summary>`)

- **採用**: PR 4 Gs1Databar と同じく `onMouseEnter` / `onMouseLeave` を削除して `.hover-bg-subtle` の CSS `:hover` で表現
- **代替**: Tailwind `hover:bg-subtle` variant (memory `feedback_tailwind_v4_layer_variant.md` で動かないことが判明済)
- **判断**: 採用案 (user 承認済 2026-05-07、PR 4 で確立、Tailwind variant は @layer components 手書き class に効かない)

---

## 関連

- 起源 issue: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B
- 前提 PR: [#249](https://github.com/fumtas1k/devtools/pull/249) (A-1) / [#252](https://github.com/fumtas1k/devtools/pull/252) (meta-csp) / [#254](https://github.com/fumtas1k/devtools/pull/254) (VRT) / [#256](https://github.com/fumtas1k/devtools/pull/256) (PR 1) / [#261](https://github.com/fumtas1k/devtools/pull/261) (PR 1.5) / [#272](https://github.com/fumtas1k/devtools/pull/272) (PR 2) / [#275](https://github.com/fumtas1k/devtools/pull/275) (PR 3) / [#277](https://github.com/fumtas1k/devtools/pull/277) (PR 4) / [#278](https://github.com/fumtas1k/devtools/pull/278) (前段 infra)
- 過去 decisions: [054]（CSP 初導入）/ [064]（A-1 採用）/ [066]（VRT 採用）
- repo SoT: [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md)
- memory: `feedback_pr_size.md` / `feedback_subagent_model.md` / `feedback_subagent_verification_trust.md` / `feedback_commander_checklist.md` / `feedback_vrt_ci_only.md` / `feedback_e2e_before_pr.md` / `feedback_branch_workflow.md` / `feedback_pr_language.md` / `feedback_heredoc_no_escape.md` / `feedback_worktree_base_branch.md` / `feedback_worktree_location.md` / `feedback_worktree_merge_order.md` / `feedback_tailwind_v4_layer_variant.md`
- PR 1 spec: `docs/superpowers/specs/2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md`
- PR 1.5 spec: `docs/superpowers/specs/2026-05-04-issue-176-b1-5-ui-complex-design.md`
- PR 2 spec: `docs/superpowers/specs/2026-05-04-issue-176-b2-qr-ticket-design.md`
- PR 3 spec: `docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md`
- PR 4 spec: `docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md`
- 前段 infra spec: `docs/superpowers/specs/2026-05-07-issue-276-with-production-csp-helper-design.md`
