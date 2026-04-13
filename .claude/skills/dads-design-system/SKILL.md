---
name: dads-design-system
description: デジタル庁デザインシステム（DADS）準拠でウェブサイトやウェブアプリを作成するスキル。青基調のカラー、Noto Sans JP、アクセシビリティ対応コンポーネントを含む。サイト作成、ランディングページ、ダッシュボード、フォーム画面などを作る際に使用すること。「デジタル庁」「DADS」「青基調」「日本語サイト」等でもトリガーする。
---

# デジタル庁デザインシステム（DADS）スキル

デジタル庁デザインシステムβ版（v2.12.0）に基づくデザインガイドライン。
「誰一人取り残されない、人に優しいデジタル化を。」を実現するためのデザインアセット。

**参照元**: https://design.digital.go.jp/dads/

## クイックスタート

このスキルを使用する際は、以下の順序で参照ファイルを読む:

1. このSKILL.md（カラー・タイポグラフィ・余白・角の形状の基本仕様）
2. `references/components.md`（コンポーネントの実装パターン）

---

## 1. カラーシステム（青基調）

### キーカラー（Blue）

プライマリーカラーを青に設定。同一色相で明度違いのセカンダリー・ターシャリーを展開する。

```css
:root {
  /* === キーカラー（Blue） === */
  --color-primary:       #1A56DB;  /* プライマリー: CTA、ヘッダー、主要UI */
  --color-secondary:     #3B82F6;  /* セカンダリー: 副次UI、選択肢ボタン */
  --color-tertiary:      #0E3293;  /* ターシャリー: 濃い強調、ダークUI */
  --color-background:    #EFF6FF;  /* バックグラウンド: セクション背景 */

  /* === プリミティブカラー Blue 13階調 === */
  --blue-50:  #EFF6FF;
  --blue-100: #DBEAFE;
  --blue-200: #BFDBFE;
  --blue-300: #93C5FD;
  --blue-400: #60A5FA;
  --blue-500: #3B82F6;
  --blue-600: #2563EB;
  --blue-700: #1D4ED8;
  --blue-800: #1E40AF;
  --blue-900: #1E3A8A;
  --blue-950: #172554;

  /* === ニュートラルカラー（共通カラー） === */
  --neutral-white:   #FFFFFF;
  --neutral-gray-50: #F9FAFB;
  --neutral-gray-100:#F3F4F6;
  --neutral-gray-200:#E5E7EB;
  --neutral-gray-300:#D1D5DB;
  --neutral-gray-400:#9CA3AF;  /* 白背景で非テキスト3:1確保 */
  --neutral-gray-500:#6B7280;  /* 白背景でテキスト4.5:1確保 */
  --neutral-gray-600:#4B5563;
  --neutral-gray-700:#374151;
  --neutral-gray-800:#1F2937;
  --neutral-gray-900:#111827;
  --neutral-black:   #000000;

  /* === セマンティックカラー === */
  --color-success:     #16A34A;  /* サクセス（緑） */
  --color-success-bg:  #F0FDF4;
  --color-error:       #DC2626;  /* エラー（赤） */
  --color-error-bg:    #FEF2F2;
  --color-warning:     #854D0E;  /* 警告テキスト（amber-800）※ amber-600 は白背景で3.3:1しか出ず WCAG AA 不合格のため暗くする */
  --color-warning-bg:  #FEF3C7; /* 警告背景（amber-100） */

  /* === 機能カラー === */
  --color-link:        #2563EB;  /* リンクテキスト（青） */
  --color-link-visited:#7C3AED;  /* 訪問済みリンク（紫、赤み追加で青と区別） */
  --color-focus-outline: #000000;  /* フォーカスリング: アウトライン（黒） */
  --color-focus-ring:    #FFD43D;  /* フォーカスリング: リング（DADS yellow-300） */
}
```

### コントラスト比の必須ルール

- テキストと背景: **4.5:1以上**
- 非テキスト要素（アイコン、枠線）と背景: **3:1以上**
- セマンティックカラーは色相を保ったまま明度・彩度を調整可能
- 色だけで情報を伝えない（テキスト・アイコン・下線等を併用）

### ボタンのステートカラー（Blue基調）

```css
.btn-primary {
  background: var(--color-primary);
  color: var(--neutral-white);
}
.btn-primary:hover {
  background: var(--blue-800);  /* やや暗い */
}
.btn-primary:active {
  background: var(--blue-900);  /* さらに暗い */
}
.btn-primary:focus-visible {
  outline: 4px solid var(--color-focus-outline);
  outline-offset: 2px;
  box-shadow: 0 0 0 2px var(--color-focus-ring);
}
```

---

## 2. タイポグラフィ

### フォントファミリー

```css
body {
  font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, sans-serif;
}
code, pre {
  font-family: 'Noto Sans Mono', monospace;
}
```

**CDN読み込み例**:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=Noto+Sans+Mono:wght@400;700&display=swap" rel="stylesheet">
```

### 太さレベル

| レベル | font-weight | 用途 |
|--------|------------|------|
| N (Normal) | 400 | 本文、通常テキスト |
| B (Bold)   | 700 | 見出し、強調 |

### テキストスタイル体系

スタイル名の構造: `{種別}-{サイズ}{太さ}-{行高}`（例: `Std-17N-170`）

#### Standard (Std) — 最も多用するスタイル

| 用途 | サイズ | 太さ | 行高 | letter-spacing |
|------|--------|------|------|----------------|
| 大見出し | 45px | B | 140% | 0 |
| 見出しH1 | 32px | B | 150% | 0.01em |
| 見出しH2 | 26px | B | 150% | 0.02em |
| 見出しH3 | 22px | B | 150% | 0.02em |
| 見出しH4 | 18px | B | 160% | 0.02em |
| 本文 | 16–17px | N | 170% | 0.02em |

#### Display (Dsp) — ヒーロー・キービジュアル

| サイズ | 太さ | 行高 | letter-spacing |
|--------|------|------|----------------|
| 64px | B/N | 140% | 0 |
| 57px | B/N | 140% | 0 |
| 48px | B/N | 140% | 0 |

#### Dense (Dns) — 管理画面・データテーブル

| サイズ | 太さ | 行高 | letter-spacing |
|--------|------|------|----------------|
| 17px | B/N | 120–130% | 0 |
| 16px | B/N | 120–130% | 0 |
| 14px | B/N | 120–130% | 0 |

#### Oneline (Oln) — UIパーツ内テキスト

| サイズ | 太さ | 行高 | letter-spacing |
|--------|------|------|----------------|
| 17px | B/N | 100% | 0.02em |
| 16px | B/N | 100% | 0.02em |
| 14px | B/N | 100% | 0.02em |

### フォントサイズの原則

- 本文・UIは **16px以上** を基準
- **14px** はフッターや領域制約がある場合のみ限定使用
- **14px未満は使用禁止**

---

## 3. 余白（Spacing）

### 基準単位

基準単位は **8px**。余白スケールは基準の倍率で構成:

```css
:root {
  --space-1:  4px;   /* 0.5倍: 微小余白 */
  --space-2:  8px;   /* 1倍: 基準 */
  --space-3:  12px;  /* 1.5倍 */
  --space-4:  16px;  /* 2倍 */
  --space-5:  24px;  /* 3倍: セクション内区切り */
  --space-6:  32px;  /* 4倍 */
  --space-7:  48px;  /* 6倍 */
  --space-8:  64px;  /* 8倍: セクション間 */
  --space-9:  96px;  /* 12倍 */
  --space-10: 128px; /* 16倍: ページセクション間 */
}
```

### 余白設計の原則

1. **関連性**: 関連する要素は近く、関連の薄い要素は遠くに配置
2. **階層**: 上位階層ほど大きな余白を付与（H1 > H2 > H3...）
3. **一貫性**: 同種の要素には同じ余白値を使用
4. **レスポンシブ**: 画面サイズに応じて余白をスケーリング

---

## 4. 角の形状（Corner Shapes）

5段階のスタイルを基本とする:

```css
:root {
  --radius-none:   0px;    /* 角丸なし */
  --radius-sm:     4px;    /* スモール: インプット、チップ */
  --radius-md:     8px;    /* ミディアム: カード、パネル */
  --radius-lg:     16px;   /* ラージ: モーダル、大型カード */
  --radius-full:   9999px; /* フル: アバター、ピル型ボタン */
}
```

### 適用ガイドライン

- 小さいコンポーネントほど角丸の視覚的印象が強くなるため、コンポーネントサイズに応じて調整
- 特定の角だけに角丸を適用するパターンもあり（タブの上角のみ等）
- サイト全体で角丸スタイルの一貫性を維持

---

## 5. レイアウト

### ブレークポイント

```css
/* モバイルファースト */
/* SM: 0–599px   （モバイル） */
/* MD: 600–904px （タブレット） */
/* LG: 905–1239px（小型デスクトップ） */
/* XL: 1240px〜  （デスクトップ） */
```

### コンテンツ幅

最大コンテンツ幅: **1120px**（標準）
サイドパディング: **16px**（モバイル） / **24px**（タブレット以上）

---

## 6. リンクテキスト

```css
a {
  color: var(--color-link);
  text-decoration: underline;
}
a:visited {
  color: var(--color-link-visited);
}
a:hover {
  text-decoration: none; /* or underline維持 */
}
a:focus-visible {
  outline: 4px solid var(--color-focus-outline);
  outline-offset: 2px;
  box-shadow: 0 0 0 2px var(--color-focus-ring);
}
```

- リンクは色 **＋** 下線で表現（色だけに頼らない）
- 訪問済みリンクは紫（赤み追加で青との識別性を向上）

---

## 7. エレベーション（影）

```css
:root {
  --elevation-1: 0 1px 2px rgba(0, 0, 0, 0.05);
  --elevation-2: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
  --elevation-3: 0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06);
  --elevation-4: 0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
  --elevation-5: 0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04);
}
```

---

## 8. アクセシビリティ チェックリスト

サイト作成時に必ず確認:

- [ ] テキストコントラスト比 4.5:1以上
- [ ] 非テキストUI要素のコントラスト比 3:1以上
- [ ] フォーカスインジケーターが視覚的に明確（黒アウトライン4px＋黄色リング）
- [ ] 色だけで情報を伝えていない
- [ ] フォントサイズ14px以上（16px以上推奨）
- [ ] タッチターゲット 44×44px以上
- [ ] 適切なセマンティックHTML（header, nav, main, footer）
- [ ] aria-label / aria-describedby を適切に使用
- [ ] キーボードで全操作可能
- [ ] line-height 1.5以上（本文）

---

## 9. HTML/Reactテンプレートパターン

コンポーネントの実装詳細は `references/components.md` を参照。

### 基本的なページ構造（HTML）

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ページタイトル</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
  <header><!-- ヘッダーコンテナ --></header>
  <nav aria-label="パンくずリスト"><!-- パンくず --></nav>
  <main>
    <h1>ページ見出し</h1>
    <!-- コンテンツ -->
  </main>
  <footer><!-- フッター --></footer>
</body>
</html>
```

### フォーカスリング（DADS標準）

DADS標準のフォーカスリングは **黒アウトライン4px＋黄色リング（yellow-300）**。  
公式コンポーネント（Button.tsx）の実装から確認済み。

```tsx
// Tailwind クラスで実装する場合（@digital-go-jp/tailwind-theme-plugin 必須）
// tailwind-theme-plugin の yellow-300 = #FFD43D（標準Tailwindの #FDE047 とは異なる）
<button className="focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300">
  ボタン
</button>
```

```css
/* CSS で直接書く場合 */
:focus-visible {
  outline: 4px solid #000000;
  outline-offset: 0.125rem;
  box-shadow: 0 0 0 0.125rem #FFD43D; /* DADS yellow-300 */
}
```

> このプロジェクト固有の実装（青フォーカスリング）については「11. このプロジェクト固有の実装パターン」を参照。

---

## 10. コードスニペットライブラリ（npm）

デジタル庁が公式に提供する React コンポーネントのサンプル集。

- **GitHub**: https://github.com/digital-go-jp/design-system-example-components-react
- **Storybook**: https://design.digital.go.jp/dads/react/
- **パッケージ**: `@digital-go-jp/design-system-example-components-react` (MIT, v2.7.0)

> ⚠️ "コードスニペット集" であり完成品ライブラリではない。プロジェクトの要件に合わせて自由に拡張して使うことが前提（README明記）。

### 前提依存

```sh
npm install @digital-go-jp/design-system-example-components-react \
            @digital-go-jp/tailwind-theme-plugin \
            react-aria-components
```

```js
// tailwind.config.js
const dadsPlugin = require('@digital-go-jp/tailwind-theme-plugin');
module.exports = {
  plugins: [dadsPlugin],
};
```

`@digital-go-jp/tailwind-theme-plugin` が Tailwind に DADS 独自トークン（`text-blue-900`・`text-solid-gray-600`・`text-oln-16B-100` 等）を追加する。標準 Tailwind とは別のカラーネームスペースになる点に注意。

### 利用可能なコンポーネント（35種）

| カテゴリ | コンポーネント |
|---|---|
| フォーム | Input, Textarea, Label, Checkbox, Radio, Select, FileUpload |
| フォームヘルパー | ErrorText, SupportText, RequirementBadge, Legend |
| ボタン | Button（solid-fill / outline / text × lg/md/sm/xs） |
| ナビゲーション | Breadcrumbs, HamburgerMenuButton, LanguageSelector |
| バッジ・ラベル | StatusBadge, ChipLabel |
| 通知 | NotificationBanner, EmergencyBanner |
| レイアウト | Divider, Dl, List, Blockquote, Table |
| コンテンツ | Accordion, Disclosure, Drawer, Carousel |
| 日付 | Calendar, DatePicker, SeparatedDatePicker |
| テキスト | Heading, Link, UtilityLink |
| ユーティリティ | Slot（asChild パターン） |

Calendar・DatePicker・Carousel 等の複雑なインタラクションは内部で `react-aria-components` を使用。

### 使用例

```tsx
import {
  Button, Input, Label, ErrorText, SupportText
} from '@digital-go-jp/design-system-example-components-react';

// フォームフィールド
<div className="flex flex-col gap-2">
  <Label htmlFor="email">メールアドレス <RequirementBadge>必須</RequirementBadge></Label>
  <SupportText>登録済みのメールアドレスを入力してください</SupportText>
  <Input id="email" type="email" isError={hasError} />
  {hasError && <ErrorText>有効なメールアドレスを入力してください</ErrorText>}
</div>

// ボタン
<Button size="md" variant="solid-fill">送信する</Button>
<Button size="md" variant="outline">キャンセル</Button>
```

### 未実装コンポーネントへの対応

このライブラリにないコンポーネントは:
1. `react-aria-components` を使って実装（アクセシビリティを保証）
2. [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/patterns/) を参考にスクラッチ実装

---

## 11. このプロジェクト固有の実装パターン

### カラー管理の構造

色の実値は `src/styles/global.css` の CSS 変数で一元管理。
`src/utils/styles.ts` の `colors` オブジェクトは `var(--color-*)` の参照のみを持つ。

```
global.css (@theme / :root) ← 実際の色値はここだけ
    ↑
styles.ts (colors.*)        ← var(--color-*) 参照
    ↑
各コンポーネント             ← colors.* を import して使う
```

**ダークモード追加時は `global.css` に `.dark { }` を追加するだけでよい。コンポーネントは変更不要。**

### カラー・タイポグラフィの参照方法

```tsx
// ✅ 正しい: styles.ts のトークンを使う
import { colors, caption, bodyEmphasis } from '../../utils/styles';

<p style={{ ...caption, color: colors.muted }}>ヒントテキスト</p>
<span style={{ ...bodyEmphasis, color: colors.primary }}>強調テキスト</span>
<input style={{ border: `1px solid ${colors.borderInput}` }} />
```

```tsx
// ❌ 誤り: 生のhex値を直書きしない
<p style={{ color: '#6B7280' }}>ヒントテキスト</p>
```

> **注意**: JsBarcode・bwip-js 等のサードパーティレンダラーに渡す色は CSS 変数を解釈できないため hex で直書きする（例: `background: '#ffffff'`）。

### styles.ts のトークン一覧

| トークン | CSS 変数 | 用途 |
|---|---|---|
| `colors.text` | `--color-text` | 本文テキスト |
| `colors.muted` | `--color-muted` | ヒント・補足テキスト |
| `colors.primary` | `--color-primary` | CTA・強調 |
| `colors.primaryBg` | `--color-background` | セクション背景（blue-50相当） |
| `colors.link` | `--color-link` | リンク・このプロジェクトの青フォーカスリング |
| `colors.bg` | `--color-bg` | 基本背景 |
| `colors.bgSurface` | `--color-bg-surface` | カード・パネル背景 |
| `colors.bgSubtle` | `--color-bg-subtle` | ヘッダー・subtle背景 |
| `colors.border` | `--color-border` | 区切り線・カード枠 |
| `colors.borderInput` | `--color-border-input` | 入力欄の枠線 |
| `colors.error` | `--color-error` | エラー枠線 |
| `colors.errorText` | `--color-error-text` | エラーテキスト |
| `colors.errorBg` | `--color-error-bg` | エラー背景 |
| `colors.warning` | `--color-warning` | 警告テキスト（amber-800、WCAG AA 確保） |
| `colors.warningBg` | `--color-warning-bg` | 警告背景 |
| `colors.success` | `--color-success` | 成功テキスト |
| `colors.successBg` | `--color-success-bg` | 成功背景 |

### タイポグラフィスタイル

| 定数 | サイズ | weight | 用途 |
|---|---|---|---|
| `bodyEmphasis` | 17px | 700 | 強調本文・ラベル見出し |
| `caption` | 14px | 400 | UI制約のある小テキスト |
| `micro` | `caption` のエイリアス | — | ヒント・補足テキスト |

### Tailwind との使い分け

- **Tailwind**: レイアウト・余白・フレックス・グリッド（`flex`, `gap-4`, `rounded`, `space-y-4` 等）
- **`colors.*` インラインスタイル**: 色（Tailwindのカラークラスは使わない）

### フォーカスリング（このプロジェクト固有）

> ⚠️ **DADS標準との差分**: DADS本来は「黒アウトライン4px＋黄色リング」だが、このプロジェクトは採用前に青フォーカスリングを実装済みのため変更していない。

このプロジェクトでは `onFocusRing` / `onBlurRing` を `src/utils/styles.ts` からインポートして使う。`InputField` コンポーネントを使う場合は内部で処理されるため不要。

```tsx
import { onFocusRing, onBlurRing } from '../../utils/styles';

// InputField を使わない生の <input> にのみ付与する
<input onFocus={onFocusRing} onBlur={onBlurRing} />
```

### 共通 UI コンポーネント（`src/components/ui/`）

新規ツール作成時はこれらを使うこと。生の `<input>` / `<textarea>` / エラー `<p>` は原則使わない。

| コンポーネント | ファイル | 用途 |
|---|---|---|
| `InputField` | `ui/InputField.tsx` | label・input または textarea・error/hint・サンプルボタンを統合。`multiline` `mono` `resize` `readOnly` 等のプロパティあり |
| `ErrorMessage` | `ui/ErrorMessage.tsx` | `role="alert"` 付きエラー表示。`id` を渡すと `aria-describedby` と連動 |
| `DownloadButtonGroup` | `ui/DownloadButtonGroup.tsx` | SVG/PNGダウンロードボタンペア。`onDownloadPng` は省略可 |
| `CopyButton` | `ui/CopyButton.tsx` | クリップボードコピー。`compact` プロパティでアイコンのみ表示（テーブル行内用） |
| `ToggleGroup<T>` | `ui/ToggleGroup.tsx` | モード切替タブ UI。`options`・`value`・`onChange`・`ariaLabel` を受け取るジェネリックコンポーネント |

```tsx
import { InputField } from '../ui/InputField';
import { DownloadButtonGroup } from '../ui/DownloadButtonGroup';
import { ErrorMessage } from '../ui/ErrorMessage';
import { CopyButton } from '../ui/CopyButton';
import { ToggleGroup } from '../ui/ToggleGroup';
```

### 共通フック（`src/hooks/`）

| フック | ファイル | 用途 |
|---|---|---|
| `useClampedInput` | `hooks/useClampedInput.ts` | 数値入力の min/max クランプ処理。`{ value, inputStr, handleChange, handleBlur }` を返す |

```tsx
import { useClampedInput } from '../../hooks/useClampedInput';

const { value: count, inputStr: countInput, handleChange, handleBlur } = useClampedInput(10, 1, 100);
```

