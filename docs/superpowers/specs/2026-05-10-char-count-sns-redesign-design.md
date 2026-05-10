# 文字カウント SNS セクション再設計 — 設計書

**Date:** 2026-05-10
**Scope:** `src/components/tools/CharCount.tsx` SNS セクション + `src/utils/char-count/sns.ts`
**Issue:** [#376](https://github.com/fumtas1k/devtools/issues/376)

## 1. 背景

- 既存 SNS セクションは `0 / 280`, `0 / 300`, `0 / 280` を縦並び定義リストで表示
- 3 つの数値は計算方法が異なる (Twitter 独自 weight / 書記素 / 書記素) のに UI 上は同じ書式 → 単位混在の誤認を生む
- X (旧 Twitter) の weight 計算は簡易実装 (`cp <= 0x10FF ? 1 : 2`) で URL 短縮と weight ranges を未対応
- ツール全体が縦長と感じられる中、SNS セクションは情報密度が低く改善余地が大きい

## 2. ゴール

1. SNS セクションの **計算方法を視覚的に区別** する (Twitter weight / 書記素 を明示)
2. **進捗を視覚化** して上限超過を直感的に把握できるようにする
3. **横並びカード化** で SNS セクションの縦長を解消 (PC で 3 カラム、モバイルで縦積み)
4. X (Twitter) 文字数を **twitter-text 公式仕様** にほぼ準拠させる

## 3. 非対象 (Out of scope)

- 文字数 / エンコーディング互換性 / 行 / 原稿 セクションのレイアウト変更 → 別 issue/PR
- twitter-text 公式 npm パッケージの導入 (依存は最小化、自前実装)
- twitter-text の URL 正規化全仕様の再現 (IDN, cashtag, mention 数え分け等の周辺仕様)

## 4. UI 設計

### 4.1 レイアウト

PC (`md:` ブレイクポイント以上, 既存 Tailwind config 準拠):

```
+----------------+ +----------------+ +----------------+
| X (旧 Twitter) | | Bluesky        | | 任意上限       |
| Twitter weight | | 書記素 (grapheme)| | 書記素         |
|                | |                | |                |
|     0 / 280    | |     0 / 300    | |  0 / [ 280  ]  |
| [░░░░░░░░░░]   | | [░░░░░░░░░░]   | | [░░░░░░░░░░]   |
+----------------+ +----------------+ +----------------+
```

モバイル (`md:` 未満): 縦積み 1 カラム。

### 4.2 カード構造

各カード (`<article>`) は次の要素で構成する:

| 要素           | 内容                                                   | a11y                                           |
| -------------- | ------------------------------------------------------ | ---------------------------------------------- |
| サービス名     | "X (旧 Twitter)" / "Bluesky" / "任意上限"              | `<h3>`                                         |
| 計算方法ラベル | "Twitter weight" / "書記素 (grapheme)" / "書記素"      | `caption text-muted`                           |
| 数値           | `current / limit` (任意上限のみ limit が input)        | `font-mono`                                    |
| 進捗バー       | 0–100% グレー帯 + 100% 超えの赤帯                      | `role="progressbar"` + `aria-valuenow/min/max` |
| 補助ラベル     | 100% 未満は割合 (例 "71%")、100% 超は超過量 (例 "+30") | `caption text-muted` (超過時 `text-error`)     |

### 4.3 進捗バーの視覚仕様

- 100% 未満: 単一バー (`bg-active` 等の semantic token)、塗り幅 = `min(current/limit, 1) * 100%`
- 100% 超: 2 セグメント表示
  - 左: limit ぶんを 100% 塗り (グレー)
  - 右: `min((current - limit) / limit, 1) * 100%` ぶんを赤帯で連結 (オーバーフロー帯は最大 100%、それ以上の超過は数値ラベルで表現)
  - バー右端は `min-width` で +1px 程度のセパレータ視認性を確保
- バー高さ: 6–8px (caption 行と縦バランス)
- transition: width 200ms (ハンドルではなく fill のみ、パフォーマンス影響軽微)

### 4.4 上限超過時の挙動

- 数値 (`current`) を `text-error` 化 (既存挙動維持)
- 進捗バー右端に赤オーバーフロー帯
- 補助ラベル: `+{超過量} over` を赤字表示
- a11y: `aria-valuenow` は `min(current, limit)` で clamp (ARIA 仕様で valuenow > valuemax は不正)、`aria-valuemax` は `limit`、`aria-valuetext` で実数値とともに「上限超過」を通知 (既存 `sr-only` 維持)

### 4.5 計算方法ラベルの説明補助

各カード下部に **caption で 1 行説明** を表示する (tooltip 新規導入はスコープ外)。説明文の例:

| カード         | caption 文                          |
| -------------- | ----------------------------------- |
| X (旧 Twitter) | `URL を 23 字換算、CJK は 2 weight` |
| Bluesky        | `絵文字や合字も 1 文字として計上`   |
| 任意上限       | `書記素クラスタ単位で計上`          |

a11y: caption は `<p class="caption text-muted">` で表現し、`aria-describedby` で progressbar と関連付ける。

## 5. ロジック改修 (X 文字数)

### 5.1 twitter-text 公式仕様への準拠

`src/utils/char-count/sns.ts` の `twitterWeight()` を以下の手順に書き換える:

1. **trim**: 入力文字列の前後空白 (`\s` 相当) を除去
2. **URL 検出 + 置換**: URL に該当する箇所を `'X'.repeat(23)` (23 字 weight=1 のダミー) に置換
3. **weight 計算**: 残った文字列の各 code point について、以下を weight 1、それ以外を weight 2:
   - `U+0000–U+10FF`
   - `U+2000–U+200D`
   - `U+2010–U+201F`
   - `U+2032–U+2037`

### 5.2 URL 正規表現

twitter-text 公式は複雑な regex を持つが、本 PR では **広く採用される簡易 URL regex** を採用:

```
/(https?:\/\/[^\s<>"]+)/gi
```

trade-off:

- 一致率 ~95% (典型的な http/https URL はカバー、t.co の正規化や IDN ドメインは非対応)
- メンテナンス容易 / 依存ゼロ

twitter-text の `extractUrls()` 完全互換が必要になったら別 issue で `twitter-text` lib 採択を検討。

### 5.3 ラベル変更

`X (旧 Twitter) weight （概算）` → `X (旧 Twitter)` (カード上部) + `Twitter weight` (計算方法ラベル) + 既定値 `URL 検知込み` の小ラベル (オプション)。

「概算」は **削除**。実装後の精度は ~99% (URL regex 簡易性のみが残差) であり「概算」の語感より「Twitter 仕様準拠」の方が事実に近い。

## 6. ファイル構成

| ファイル                                            | 変更内容                                                  |
| --------------------------------------------------- | --------------------------------------------------------- |
| `src/components/tools/CharCount.tsx`                | SNS セクションを `<dl>` から `<div>` カードグリッドに変更 |
| `src/components/ui/ProgressBar.tsx` (新規)          | 汎用進捗バー (current/limit/labels/aria)                  |
| `src/utils/char-count/sns.ts`                       | `twitterWeight()` 書き換え、URL regex export              |
| `src/utils/char-count/__tests__/char-count.test.ts` | X 文字数の追加テストケース                                |
| `src/components/tools/__tests__/CharCount.test.tsx` | カード表示の追加テスト                                    |

## 7. テスト計画

### 7.1 ユニットテスト (`sns.ts`)

twitter-text 公式 conformance YAML から代表的なケースを抜粋し fixture 化:

| ケース               | 入力                            | 期待 weight                         |
| -------------------- | ------------------------------- | ----------------------------------- |
| 純 ASCII             | "Hello world"                   | 11                                  |
| 純 CJK               | "日本語"                        | 6                                   |
| URL 単体             | "https://example.com"           | 23                                  |
| URL + テキスト       | "Check https://example.com out" | 33 ("Check "=6 + URL=23 + " out"=4) |
| 前後空白             | " hello "                       | 5                                   |
| 改行                 | "a\nb"                          | 3                                   |
| weight-1 punctuation | "—" (U+2014)                    | 1                                   |

実装時に twitter-text の validate.yml 該当部分を抜粋して数値を確定する。

### 7.2 ユニットテスト (`CharCount.test.tsx`)

- カード 3 枚の rendering
- 上限超過時の `text-error` クラス付与
- `aria-valuenow/min/max` 設定
- 任意上限 input の操作

### 7.3 E2E (`tests/e2e/`)

UI 変更につき:

- PC (1280×800) でカード横並び確認
- モバイル (390×844) で縦積み確認
- 上限超過時のオーバーフロー帯描画確認
- VRT baseline は CI Linux runner で再生成 (mac local は不可)

### 7.4 ガード / 陽性対照

X 文字数の正確性向上は「validator」ではなく「計算精度向上」のため `test-gates` skill 対象外。通常のユニットテストで網羅。

## 8. 既存テスト・VRT への影響

- **既存テスト**: `twitterWeight()` の戻り値が一部入力 (URL 含む文章、前後空白あり) で変化 → 既存テストケースの期待値を更新
- **VRT baseline**: `/tools/char-count` の baseline は SNS セクション再設計で必ず変化。CI workflow_dispatch で baseline を再生成
- **a11y**: `role="progressbar"` 追加、`aria-valuenow/min/max` 追加。既存 `aria-live="polite"` は Section に維持

## 9. リスクと未解決事項

| リスク                                                        | 影響              | 緩和                                                                                |
| ------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| URL 正規表現の edge case で誤検知                             | X weight 計算誤差 | conformance テストの URL バリエーションでカバー、必要に応じて regex 調整            |
| カード化で 1280×800 以外の中間幅 (768–1024px) で 3 カラム窮屈 | UX 低下           | `md:` (768px) でなく `lg:` (1024px) ブレイクポイント検討 → 実装時に DevTools で確認 |
| VRT baseline 更新でレビューが大きくなる                       | レビュー負荷      | baseline 更新コミットを feature コミットと分離                                      |

## 10. PR スコープ

**1 PR で完結**:

- SNS UI 再設計 + ProgressBar 新規コンポーネント + X 文字数ロジック改修 + テスト + VRT baseline

予想差分: ~300 行 (実装 ~150 + テスト ~80 + baseline ~70)。本 SoT を達成しつつ review 単位として分割不要。
