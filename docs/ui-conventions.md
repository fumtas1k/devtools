# UI 実装・E2E 詳細規約

このドキュメントは、UI コンポーネントを変更する際／Playwright で UI 確認・E2E テストを書く際に参照する詳細パターン集です。
基本ルール（Tailwind カラー使用制限・PC スマホ両サイズでの目視確認義務）は `docs/shared-agent-rules.md` の 7 章を参照してください。

---

## 1. 共通 UI コンポーネント

新しい入力欄・ダウンロードボタン・エラー表示等を実装する前に `src/components/ui/` の既存コンポーネントを必ず確認すること。

| コンポーネント        | 用途                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| `InputField`          | ラベル・入力欄・エラー・ヒント・サンプルボタンをまとめたフォームフィールド |
| `ErrorMessage`        | エラーテキスト表示（`role="alert"` 付き）                                  |
| `DownloadButton`      | 統一デザインのダウンロードボタン（アイコン内蔵）                           |
| `DownloadButtonGroup` | SVG/PNG ダウンロードボタンペア                                             |
| `CopyButton`          | クリップボードコピーボタン                                                 |
| `ToggleGroup<T>`      | 排他選択トグル（モード切替等）                                             |

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
