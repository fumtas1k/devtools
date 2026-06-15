# HAR ビューア＆サニタイザ 設計（S2-4）

- 候補リスト: `docs/tool-candidates.md` S2-4
- slug: `har-viewer`
- カテゴリ: `convert`（変換・解析）
- 作成日: 2026-06-14

## 目的

DevTools が出力する HAR（HTTP Archive）ファイルをブラウザ完結で閲覧し、Cookie /
Authorization / トークン類を自動 redact した「共有用 HAR」を出力する。HAR は
セッション Cookie・POST ボディ・レスポンスボディを丸ごと含むため、samltool 系の
オンラインビューアやチャット/issue にそのまま貼れない。「閲覧＋サニタイズ一体型」は
既存サービスに空白地帯がある。

## スコープ

### v1（本 PR）

- HAR JSON のパースと最小スキーマ検証
- エントリ一覧テーブル（メソッド / URL / ステータス / タイプ / サイズ / 所要時間）
- 行クリックで詳細パネル展開（リクエスト/レスポンスヘッダ・Cookie・クエリ・ボディ）
- 構造的 redact ＋ `scrubText` 併用のサニタイザ
- 共有用 HAR の出力（ダウンロード＋クリップボードコピー）
- redact 対象のトグル制御（`ToggleChips`、件数バッジ付き）
- サマリ統計（総リクエスト数・総転送量・ドメイン別件数・redact 件数）

### スコープ外（別 PR・issue 化）

- **ウォーターフォール（タイミング可視化）**: 視覚主体で工数が読めないため分離。
  別 issue で引き継ぐ。
- XMLDSig 等の署名検証（HAR には無関係）。
- Web Worker による大型 HAR の非同期パース（v1 はメインスレッド＋サイズ上限で対応）。

## アーキテクチャ

```
src/utils/har/
  types.ts        # HAR 1.2 の必要サブセット型
  parse.ts        # HAR JSON → 型付き構造。最小スキーマ検証（log.entries 必須等）
  rules.ts        # redact 対象フィールド辞書（機密ヘッダ名 / クエリ名）
  sanitize.ts     # 構造的 redact + scrubText 併用。純関数・入力非破壊
  index.ts        # re-export
  __tests__/
    parse.test.ts
    sanitize.test.ts   # 陽性対照テスト（redact 漏れを fail させる）

src/components/tools/
  HarViewer.tsx        # 親: 入力(D&D/picker)・トグル・出力・サマリ
  HarEntryList.tsx     # 一覧テーブル
  HarEntryDetail.tsx   # 詳細パネル

src/pages/tools/har-viewer.astro
```

### 既存資産の再利用

- `src/utils/file-validation.ts`: text kind・`.har`/`.json` 拡張子・サイズ上限検証
- `src/utils/secret-scrubber`（`scrubText` / `ScrubCategory` / `DEFAULT_ENABLED`）:
  本文・URL の自由テキスト走査
- 共通 UI: `InputField` / `DownloadButton` / `CopyButton` / `ToggleChips` /
  `ErrorMessage` / `NotificationBanner` / `StatusBadge`

### データフロー

```
ファイル(D&D/picker) または 貼り付け
  → validateFile（サイズ・拡張子）
  → parseHar（JSON.parse + スキーマ検証）
  → React state（parsed HAR・選択中エントリ）
  → トグル変更で sanitizeHar を再計算（useMemo）
  → サニタイズ済み HAR を JSON 文字列化 → download / copy
```

## サニタイズ（redact）仕様

### 構造的 redact（フィールド名ベース・確実に処理）

| 対象                                                        | 処理                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `request.cookies[].value` / `response.cookies[].value`      | 一貫トークン化                                                   |
| 機密ヘッダの `value`（request/response の `headers[]`）     | 辞書判定（大文字小文字無視）で一貫トークン化                     |
| 機密クエリの `value`（`request.queryString[]`）             | 辞書判定で一貫トークン化                                         |
| `request.url`                                               | URL 内 basic-auth（`user:pass@`）と機密クエリパラメータを redact |
| `request.postData.text` / `request.postData.params[].value` | `scrubText` 適用＋機密パラメータ名は確実に redact                |

機密ヘッダ辞書（小文字比較）: `authorization` / `proxy-authorization` / `cookie` /
`set-cookie` / `x-api-key` / `x-auth-token` / `x-csrf-token` / `x-xsrf-token`

機密クエリ辞書（小文字比較）: `token` / `access_token` / `id_token` / `refresh_token` /
`api_key` / `apikey` / `key` / `secret` / `client_secret` / `sig` / `signature` /
`password` / `passwd` / `pwd` / `code`

### 自由テキスト走査（`scrubText` 併用・トグルで ON/OFF）

レスポンスボディ（`response.content.text`）・URL の残り・ヘッダ値の取りこぼしに対し
`scrubText` を適用し、API キー / JWT / メール / IP 等を拾う。

### 一貫トークン化

同一値は同一プレースホルダ（`[REDACTED:COOKIE_1]` 等）。構造的 redact と
`scrubText` でトークン体系・カウンタを揃え、HAR 全体で値の同一性が保たれる。

### トグル UI

`ToggleChips`（件数バッジ付き・既定すべて ON）:
`Cookie` / `認証ヘッダ` / `機密クエリ` / `POSTボディ` / `本文スキャン(secret-scrubber)`

## エラー処理

- 不正 JSON → 行 / 列付きエラー表示（`json-formatter` の流儀）
- HAR スキーマ不一致（`log` / `log.entries` 欠落等）→ 日本語で明示
- サイズ上限超過・空ファイル → `file-validation` のメッセージ
- サイズ上限: v1 は **25MB**（大型 HAR のメインスレッドパースが重いため）。
  Web Worker 化は将来課題として issue 化検討

## テスト

### 陽性対照必須（`test-gates` skill 準拠）

redact 検知器のため陽性対照を必須とする:

- 既知の Cookie / Authorization / トークン / メール等を含む HAR fixture で
  「該当値が redact されること」を assert（陽性対照）
- 各カテゴリのトグルを OFF にしたら「素通りすること」を assert（陰性対照）。
  陰性対照のみでは「検知能力ゼロで green」と区別不能なため両方必須
- サニタイズ後の出力が **有効な JSON で HAR 構造を保つ** ことを assert
- 入力非破壊（元オブジェクトを mutate しない）を assert

### ユニットテスト

- `parseHar`: 正常 / 不正 JSON / スキーマ欠落 / 空 entries
- `sanitizeHar`: 各カテゴリの redact・一貫トークン・トグル反映・入力非破壊

### E2E / VRT

- `tests/e2e/visual-regression-pages.ts` の `PAGES` に `/tools/har-viewer` を追加
  （VRT 登録。baseline は CI Linux runner で生成）
- `tests/meta/vrt-pages-coverage.test.ts` が登録漏れを検知する

## ドキュメント更新（`.agents/rules/common.md` 4・5 章）

- `README.md`: ツール一覧に追加
- `SPEC.md`: 2.3 / 2.4 / 4 / 5 / 9 章
- `docs/decisions.md`: 選定理由・redact 設計
- `docs/tools.md`: 仕組み・準拠仕様（HAR 1.2）・制限
- `src/data/tools.ts`: `toolEntries` にエントリ追加（yomi: `えいちえーあーるびゅーあ`）
- `docs/tool-candidates.md`: S2-4 状態列に ✅ と PR 番号（マージ時）
- ウォーターフォール分離 issue を作成し PR に番号を記載
