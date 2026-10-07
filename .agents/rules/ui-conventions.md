# UI 実装・E2E 詳細規約

UI コンポーネントの変更時と、Playwright で UI 確認・E2E テストを書く際に参照する。色の使用制限と `@layer components` の variant 制約は `.agents/rules/common.md` 7 章が正本。

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

### 2.1 ホバー・フォーカス時の色変化

CSP で `style-src 'unsafe-inline'` を撤去済み（issue #176）のため、JSX の `style={{}}` や `e.currentTarget.style.X = Y` による色変更は禁止。ホバー / 状態色は `global.css` の `@layer components` に `:hover` / `[aria-pressed="true"]` 擬似クラスごと semantic class を定義し、`className` で適用する（`hover:` variant が使えない理由は common.md 7.1 章）。

- 既存例: `.btn-clear`（透過 → `--color-bg-subtle`）、`ActionButton` の `.btn-action--{variant}`
- ボタンの hover は **`:hover:not(:disabled)` と `:focus-visible:not(:disabled)` を同じ視覚反応で定義**する（キーボード利用者にも同等のフィードバックを出し、disabled 時は反応させない）
- **`outline-none` を付けない**。global の `:where(...):focus-visible` ルール（specificity 0）を上書きしてキーボードのフォーカスリングが消える

### 2.2 ボタン高さの揃え

`.caption` / `.body-emphasis` は line-height 1.7 のため、横並びで高さを揃えるときは `leading-none` を併記する（`className="caption leading-none"`）。

### 2.3 横並び ↔ 縦並びレスポンシブ

切替レイアウトは **`w-full md:flex-1 min-w-0`** をセットで使う（`min-w-0` が無いと長いコンテンツがはみ出す）。

### 2.4 ToggleGroup のモード切替時のリセット要否

| トグルの種類                                 | リセット | 理由                       |
| :------------------------------------------- | :------- | :------------------------- |
| 操作の種類が変わる（エンコード/デコード等）  | する     | 入力の期待形式が変わる     |
| 同じ操作のサブバリアント（標準/URL-safe 等） | しない   | 出力比較のために保持が便利 |

### 2.5 live region は小さい要素に限定する

リアルタイム変換系ツールで、結果領域全体に `aria-live` / `role="status"` を付けない（1 文字編集ごとに全体が再アナウンスされる）。「結果の 1 行要約」など小さく安定した要素だけを live region にする。`role="status"` は暗黙で `aria-live="polite"` を持つので併記しない（PR #746）。

---

## 3. Playwright での確認手順

### 3.1 目視確認チェックリスト

UI 変更時は **PC (1280x800)** と **スマホ (390x844)** の両方でスクリーンショットを撮り、コミット前に確認する:

- 入力・出力エリアの上端揃え／スマホ幅での縦並び切替
- ボタンの隠れ・重なり／ラベル行高さの左右揃え
- フォーカスリングの見切れ／タップ領域 ≥ 44x44px

### 3.2 撮影手順

キャッシュとストレージ（`caches.delete` / `localStorage.clear` / `sessionStorage.clear`）を消してから開き、1280x800 → 390x844 の順に撮影する。

### 3.3 ロケーター・アサーション

- `getByRole` / `getByText` / `getByLabel` を使う。`locator('[role="X"]')` のような属性セレクタは使わない。
- `page.evaluate` による DOM 直接操作より `expect` のオートリトライを優先する。

### 3.4 React island へ入力する spec は hydration を待つ

`/tools/*` で `fill` / `click` する spec は `beforeEach` で `await waitForReactHydration(page);`（`tests/e2e/helpers.ts`）を呼ぶ。hydration 前の `fill` は React の `onChange` を発火させない。CI（`workers: 1`）では顕在化せずローカル並列でだけ flaky になる（issue #750）。漏れは `tests/meta/e2e-hydration-wait-coverage.test.ts` が検出する。
