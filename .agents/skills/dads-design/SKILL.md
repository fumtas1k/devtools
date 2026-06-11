---
name: dads-design
description: 'デジタル庁デザインシステム（DADS）v2 の忠実再現パッケージ。公式トークン値（blue-900 #0017c1 / yellow-300 フォーカスリング / Solid Gray 階調）・Noto Sans JP タイプスケール・React コンポーネント 13 種・行政ポータル UI キットを同梱。DADS 準拠のプロトタイプ / モック / スライド / デザインアセットを HTML で生成するとき、または公式 DADS の正確なトークン値・コンポーネント構造を参照したいときに使うこと。※devtools 本体（src/ 配下）の UI 実装規約は dads-design-system スキルと CLAUDE.md §7 が正本（本体のカラー値はこのスキルと異なる）。'
user-invocable: true
---

# DADS デザインシステム（忠実再現版）

まずこのスキル内の `readme.md` を読むこと。コンテンツ原則（公共サービス日本語・必須/任意バッジ・絵文字禁止）、ビジュアル基盤（カラー・タイポグラフィ・余白・エレベーション・フォーカスリング）、アイコン方針が全て記載されている。

## 用途の切り分け（重要）

| 作業対象                                                       | 参照先                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 使い捨てプロトタイプ / モック / スライド / デザインアセット生成 | **このスキル**。アセットをコピーして静的 HTML を作成しユーザーに見せる |
| 公式 DADS のトークン値・コンポーネント構造の正確な参照          | **このスキル**（公式リポジトリから転記した忠実値）                      |
| devtools 本体（`src/` 配下）の UI 実装                          | `dads-design-system` スキル + `CLAUDE.md` §7（本体は `--color-primary: #1a56db` 等の独自適応値。このスキルの `#0017c1` をそのまま持ち込まない） |

ガイダンスなしで起動された場合は、何を作りたいかをユーザーに質問し、デザイナーとして HTML アーティファクトまたはプロダクションコードを出し分けること。

## 主要ファイル

- `styles.css` — 全トークン・タイプクラス・コンポーネントスタイルを `@import` する単一エントリポイント。HTML から相対パスで link するだけで使える
- `tokens/` — colors / typography（`text-std-16N-170` 形式のユーティリティクラス含む）/ spacing（余白・角丸・エレベーション・フォーカスリング）/ fonts（Google Fonts 経由 Noto Sans JP/Mono）/ base（リセット + focus）
- `components/` — React プリミティブ 13 種（Button, Input, Select, Checkbox, Radio, Textarea, Label, NotificationBanner, StatusBadge, Accordion, Breadcrumbs, ChipLabel, Table）。各 `*.prompt.md` に用途と JSX 例、`*.d.ts` に props 契約
- `lib/dads.jsx` — 全コンポーネントを `window.DADS_952a55` に登録するスタンドアロン版（Babel standalone + CDN React で動作）
- `guidelines/` — カラー / タイポグラフィ / 余白 / ブランドの specimen HTML（styles.css を実 link した見本帳）
- `ui_kits/gov-portal/` — 行政手続きポータルの実働 UI キット（ホーム・手続き一覧・FAQ・3 ステップ申請フロー）。`index.html` をブラウザで開けばそのまま動く
- `assets/` — ブランドマーク（プレースホルダー favicon.svg）とサンプル写真

## DADS デザインの絶対条件

- **デュアルフォーカスリング**を全インタラクティブ要素に維持: 2px `yellow-300` (#ffd43d) リング + 4px 黒アウトライン（offset 2px）。削除厳禁
- プライマリアクションは `blue-900` (#0017c1)、リンクは `blue-1000`、押下は `blue-1200`
- 平易で丁寧な日本語（です・ます調）。フィールドには必ず 必須/任意 を明記
- プロダクト UI に絵文字を使わない（アイコンは inline SVG + `currentColor`）
- 装飾より余白と高コントラスト。hover は色変化 + 下線（色だけに頼らない）
- 本文 16px 以上・行高 170%。フォントは Noto Sans JP / Noto Sans Mono のみ

## 注意（caveats）

- ロゴはプレースホルダー（公式デジタル庁ワードマークではない）。実用前に差し替えること
- フォントは Google Fonts から CDN 読み込み。本番では self-host 推奨
- 値は公式リポジトリ（digital-go-jp/design-tokens の figma/tokens.json 等）からの転記。精度が必要な場合は最新版と照合すること（詳細は readme.md の Sources 参照）
