# コントラスト比マトリクス (`contrast-matrix`) 設計

- 日付: 2026-06-25
- 候補リスト: `docs/tool-candidates.md` A-4
- ブランチ: `claude/inspiring-ramanujan-yyba5d`

## 目的

任意の N 色（ブランドカラー / デザイントークン等）の全組合せ（N×N）について、前景色×背景色のコントラストを一覧表示するツール。WCAG 2.x のコントラスト比（AA/AAA 合否）と APCA Lc 値を併記し、パレット全体の可読性を一目で点検できるようにする。

純粋計算（CIE 相対輝度 / APCA 公式アルゴリズム）のためデータは一切ブラウザ外へ送信しない。未公開のブランドカラー・デザインシステムのトークンをローカルで安全に検証できる点が、オンライン型コントラストチェッカーとの差別化。

## スコープ

### v1 に含む

- HEX（`#rgb` / `#rrggbb`）・`rgb()` 形式の不透明色入力（行追加 / 削除、任意ラベル付与）
- WCAG 2.x コントラスト比の算出と AA / AAA（通常テキスト / 大きいテキスト）の合否判定
- APCA Lc 値の併記（極性を保持した非対称指標）
- N×N マトリクス表示（行＝前景色、列＝背景色、対角＝同色はグレーアウト）
- 各セルの実色プレビュー描画
- 閾値フィルタ（全て / AA 以上 / AAA 以上）で未達セルを淡色化

### v1 に含まない（先送り＝必要なら issue 化）

- アルファ（半透明）色の合成（背景重ね合わせの曖昧さを避けるため不透明色のみ対応）
- HSL / OKLCH / 名前付き色などの追加入力形式
- パレットの保存 / 共有 URL / エクスポート

## アーキテクチャ / ファイル構成

ロジック（純関数）と UI を分離する（既存ツールの慣習に準拠）。

| ファイル                                  | 役割                                                               |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `src/utils/contrast.ts`                   | 色パース・WCAG 相対輝度・コントラスト比・APCA Lc・合否判定の純関数 |
| `src/utils/__tests__/contrast.test.ts`    | 既知の参照値（WCAG / APCA 公式例）で検証。合格例＋不合格例の両対照 |
| `src/components/tools/ContrastMatrix.tsx` | React 本体（色リスト編集 ＋ N×N マトリクス ＋ 閾値フィルタ）       |
| `src/pages/tools/contrast-matrix.astro`   | `client:load` で React をマウントするページ                        |

- カテゴリ: `convert`（変換・解析）。`cidr-calculator` と同列。
- `src/data/tools.ts` に slug `contrast-matrix` / name `コントラスト比マトリクス` / yomi `こんとらすとひまとりくす` を追加。

## 計算ロジック（`contrast.ts`）

### 色パース

- 受理形式: `#rgb`、`#rrggbb`、`rgb(r, g, b)`。
- 戻り値は `{ r, g, b }`（各 0–255）または `null`（パース失敗）。
- v1 は不透明色のみ。アルファ付き（`#rrggbbaa` / `rgba()`）は非対応とし、UI 側で注記。

### WCAG コントラスト比

1. sRGB 各チャネルを 0–1 に正規化。
2. ガンマ展開: `c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055) ** 2.4`。
3. 相対輝度 `L = 0.2126*R + 0.7152*G + 0.0722*B`。
4. コントラスト比 `(max(L1,L2)+0.05) / (min(L1,L2)+0.05)`（対称）。
5. 合否しきい値:
   - AA 通常 4.5 / AA 大 3.0
   - AAA 通常 7.0 / AAA 大 4.5

### APCA Lc

- APCA-W3 0.1.9 の公式アルゴリズムを自前実装（W3C ベータライセンスのライブラリ採用を避ける）。
- 入力は前景（テキスト）色と背景色。背景の相対輝度・前景の相対輝度を APCA の sRGB→Y 係数（`0.2126729 / 0.7151522 / 0.0721750`、指数 2.4）で算出し、ソフトクランプ・極性別の指数（`normBG/normTXT/revBG/revTXT`）と scale（`1.14`）・clamp（`0.1`）・offset（`0.027`）を適用。
- 結果は Lc 値（おおむね -108〜106）。符号は極性（明背景＝正、暗背景＝負）を表す。前景/背景を入替えると非対称（符号が変わる）。

## UI / データフロー

- 状態: 色エントリ配列 `{ id, label, hex }`。`useMemo` で各ペアのパース結果・比・APCA・合否を派生。
- **色リスト**: HEX 入力欄（`InputField`）＋ネイティブ `<input type="color">` の行を「追加 / 削除」。各色に任意ラベル。初期サンプル数色を投入。
- **マトリクス**: 行＝前景、列＝背景の N×N テーブル。各セルに WCAG 比 ＋ AA/AAA バッジ（`StatusBadge` / `ChipLabel`）＋ APCA Lc。セル背景は実際の前景/背景でプレビュー描画。対角はグレーアウト。
- **閾値フィルタ**: `ToggleGroup` で「全て / AA 以上 / AAA 以上」を切替し未達セルを淡色化。
- 共通 UI（`InputField` / `CopyButton` / `ToggleGroup` / `NotificationBanner`）と DADS デザイン規約に準拠。色は CSS 変数 / semantic token utility 経由（primitive scale 直書き禁止）。`@layer components` 手書き class への variant prefix は使わない。

## エラーハンドリング

- 不正な色入力はセルではなく該当入力欄の近傍にエラー表示（`ErrorMessage`）。マトリクスは有効色のみで描画。
- 色が 0〜1 色のときはマトリクスを描画せず案内文を表示。

## テスト

### ユニット（Vitest）

- WCAG 既知値: 黒×白＝21:1、白×白＝1:1、境界 4.5 近傍の合否、グレー段階の比。
- APCA 公式リファレンス値（W3C のテストペア）で Lc を検証（許容誤差付き）。
- 合否判定の**両対照**: AA を満たすペア（正）と満たさないペア（負）の両方を assert。

### E2E（Playwright, preview 経由）

- 色追加 → マトリクスのセル増加、フィルタ切替で淡色化が反映されることを確認。
- `tests/e2e/visual-regression-pages.ts` の `PAGES` に `/tools/contrast-matrix` を追加（VRT 対象登録。漏れると `tests/meta/vrt-pages-coverage.test.ts` が fail）。
- VRT baseline は CI Linux runner の `Update Visual Regression Baseline` workflow を `workflow_dispatch` で生成。**web セッションのトークンには `actions: write` が無く自動起動不可**のため、PR ブランチ指定での手動トリガーをユーザーへ依頼する。

## ドキュメント更新

- `README.md`（ツール一覧）
- `SPEC.md`（2.3 ライブラリ追加なし / 2.4 / 4 / 5 / 9 章）
- `docs/tools.md`（仕組み・準拠仕様 WCAG 2.x・APCA 0.1.9・制限）
- `docs/decisions.md`（APCA 自前実装の選定理由）
- `docs/tool-candidates.md` A-4 の状態列に ✅ ＋ PR 番号（マージ時）

## 依存ライブラリ

新規追加なし（純粋計算）。
