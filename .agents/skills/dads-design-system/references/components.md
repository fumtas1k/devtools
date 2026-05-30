# コンポーネント実装リファレンス

デジタル庁デザインシステム（DADS）のコンポーネント実装パターン集。
SKILL.mdのCSS変数を前提として使用する。

---

## ボタン（Button）

アクション実行またはページ遷移のトリガー。

### バリエーション

```css
/* 塗りボタン（Primary） */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  font-family: 'Noto Sans JP', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    background-color 0.2s,
    border-color 0.2s;
}

.btn-primary {
  background: var(--color-primary);
  color: var(--neutral-white);
}
.btn-primary:hover {
  background: var(--blue-800);
}
.btn-primary:active {
  background: var(--blue-900);
}

/* アウトラインボタン（Secondary） */
.btn-outline {
  background: var(--neutral-white);
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.btn-outline:hover {
  background: var(--blue-50);
}
.btn-outline:active {
  background: var(--blue-100);
}

/* テキストボタン（Tertiary） */
.btn-text {
  background: transparent;
  color: var(--color-primary);
  border-color: transparent;
  padding: 12px 16px;
}
.btn-text:hover {
  background: var(--blue-50);
}

/* 共通フォーカス（DADS標準: 黒アウトライン＋黄色リング） */
.btn:focus-visible {
  outline: 4px solid var(--color-focus-outline);
  outline-offset: 2px;
  box-shadow: 0 0 0 0.125rem var(--color-focus-ring); /* DADS yellow-300 = #FFD43D */
}

/* 無効状態 */
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* サイズバリエーション */
.btn-sm {
  padding: 8px 16px;
  font-size: 14px;
}
.btn-lg {
  padding: 16px 32px;
  font-size: 18px;
}
```

---

## カード（Card）

単一の主題に関するコンテンツをまとめて表示するコンテナ。

```css
.card {
  background: var(--neutral-white);
  border: 1px solid var(--neutral-gray-200);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: box-shadow 0.2s;
}
.card:hover {
  box-shadow: var(--elevation-3);
}
.card-image {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}
.card-body {
  padding: 24px;
}
.card-title {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.5;
  letter-spacing: 0.02em;
  color: var(--neutral-gray-900);
  margin-bottom: 8px;
}
.card-text {
  font-size: 16px;
  line-height: 1.7;
  letter-spacing: 0.02em;
  color: var(--neutral-gray-600);
}
```

---

## インプットテキスト（Input Text）

```css
.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.input-label {
  font-size: 16px;
  font-weight: 700;
  color: var(--neutral-gray-900);
  letter-spacing: 0.02em;
}
.input-required {
  color: var(--color-error);
  margin-left: 4px;
}
.input-field {
  padding: 12px 16px;
  font-family: 'Noto Sans JP', sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--neutral-gray-900);
  background: var(--neutral-white);
  border: 1px solid var(--neutral-gray-400);
  border-radius: var(--radius-sm);
  transition: border-color 0.2s;
}
.input-field:focus {
  border-color: var(--color-primary);
  outline: 4px solid var(--color-focus-outline);
  outline-offset: 2px;
  box-shadow: 0 0 0 0.125rem var(--color-focus-ring); /* DADS yellow-300 = #FFD43D */
}
.input-field::placeholder {
  color: var(--neutral-gray-400);
}
.input-error .input-field {
  border-color: var(--color-error);
}
.input-error-message {
  font-size: 14px;
  color: var(--color-error);
}
.input-hint {
  font-size: 14px;
  color: var(--neutral-gray-500);
}
```

---

## チェックボックス / ラジオボタン

```css
.checkbox-group,
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.checkbox-item,
.radio-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
}
.checkbox-item input[type='checkbox'],
.radio-item input[type='radio'] {
  width: 24px;
  height: 24px;
  margin-top: 2px;
  accent-color: var(--color-primary);
  flex-shrink: 0;
}
```

---

## ノティフィケーションバナー

```css
.notification {
  padding: 16px 24px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.notification-info {
  background: var(--blue-50);
  border-left: 4px solid var(--color-primary);
  color: var(--neutral-gray-900);
}
.notification-success {
  background: var(--color-success-bg);
  border-left: 4px solid var(--color-success);
}
.notification-error {
  background: var(--color-error-bg);
  border-left: 4px solid var(--color-error);
}
.notification-warning {
  background: var(--color-warning-bg);
  border-left: 4px solid var(--color-warning);
}
```

---

## テーブル（Table）

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 16px;
  line-height: 1.7;
}
.table th {
  background: var(--blue-50);
  font-weight: 700;
  text-align: left;
  padding: 12px 16px;
  border-bottom: 2px solid var(--neutral-gray-300);
  color: var(--neutral-gray-900);
}
.table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--neutral-gray-200);
  color: var(--neutral-gray-700);
}
.table tr:hover td {
  background: var(--neutral-gray-50);
}
```

---

## パンくずリスト（Breadcrumb）

```css
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--neutral-gray-500);
  padding: 16px 0;
}
.breadcrumb a {
  color: var(--color-link);
  text-decoration: underline;
}
.breadcrumb-separator {
  color: var(--neutral-gray-400);
}
.breadcrumb-current {
  color: var(--neutral-gray-700);
}
```

---

## ヘッダーコンテナ

```css
.site-header {
  background: var(--neutral-white);
  border-bottom: 1px solid var(--neutral-gray-200);
  padding: 0 24px;
}
.header-inner {
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}
.header-logo {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-primary);
  text-decoration: none;
}
.header-nav {
  display: flex;
  gap: 24px;
}
.header-nav a {
  font-size: 16px;
  color: var(--neutral-gray-700);
  text-decoration: none;
  padding: 8px 0;
  border-bottom: 2px solid transparent;
}
.header-nav a:hover,
.header-nav a[aria-current='page'] {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}
```

---

## フッター

```css
.site-footer {
  background: var(--neutral-gray-900);
  color: var(--neutral-gray-300);
  padding: 48px 24px 24px;
}
.footer-inner {
  max-width: 1120px;
  margin: 0 auto;
}
.footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-bottom: 32px;
}
.footer-links a {
  color: var(--neutral-gray-300);
  text-decoration: underline;
  font-size: 14px;
}
.footer-copyright {
  font-size: 14px;
  color: var(--neutral-gray-500);
  border-top: 1px solid var(--neutral-gray-700);
  padding-top: 24px;
}
```

---

## ページナビゲーション（Pagination）

```css
.pagination {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pagination-item {
  min-width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  font-size: 16px;
  color: var(--neutral-gray-700);
  text-decoration: none;
  border: 1px solid var(--neutral-gray-300);
}
.pagination-item:hover {
  background: var(--blue-50);
  border-color: var(--color-primary);
}
.pagination-item[aria-current='page'] {
  background: var(--color-primary);
  color: var(--neutral-white);
  border-color: var(--color-primary);
}
```

---

## モーダルダイアログ

```css
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.dialog {
  background: var(--neutral-white);
  border-radius: var(--radius-lg);
  padding: 32px;
  max-width: 560px;
  width: calc(100% - 32px);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--elevation-5);
}
.dialog-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--neutral-gray-900);
  margin-bottom: 16px;
}
.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}
```

---

## チップラベル

```css
.chip-label {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  border-radius: var(--radius-full);
  letter-spacing: 0.02em;
}
.chip-label-primary {
  background: var(--blue-100);
  color: var(--blue-800);
}
.chip-label-success {
  background: var(--color-success-bg);
  color: #166534;
}
.chip-label-error {
  background: var(--color-error-bg);
  color: #991b1b;
}
.chip-label-warning {
  background: var(--color-warning-bg);
  color: #92400e;
}
```

---

## ステップナビゲーション

```css
.steps {
  display: flex;
  align-items: center;
  gap: 0;
}
.step {
  display: flex;
  align-items: center;
  gap: 8px;
}
.step-number {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
}
.step-completed .step-number {
  background: var(--color-primary);
  color: var(--neutral-white);
}
.step-current .step-number {
  background: var(--neutral-white);
  color: var(--color-primary);
  border: 2px solid var(--color-primary);
}
.step-upcoming .step-number {
  background: var(--neutral-gray-200);
  color: var(--neutral-gray-500);
}
.step-connector {
  width: 40px;
  height: 2px;
  background: var(--neutral-gray-300);
}
.step-completed + .step-connector {
  background: var(--color-primary);
}
```

---

## React実装時の注意

このファイルのCSSパターンはDADS標準のHTMLクラスベース実装。  
Reactで使う際は以下の方針で選択する。

### 方針1: DADSコードスニペットライブラリを使う（推奨）

```bash
npm install @digital-go-jp/design-system-example-components-react
```

- `react-aria-components` ベースでアクセシビリティ対応済み
- `@digital-go-jp/tailwind-theme-plugin` が必要（Tailwind前提）
- コンポーネント一覧・使い方はSKILL.mdのSection 10を参照

### 方針2: CSS class で実装する

このファイルの CSS をプロジェクトのスタイルシート（例: `@layer components`）に取り込み、`className` で参照する。色は CSS 変数（`var(--color-*)`）経由で指定し、**HTML 属性の inline `style` は避ける**（`style-src` を strict 化した環境では適用されず CSP 違反になる）。

```tsx
// このファイルの .btn / .btn-primary CSS をスタイルシートに定義し、className で参照
const Button = ({ children, variant = 'primary', onClick }: Props) => (
  <button
    onClick={onClick}
    className={`btn ${variant === 'primary' ? 'btn-primary' : 'btn-outline'}`}
  >
    {children}
  </button>
);
```

**フォーカスリング（DADS標準）**: `outline: 4px solid #000; box-shadow: 0 0 0 2px #FDE047`（CSS の `:focus-visible` に適用する）

> このリポジトリ（devtools）で実装する場合のスタイリング規約・共通コンポーネント・focus 実装は、SKILL.md「11. このプロジェクト（devtools）で実装する場合」を参照（正本は `CLAUDE.md` §7 / `docs/ui-conventions.md`）。

---

> 上記に記載のないコンポーネントが必要な場合は、DADSの原則（カラー・タイポグラフィ・余白・角の形状・アクセシビリティ）に従って設計する。  
> DADSの全コンポーネント一覧はSKILL.mdのSection 10を参照。
