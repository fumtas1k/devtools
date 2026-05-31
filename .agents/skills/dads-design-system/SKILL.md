---
name: dads-design-system
description: このプロジェクト（devtools）のフロントエンド UI を作成・変更する際に参照する、デジタル庁デザインシステム（DADS）ベースのデザイン規約。青基調カラー・Noto Sans JP・余白/角丸スケール・アクセシビリティ対応コンポーネント（ボタン/入力/テーブル/通知バナー等）の実装パターンを含む。新しいツールの追加、既存ツール画面の UI 変更、入力欄・ボタン・フォームのスタイル実装、配色・タイポグラフィの判断が必要なときに使うこと。DADS / 青基調 等でもトリガー。
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
  --color-primary: #1a56db; /* プライマリー: CTA、ヘッダー、主要UI */
  --color-secondary: #3b82f6; /* セカンダリー: 副次UI、選択肢ボタン */
  --color-tertiary: #0e3293; /* ターシャリー: 濃い強調、ダークUI */
  --color-background: #eff6ff; /* バックグラウンド: セクション背景 */

  /* === プリミティブカラー Blue 13階調 === */
  --blue-50: #eff6ff;
  --blue-100: #dbeafe;
  --blue-200: #bfdbfe;
  --blue-300: #93c5fd;
  --blue-400: #60a5fa;
  --blue-500: #3b82f6;
  --blue-600: #2563eb;
  --blue-700: #1d4ed8;
  --blue-800: #1e40af;
  --blue-900: #1e3a8a;
  --blue-950: #172554;

  /* === ニュートラルカラー（共通カラー） === */
  --neutral-white: #ffffff;
  --neutral-gray-50: #f9fafb;
  --neutral-gray-100: #f3f4f6;
  --neutral-gray-200: #e5e7eb;
  --neutral-gray-300: #d1d5db;
  --neutral-gray-400: #9ca3af; /* 白背景で非テキスト3:1確保 */
  --neutral-gray-500: #6b7280; /* 白背景でテキスト4.5:1確保 */
  --neutral-gray-600: #4b5563;
  --neutral-gray-700: #374151;
  --neutral-gray-800: #1f2937;
  --neutral-gray-900: #111827;
  --neutral-black: #000000;

  /* === セマンティックカラー === */
  --color-success: #16a34a; /* サクセス（緑） */
  --color-success-bg: #f0fdf4;
  --color-error: #dc2626; /* エラー（赤） */
  --color-error-bg: #fef2f2;
  --color-warning: #854d0e; /* 警告テキスト（amber-800）※ amber-600 は白背景で3.3:1しか出ず WCAG AA 不合格のため暗くする */
  --color-warning-bg: #fef3c7; /* 警告背景（amber-100） */

  /* === 機能カラー === */
  --color-link: #2563eb; /* リンクテキスト（青） */
  --color-link-visited: #7c3aed; /* 訪問済みリンク（紫、赤み追加で青と区別） */
  --color-focus-outline: #000000; /* フォーカスリング: アウトライン（黒） */
  --color-focus-ring: #ffd43d; /* フォーカスリング: リング（DADS yellow-300） */
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
  background: var(--blue-800); /* やや暗い */
}
.btn-primary:active {
  background: var(--blue-900); /* さらに暗い */
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
  font-family:
    'Noto Sans JP',
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
}
code,
pre {
  font-family: 'Noto Sans Mono', monospace;
}
```

**CDN読み込み例**:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link
  href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=Noto+Sans+Mono:wght@400;700&display=swap"
  rel="stylesheet"
/>
```

### 太さレベル

| レベル     | font-weight | 用途               |
| ---------- | ----------- | ------------------ |
| N (Normal) | 400         | 本文、通常テキスト |
| B (Bold)   | 700         | 見出し、強調       |

### テキストスタイル体系

スタイル名の構造: `{種別}-{サイズ}{太さ}-{行高}`（例: `Std-17N-170`）

#### Standard (Std) — 最も多用するスタイル

| 用途     | サイズ  | 太さ | 行高 | letter-spacing |
| -------- | ------- | ---- | ---- | -------------- |
| 大見出し | 45px    | B    | 140% | 0              |
| 見出しH1 | 32px    | B    | 150% | 0.01em         |
| 見出しH2 | 26px    | B    | 150% | 0.02em         |
| 見出しH3 | 22px    | B    | 150% | 0.02em         |
| 見出しH4 | 18px    | B    | 160% | 0.02em         |
| 本文     | 16–17px | N    | 170% | 0.02em         |

#### Display (Dsp) — ヒーロー・キービジュアル

| サイズ | 太さ | 行高 | letter-spacing |
| ------ | ---- | ---- | -------------- |
| 64px   | B/N  | 140% | 0              |
| 57px   | B/N  | 140% | 0              |
| 48px   | B/N  | 140% | 0              |

#### Dense (Dns) — 管理画面・データテーブル

| サイズ | 太さ | 行高     | letter-spacing |
| ------ | ---- | -------- | -------------- |
| 17px   | B/N  | 120–130% | 0              |
| 16px   | B/N  | 120–130% | 0              |
| 14px   | B/N  | 120–130% | 0              |

#### Oneline (Oln) — UIパーツ内テキスト

| サイズ | 太さ | 行高 | letter-spacing |
| ------ | ---- | ---- | -------------- |
| 17px   | B/N  | 100% | 0.02em         |
| 16px   | B/N  | 100% | 0.02em         |
| 14px   | B/N  | 100% | 0.02em         |

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
  --space-1: 4px; /* 0.5倍: 微小余白 */
  --space-2: 8px; /* 1倍: 基準 */
  --space-3: 12px; /* 1.5倍 */
  --space-4: 16px; /* 2倍 */
  --space-5: 24px; /* 3倍: セクション内区切り */
  --space-6: 32px; /* 4倍 */
  --space-7: 48px; /* 6倍 */
  --space-8: 64px; /* 8倍: セクション間 */
  --space-9: 96px; /* 12倍 */
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
  --radius-none: 0px; /* 角丸なし */
  --radius-sm: 4px; /* スモール: インプット、チップ */
  --radius-md: 8px; /* ミディアム: カード、パネル */
  --radius-lg: 16px; /* ラージ: モーダル、大型カード */
  --radius-full: 9999px; /* フル: アバター、ピル型ボタン */
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
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ページタイトル</title>
    <link
      href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap"
      rel="stylesheet"
    />
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
  box-shadow: 0 0 0 0.125rem #ffd43d; /* DADS yellow-300 */
}
```

> このリポジトリ（devtools）の focus 実装は `:focus-visible` に CSS で一括適用されている（`var(--focus-ring)`、JS ハンドラ不要）。プロジェクト固有の規約は「11. このプロジェクト（devtools）で実装する場合」を参照。

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

| カテゴリ         | コンポーネント                                              |
| ---------------- | ----------------------------------------------------------- |
| フォーム         | Input, Textarea, Label, Checkbox, Radio, Select, FileUpload |
| フォームヘルパー | ErrorText, SupportText, RequirementBadge, Legend            |
| ボタン           | Button（solid-fill / outline / text × lg/md/sm/xs）         |
| ナビゲーション   | Breadcrumbs, HamburgerMenuButton, LanguageSelector          |
| バッジ・ラベル   | StatusBadge, ChipLabel                                      |
| 通知             | NotificationBanner, EmergencyBanner                         |
| レイアウト       | Divider, Dl, List, Blockquote, Table                        |
| コンテンツ       | Accordion, Disclosure, Drawer, Carousel                     |
| 日付             | Calendar, DatePicker, SeparatedDatePicker                   |
| テキスト         | Heading, Link, UtilityLink                                  |
| ユーティリティ   | Slot（asChild パターン）                                    |

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

## 11. このプロジェクト（devtools）で実装する場合

DADS の汎用仕様（1〜10章）に加えて devtools 固有のスタイリング規約があるが、**本スキルでは重複管理しない**。以前はここに旧実装（`src/utils/styles.ts` の `colors.*` + inline `style`）を記載していたが、issue #176 B 案で全廃され `styles.ts` も削除されたのに記述が残って陳腐化した。正本を一本化してドリフトを防ぐため、以下を直接参照すること:

| 知りたいこと                                                                                                          | 正本                                                                              |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 色・スタイリング規約（`@layer components` semantic class 経由、primitive scale 直書き禁止、HTML inline `style` 禁止） | `CLAUDE.md` §7                                                                    |
| 共通 UI コンポーネント（`InputField` / `CopyButton` / `DownloadButtonGroup` / `ToggleGroup` / `ErrorMessage` 等）     | `.agents/rules/ui-conventions.md` §1、`CLAUDE.md` §5・§8                          |
| ツール追加の実装フロー                                                                                                | `CLAUDE.md` §5                                                                    |
| `style-src` strict 化（`unsafe-inline` 撤去）の経緯と CSP 制約                                                        | `docs/projects/issue-176-b-plan-progress.md`、`docs/decisions.md [064][067][068]` |

> ⚠️ **使ってはいけない旧パターン**:
>
> - `import { colors, onFocusRing, onBlurRing } from '../../utils/styles'` — `styles.ts` は削除済みでビルドエラーになる。
> - `style={{ color: ... }}` 等の HTML inline `style` — `style-src` が strict（`public/_headers`）なため**適用されず CSP 違反**になる。
>
> 色は `global.css` の semantic class（`text-muted` / `alert-error` / `bg-subtle` 等）か `@theme` auto-utility（`text-primary` 等）で指定する。focus は `:focus-visible` に CSS 一括適用済み（`var(--focus-ring)`）で JS ハンドラ不要。
