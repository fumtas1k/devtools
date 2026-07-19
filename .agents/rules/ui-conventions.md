# UI 実装・E2E 詳細規約

このドキュメントは、UI コンポーネントを変更する際／Playwright で UI 確認・E2E テストを書く際に参照する詳細パターン集です。
基本ルール（Tailwind カラー使用制限・PC スマホ両サイズでの目視確認義務）は `.agents/rules/common.md` の 7 章を参照してください。

---

## 1. 共通 UI コンポーネント

新しい入力欄・ダウンロードボタン・エラー表示等を実装する前に `src/components/ui/` の既存コンポーネントを必ず確認すること。

| コンポーネント        | 用途                                                                                                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `InputField`          | ラベル・入力欄・エラー・ヒント・サンプルボタンをまとめたフォームフィールド                                                                                                                                                                                                          |
| `ErrorMessage`        | エラーテキスト表示（`role="alert"` 付き）                                                                                                                                                                                                                                           |
| `DownloadButton`      | 統一デザインのダウンロードボタン（アイコン内蔵）                                                                                                                                                                                                                                    |
| `DownloadButtonGroup` | SVG/PNG ダウンロードボタンペア                                                                                                                                                                                                                                                      |
| `CopyButton`          | クリップボードコピーボタン                                                                                                                                                                                                                                                          |
| `ToggleGroup<T>`      | 排他選択トグル（モード切替等）                                                                                                                                                                                                                                                      |
| `ToggleChips<T>`      | 多選択トグルチップ群。`<fieldset>`/`<legend>` で意味付け、各チップは `aria-pressed` ボタン。`count` prop で件数バッジ表示（マスク検出件数等）、`token` prop で文字トークンを等幅バッジ表示（フラグ g/i/m 等）、`legendVisible={false}` で見出しを sr-only 化（a11y ツリーには残す） |
| `FileInputButton`     | ファイル選択ボタン。label 内包 input 構造で `:focus-within` によるキーボードフォーカス可視化に対応                                                                                                                                                                                  |
| `NotificationBanner`  | DADS color-chip 型の通知バナー（variant: warning/error/info/success、title + 本文）                                                                                                                                                                                                 |
| `StatusBadge`         | 状態を表す filled ピルバッジ（tone: error/success/warning/info）。`decorative` prop で `aria-hidden` を付与し、隣接する通知バナー等が意味を担保する文脈での二重読み上げを抑制できる                                                                                                 |
| `ChipLabel`           | アウトライン型ラベルチップ（tone: error/info/neutral、任意 icon）                                                                                                                                                                                                                   |

---

## 2. UI スタイリングパターン

### 2.1 ホバー時の色変化

CSP `style-src 'unsafe-inline'` 撤去（issue #176 B 案）に伴い、JSX の `style={{}}` および `e.currentTarget.style.X = Y` 形式の DOM mutation は使用禁止。ホバー / 状態色は `src/styles/global.css` の `@layer components` に semantic class として定義し、`:hover` / `[aria-pressed="true"]` / 条件 `className` 切替で表現する。

- Tailwind の **色値直書き** utility（`text-blue-500`, `bg-red-200` 等）は引き続き禁止
- ただし `@theme` 経由で auto-generate される **意味トークン** utility（`text-primary` / `bg-error` 等は `--color-primary` / `--color-error` を参照）は使用可。色値直書きではなく既存 SoT を経由するため、カラー使用制限の趣旨と整合
- ⚠️ **重要 — Tailwind v4 の variant 制約**: `@layer components` 内で **手書き定義** した class（`.bg-subtle` / `.bg-error-tint` / `.text-primary` 等、`global.css` の `@layer components` ブロックに記述したもの）は **`hover:` / `focus:` 等の variant に対応しない**（CSS rule が build 出力に含まれず silent regression する）。`@theme` の token から auto-generate される utility のみ variant 対応する。**`hover:bg-subtle` のような書き方は使えない**。代わりに専用の hover 用 class を `@layer components` 内に定義する pattern (下記 `.btn-clear` 例のように `:hover` 擬似クラスごと書く) を用いること

```tsx
// before (PR #176 B 案 移行前の旧パターン、現在は禁止)
<button
  style={{ background: 'transparent', color: colors.error }}
  onMouseEnter={(e) => (e.currentTarget.style.background = colors.errorBg)}
  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
/>

// after (PR #176 B 案 移行後の正典パターン)
<button className="caption text-muted btn-clear" />

// global.css `@layer components` ブロック内（PR 1 で実定義）
.btn-clear {
  background: transparent;
  transition: background-color 0.15s;
}
.btn-clear:hover {
  background: var(--color-bg-subtle);
}
```

#### ActionButton variant 別 hover / :focus-visible の例

`ActionButton` は `btn-action` + `btn-action--{variant}` の semantic class を持ち、`global.css` の `@layer components` 内で variant ごとに `:hover:not(:disabled)` と `:focus-visible:not(:disabled)` を**同じ視覚反応で**定義する。キーボードユーザにも mouse hover と同等のフィードバックを与えるための a11y 配慮。`:not(:disabled)` で disabled 時に反応が出ないことを保証する。`:focus` 全般ではなく `:focus-visible` に限定することで click 押下中の残留視覚反応を避ける（`global.css` の `:where(...):focus-visible` outline ring と併用）。

```css
/* global.css `@layer components` ブロック内 */
.btn-action {
  transition:
    background-color 0.15s,
    filter 0.15s;
}
.btn-action--primary:hover:not(:disabled),
.btn-action--primary:focus-visible:not(:disabled) {
  filter: brightness(0.92); /* ベース色を保ちつつ 8% 暗化 */
}
.btn-action--secondary:hover:not(:disabled),
.btn-action--secondary:focus-visible:not(:disabled) {
  background: var(--color-bg-active); /* 透過 → blue-50 tint */
}
.btn-action--danger:hover:not(:disabled),
.btn-action--danger:focus-visible:not(:disabled) {
  background: var(--color-error-bg); /* 透過 → red-50 tint */
}
```

#### `outline-none` Tailwind utility は使わない

input / textarea / button などのフォーカス可能要素の className に `outline-none` を付けると、`:where(button, a, [role='button'], input, textarea, select):focus-visible` の global rule (specificity 0) を Tailwind utility (specificity 1) が上書きし、**キーボード focus 時のフォーカスリングが消滅**する。focus 表示は `global.css` の `:focus-visible` ルールに委ねること。デフォルトの mouse focus アウトラインは `:where(...)` 側で `:focus-visible` 限定なので mouse click では出ない（visible feedback は不要）。

### 2.2 ボタン高さの揃え

横並びでボタン高さを揃えたい場合は **`leading-none` Tailwind utility を併記する**（`.caption` / `.body-emphasis` class は line-height 1.7 のため意図より大きくなる）。

```tsx
// caption の line-height 1.7 を Tailwind の leading-none で 1 に上書き
<button className="caption leading-none">クリック</button>
```

### 2.3 横並び ↔ 縦並びレスポンシブ

切替レイアウトには **`w-full md:flex-1 min-w-0`** をセットで使用（`min-w-0` を忘れると長いコンテンツがはみ出す）。

### 2.4 ToggleGroup のモード切替時のリセット要否

| トグルの種類                                 | リセット | 理由                       |
| :------------------------------------------- | :------- | :------------------------- |
| 操作の種類が変わる（エンコード/デコード等）  | する     | 入力の期待形式が変わる     |
| 同じ操作のサブバリアント（標準/URL-safe 等） | しない   | 出力比較のために保持が便利 |

### 2.5 live region（`aria-live` / `role="status"`）は小さい要素に限定する

リアルタイム変換系ツールで **結果領域全体**（サマリ・詳細・テーブルを含む大きな div）に `aria-live` / `role="status"` を付けない。入力を 1 文字編集するたびに領域全体が変化し、スクリーンリーダーに膨大な再アナウンスが走る。

- ✅ 推奨: 「変換ステップ行」「結果の 1 行要約」など**小さく安定した要素**だけを live region にし、詳細領域は通常のセクションにする
- `role="status"` は暗黙で `aria-live="polite"` を持つため、両方を併記しない（冗長）
- 過去事例: PR #746 のレビューで検出（JwtDecoder の既存パターンを踏襲した結果の再発。既存分の改修は別 issue 管理）

---

## 3. Playwright での確認手順

### 3.1 目視確認チェックリスト

UI 変更時は **PC (1280x800)** と **スマホ (390x844)** 両方でスクリーンショットを撮影し、コミット前に以下を目視確認:

- 入力・出力エリアの上端揃え／スマホ幅で縦並びレイアウトに切替
- ボタンの隠れ・重なりがないか／ラベル行高さの左右揃え
- フォーカスリングの見切れ／タップ領域 ≥ 44x44px

### 3.2 撮影手順（必須）

```
1. caches.delete + localStorage.clear + sessionStorage.clear
2. browser_navigate（キャッシュなし）
3. browser_resize 1280x800 → screenshot
4. browser_resize 390x844 → screenshot
```

### 3.3 ロケーター・アサーション

- `getByRole` / `getByText` / `getByLabel` を使う。`locator('[role="X"]')` のような属性セレクタは禁止（アクセシビリティ・国際化に弱く、リファクタリング耐性も低い）。
- DOM 直接操作（`page.evaluate`）より `expect` のオートリトライを優先（React の再レンダータイミングで不安定になるため）。

### 3.4 React island へ入力する E2E spec は hydration 待機が必須

React island（`client:load` でマウントされるツール本体）に `fill` / `click` 等で入力する spec は、**`beforeEach` で `await waitForReactHydration(page);`（`tests/e2e/helpers.ts`）を必ず呼ぶ**。

- hydration 完了前の `fill` は DOM の value だけを書き換え、React の `onChange` が発火しないため state が空のまま進む（例: URI 貼り付け分解で一部フィールドだけ空になる）
- この race は **CI では顕在化しない**（`workers: 1` の直列実行で hydration が間に合う）が、ローカルの並列実行で flaky になる。「CI green だからテストは正しい」とは判断できない
- 過去事例: issue #750（`dsn-builder.spec.ts` / `dummy-personal-data.spec.ts` が未呼び出しでローカル 8〜10 件 fail）
