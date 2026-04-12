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
  --color-focus:       #2563EB;  /* フォーカスリング */
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
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
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
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
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
- [ ] フォーカスインジケーターが視覚的に明確
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

### React（Tailwind不使用・CSS変数版）の基本

ReactでTailwindを使わない場合は、上記CSS変数を`index.css`に定義し、コンポーネントから参照する。

Tailwind環境では、CSS変数の値をtailwind.config.jsのextendに設定して使用する。

---

## 10. このプロジェクト固有の実装パターン

> **重要**: このプロジェクトではCSS変数を直接使わず、TypeScriptの定数オブジェクトでトークンを管理している。

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

### styles.ts のトークン一覧

| トークン | 値 | 用途 |
|---|---|---|
| `colors.text` | `#111827` | 本文テキスト |
| `colors.muted` | `#6B7280` | ヒント・補足テキスト |
| `colors.primary` | `#1A56DB` | CTA・強調 |
| `colors.link` | `#2563EB` | リンク・フォーカスリング |
| `colors.bg` | `#ffffff` | 基本背景 |
| `colors.bgSurface` | `#F9FAFB` | カード・パネル背景 |
| `colors.bgSubtle` | `#F3F4F6` | ヘッダー・subtle背景 |
| `colors.border` | `#E5E7EB` | 区切り線・カード枠 |
| `colors.borderInput` | `#D1D5DB` | 入力欄の枠線 |
| `colors.error` | `#DC2626` | エラーテキスト・枠線 |
| `colors.errorBg` | `#FEF2F2` | エラー背景 |
| `colors.warning` | `#854D0E` | 警告テキスト（amber-800、コントラスト確保） |
| `colors.warningBg` | `#FEF3C7` | 警告背景 |
| `colors.success` | `#16A34A` | 成功テキスト |
| `colors.successBg` | `#F0FDF4` | 成功背景 |

### タイポグラフィスタイル

| 定数 | サイズ | weight | 用途 |
|---|---|---|---|
| `bodyEmphasis` | 17px | 700 | 強調本文・ラベル見出し |
| `caption` | 14px | 400 | UI制約のある小テキスト |
| `micro` | `caption` のエイリアス | — | ヒント・補足テキスト |

### Tailwind との使い分け

- **Tailwind**: レイアウト・余白・フレックス・グリッド（`flex`, `gap-4`, `rounded`, `space-y-4` 等）
- **`colors.*` インラインスタイル**: 色・フォント（Tailwindのカラークラスは使わない）

### フォーカスリング

```tsx
// インラインハンドラーでフォーカスリングを実装
const focusRingOn = (e: React.FocusEvent<HTMLElement>) => {
  e.target.style.outline = `2px solid ${colors.link}`;
  e.target.style.outlineOffset = '2px';
};
const focusRingOff = (e: React.FocusEvent<HTMLElement>) => {
  e.target.style.outline = 'none';
};

<input onFocus={focusRingOn} onBlur={focusRingOff} />
```
