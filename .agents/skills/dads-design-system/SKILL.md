---
name: dads-design-system
description: このプロジェクト（devtools）のフロントエンド UI を作成・変更する際に参照する、デジタル庁デザインシステム（DADS v2）準拠のデザイン規約。Claude Design 上の DADS デザインシステムを正本とし、カラー・Noto Sans JP・4px グリッド・角丸・二重フォーカスリング・ボタン/入力/通知バナー/テーブル等の仕様と、本リポジトリ固有の制約（CSP・自前フォント・semantic token 経由）をまとめる。新しいツールの追加、既存ツール画面の UI 変更、配色・タイポグラフィ・コンポーネントの見た目の判断が必要なときに使うこと。DADS / デザインシステム / 青基調 等でもトリガー。
---

# DADS デザインシステム（devtools 版）

## 0. 正本と移行状況

- **正本**: Claude Design のデザインシステム「デジタル庁デザインシステム DADS」<https://claude.ai/artifact/EtVbTVMBx7yd6FJ1SAwrAh>（DADS 公式の `digital-go-jp/design-tokens` と `design-system-example-components-react` からの転記）。値に迷ったら公式 `figma/tokens.json` を確認する。
- **移行中**: `src/styles/global.css` のトークンは、まだ DADS 以前の値（Tailwind パレット由来）が残っている。段階移行の計画と進捗は `docs/superpowers/plans/2026-10-30-claude-design-dads-migration.md`。
- 新規コードは **semantic token / 意味クラス経由**で色・角丸・影を指定する（`.agents/rules/common.md` 7 章）。トークンの値は移行フェーズで差し替わるので、DADS の hex をコンポーネントに直書きしない。
- DADS の目標値（プリミティブ全色）は `references/tokens.md`、コンポーネントの見た目仕様は `references/components.md`。

## 1. 原則

- 静かで予測可能な見た目。装飾で作業を邪魔しない。グラデーションは hero の `blue-50 → white` だけ、テクスチャ・パターン・絵文字は使わない。
- 色だけで情報を伝えない。hover はボタン・リンクとも**下線を足す**（色の変化だけにしない）。
- コントラストは文字 4.5:1、非テキスト（枠線・アイコン・フォーカスリング）3:1 以上。

## 2. カラー

キーカラーは Blue の 1 色だけ。他の色相（cyan / green / lime / yellow / orange / red / magenta / purple / light-blue）はチップ・タグ・データ・状態表示に限って控えめに使う。

| 用途                | DADS トークン                                        | 値                    |
| :------------------ | :--------------------------------------------------- | :-------------------- |
| primary（塗り）     | `blue-900`                                           | `#0017c1`             |
| primary hover       | `blue-1000`                                          | `#00118f`             |
| primary active      | `blue-1200`                                          | `#000060`             |
| リンク / visited    | `blue-1000` / `magenta-900`                          | `#00118f` / `#8b008b` |
| 本文 / 見出し       | `solid-gray-800` / `solid-gray-900`                  | `#333333` / `#1a1a1a` |
| 補助テキスト        | `solid-gray-700`                                     | `#4d4d4d`             |
| placeholder         | `solid-gray-536`（白地 AA の下限）                   | `#767676`             |
| 入力欄の枠          | `solid-gray-600`                                     | `#666666`             |
| 区切り線 / 薄い枠   | `solid-gray-420` / `solid-gray-100`                  | `#949494` / `#e6e6e6` |
| 薄い背景            | `solid-gray-50`                                      | `#f2f2f2`             |
| success 塗り / 文字 | `success-1`（green-600）/ `success-2`（green-800）   | `#259d63` / `#197a4b` |
| error 塗り / 文字   | `error-1`（red-800）/ `error-2`（red-900）           | `#ec0000` / `#ce0000` |
| warning（黄）       | `warning-yellow-1`（yellow-700）/ `-2`（yellow-900） | `#b78f00` / `#927200` |
| warning（橙）       | `warning-orange-1`（orange-600）/ `-2`（orange-800） | `#fb5b01` / `#c74700` |

セマンティック色は「塗り」と「文字」の 2 段ペアで使い、どちらもコントラストを満たす組を選ぶ。visited の色は DS 内で `magenta-800` と `magenta-900` が混在しているため、移行時に公式値で確定する。

## 3. フォーカスリング

DADS の象徴。全インタラクティブ要素で同じ見た目にし、消さない（`outline-none` を付けない）。

```css
:focus-visible {
  outline: 4px solid #000000;
  outline-offset: 2px;
  box-shadow: 0 0 0 2px #ffd43d; /* yellow-300 */
}
```

本リポジトリでは `global.css` の `:where(...):focus-visible` で一括適用している（JS ハンドラ不要）。

## 4. タイポグラフィ

- 書体: **Noto Sans JP**（`@fontsource` で自前配信）。等幅は **JetBrains Mono を維持**（コード表示で `0/O` `1/l` の判別性を優先。DADS 標準の Noto Sans Mono には寄せない）。
- 太さは 400（N）と 700（B）だけ。
- 本文・UI は 16px 以上、14px はフッター等の限定用途、14px 未満は使わない。本文の行高は 170〜175%。
- スタイル体系は `{種別}-{サイズ}{N|B}-{行高%}`。本リポジトリのクラス名（`.caption` / `.body-emphasis` 等）は維持し、値を下表に寄せる。

| 種別            | 用途               | 主なスタイル                                                                                      |
| :-------------- | :----------------- | :------------------------------------------------------------------------------------------------ |
| Standard（std） | 見出し・本文       | 32B-150 / 28B-150 / 24B-150 / 22B-150 / 20B-160 / 18B-160 / 17N-170 / 16N-170 / 16N-175 / 16B-170 |
| Dense（dns）    | テーブル・密な UI  | 17・16・14 × N/B × 行高 120 / 130                                                                 |
| Oneline（oln）  | ボタン・1 行ラベル | 17・16・14 × N/B × 行高 100                                                                       |
| Display（dsp）  | ヒーロー           | 64 / 57 / 48 × N/B × 行高 140                                                                     |
| Mono            | コード             | 17・16・14 × N/B × 行高 150                                                                       |

## 5. 余白・角丸・影

- 余白は **4px グリッド**（4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 56 / 64 / 80 / 96）。
- 角丸: コントロール（ボタン・入力・セレクト）**8px**、カード **12px**、ピル・アバター full。小さいボタンは 6px / 4px。
- 影（elevation）は ambient（10% 黒）+ key（30% 黒）の 2 枚重ねで 8 段。カード・メニュー・ダイアログに使い、カードは hover で 1 段上げる。値は `references/tokens.md`。
- レイアウトは中央寄せの最大幅コンテナ、フォームは 1 カラム（読みやすい幅 ~760px）。

## 6. 文言

- です・ます調、平易な日本語。ボタンは動詞で終える（「変換する」「コピー」「ダウンロード」）。「OK」のような曖昧なラベルは避ける。
- エラーは「何が起きたか」と「どう直すか」を書き、ユーザーを責めない。
- 必須 / 任意を明示する。数値・日付は半角。

## 7. 本リポジトリ固有の制約

DADS の汎用仕様より優先する。詳細の正本は以下。

| 制約                                                                                      | 正本                                   |
| :---------------------------------------------------------------------------------------- | :------------------------------------- |
| primitive scale のカラークラス禁止、semantic token / `@layer components` の意味クラス経由 | `.agents/rules/common.md` 7 章         |
| `style={{}}` / `element.style` 禁止（CSP `style-src` strict）                             | `.agents/rules/common.md` 7 章         |
| `@layer components` の手書き class は `hover:` 等の variant 非対応                        | `.agents/rules/common.md` 7.1          |
| 共通 UI コンポーネントの一覧と使い分け                                                    | `.agents/rules/ui-conventions.md` 1 章 |
| Google Fonts 等の外部 CDN を読み込まない（外部送信禁止・CSP `default-src 'self'`）        | `public/_headers`、common.md 冒頭      |
| DADS 公式 npm パッケージ（`@digital-go-jp/*`）は導入しない。値をトークンへ転記して使う    | `docs/decisions.md [134]`              |

## 8. チェックリスト

- [ ] 色・角丸・影を semantic token / 意味クラス経由で指定した
- [ ] 文字 4.5:1 / 非テキスト 3:1 を満たす
- [ ] フォーカスリング（黒 4px + 黄 2px）が見える
- [ ] hover で色以外の手掛かり（下線等）がある
- [ ] 本文 16px 以上、14px 未満なし
- [ ] タップ領域 44x44px 以上
- [ ] PC 1280x800 / スマホ 390x844 で目視確認した
