# DSN / 接続文字列ビルダ＆パーサ（dsn-builder）設計ドキュメント

- 日付: 2026-06-13
- 出典: `docs/tool-candidates.md` S-1
- ステータス: 設計確定（ユーザー確認済み: 対応スキーム 5 種 / 付加機能はマスク済み URI 出力 / リアルタイム双方向同期）

## 1. 目的

データベース・ミドルウェアの接続文字列（DSN / 接続 URI）をフォーム ⇄ URI で双方向編集できるツールを追加する。
接続文字列にはパスワードが必ず含まれるため、外部送信しないブラウザ完結ツールである必然性が最も高い（S tier）。

主なユースケース:

- 既存の接続文字列を貼り付けて構成要素（ユーザー / ホスト / DB 名 / パラメータ）を確認・修正する
- フォームから正しく percent-encode された接続文字列を組み立てる（記号入りパスワードの手動エンコードミス防止）
- パスワードをマスクした共有用 URI を生成して issue / チャットに安全に貼る

## 2. スコープ

### 対応スキーム（5 系統・TLS/SRV 亜種込み）

| 系統       | スキーム                      | 既定ポート  | パス部の意味                 | 複数ホスト                      |
| ---------- | ----------------------------- | ----------- | ---------------------------- | ------------------------------- |
| PostgreSQL | `postgresql://` `postgres://` | 5432        | データベース名               | ○（libpq 仕様）                 |
| MySQL      | `mysql://`                    | 3306        | データベース名               | ×                               |
| MongoDB    | `mongodb://` `mongodb+srv://` | 27017       | データベース名               | ○（`+srv` は 1 件・ポート禁止） |
| Redis      | `redis://` `rediss://`        | 6379        | DB 番号（整数）              | ×                               |
| AMQP       | `amqp://` `amqps://`          | 5672 / 5671 | vhost（percent-encode 対象） | ×                               |

### やること

- URI → フォームのパース（バリデーションエラーは日本語で行内表示）
- フォーム → URI のシリアライズ（userinfo / vhost / DB 名の percent-encode を自動化）
- リアルタイム双方向同期（編集中の側を入力源とし、他方へ即時反映）
- パスワードを `****` に置換したマスク済み URI の出力＋コピー
- クエリパラメータの汎用 key-value 編集（追加・削除）
- スキーム別サンプル DSN の挿入ボタン

### やらないこと（YAGNI / 後続候補）

- ドライバ別パラメータ辞書（sslmode 等の選択式編集・説明表示）→ 付加機能の選択で見送り
- `.env` / 環境変数形式出力 → 同上
- JDBC・SQL Server 等の追加スキーム
- 実接続テスト（ブラウザから不可能）

## 3. アーキテクチャ

既存ツールの構成（`secret-scrubber` 等）を踏襲する。新規ライブラリは導入しない（純粋な文字列処理。`URL` API は mongodb のカンマ区切り複数ホストを解釈できないため、自前パーサを実装する）。

```
src/utils/dsn-builder/
  types.ts       … DsnModel（scheme / user / password / hosts[] / database / params[]）・ParseResult
  dialects.ts    … スキーム方言辞書（既定ポート・パス部の意味ラベル・複数ホスト可否・SRV 制約・サンプル DSN）
  parse.ts       … parseDsn(uri): URI 文字列 → DsnModel（エラーは日本語メッセージ付きで返却）
  serialize.ts   … serializeDsn(model) / maskDsn(model)（percent-encode を内包）
  index.ts       … re-export
src/components/tools/DsnBuilder.tsx   … UI 本体（DsnBuilderTool を named export）
src/pages/tools/dsn-builder.astro     … ページ（client:load マウント＋ ToolInfoSection 解説）
```

### データフロー（リアルタイム双方向）

- 正準状態は `DsnModel` と `uriText` の 2 つを保持し、最後に編集された側を入力源とする。
- URI テキストエリア編集 → `parseDsn` → 成功: モデル更新（フォームへ反映）／失敗: モデル保持・エラー表示（フォームは直前の有効状態を維持）。
- フォーム編集 → モデル更新 → `serializeDsn` → `uriText` を上書き。
- マスク済み URI は常にモデルから `maskDsn` で導出（read-only ＋ CopyButton）。

### パーサ仕様

- 構文分解: `scheme://[userinfo@]authority[/path][?query]` を正規表現＋手動分割で処理。authority はカンマ区切りで `host[:port]` 列に分解（IPv6 の `[...]` ブラケット対応）。
- userinfo / パス / クエリ値は percent-decode してモデルに格納。シリアライズ時に再エンコード（パスワードの `@ : / ? #` 等を自動エンコード）。
- バリデーション（すべて日本語メッセージ）:
  - 未対応スキーム → 対応スキーム一覧を提示
  - `mongodb+srv` でポート指定 or 複数ホスト → エラー
  - ポートが 0–65535 範囲外 / 非数値 → エラー
  - 複数ホスト非対応スキームでのカンマ区切り → エラー
  - redis のパスが整数でない → エラー
  - ホスト空・不正な percent-encoding → エラー

## 4. UI 構成

上から順に:

1. **接続 URI**（textarea、サンプルボタン・クリアボタン・エラー表示付き / `InputField` 流用）
2. **フォーム**
   - スキーム `Select`（9 値: postgresql / postgres / mysql / mongodb / mongodb+srv / redis / rediss / amqp / amqps）
   - ユーザー名・パスワード（テキスト入力。URI 欄にも平文表示されるため入力欄での秘匿はしない）
   - ホスト＋ポートの行リスト(複数ホスト可スキームのみ「追加」ボタン表示・行削除ボタン)
   - データベース名欄（ラベルはスキーム連動: データベース名 / DB 番号 / vhost）
   - クエリパラメータの key-value 行リスト（追加・削除）
3. **マスク済み URI**（read-only 出力＋ `CopyButton`。パスワード部を `****` に置換）

スタイルは `.agents/rules/common.md` 7 章・`.agents/rules/ui-conventions.md` に従い、semantic class / 既存 UI コンポーネント（`InputField` / `Select` / `ActionButton` / `CopyButton` / `ErrorMessage` / `Section`）を使用する。PC 1280x800・スマホ 390x844 の両方で確認する。

## 5. エラーハンドリング

- パースエラーは URI 欄直下に `ErrorMessage`（`role="alert"`）で表示し、フォームは直前の有効状態を保つ。
- フォーム入力起因の不整合（mongodb+srv でポート入力等）は該当欄にエラー表示し、URI 出力は生成可能な範囲で更新を止める。
- 空入力はエラーにしない（初期状態）。

## 6. テスト戦略

バリデータを含むため **test-gates skill の陽性対照ルールに従う**（不正入力が確実にエラーになることをテストで保証する）。

- **ユニット（Vitest）** `src/utils/dsn-builder/__tests__/`:
  - 5 系統×代表 DSN のパース → シリアライズのラウンドトリップ（パラメータ順序保持含む）
  - percent-encode 往復（記号入りパスワード・vhost `%2F` 等）
  - 陽性対照: 未対応スキーム / srv+ポート / 範囲外ポート / 複数ホスト不可スキームのカンマ / redis 非整数 DB がすべてエラーになること
  - `maskDsn` のマスク動作（パスワード無し時はマスク無し）
- **E2E（Playwright）** `tests/e2e/dsn-builder.spec.ts`:
  - URI 貼り付け → フォーム各欄へ反映
  - フォーム編集 → URI 欄へ反映（双方向）
  - 不正 URI でエラー表示（陽性対照）
  - マスク済み URI の表示内容
- **VRT**: `tests/e2e/visual-regression-pages.ts` の `PAGES` に `/tools/dsn-builder` を追加（baseline は CI の workflow_dispatch で生成）。

## 7. ドキュメント更新（ツール追加に伴う義務）

- `src/data/tools.ts`: slug `dsn-builder` / name「DSN/接続文字列ビルダ」/ category `convert` / yomi「でぃーえすえぬせつぞくもじれつびるだ」
- `README.md` ツール一覧 / `SPEC.md`（2.3, 2.4, 4, 5, 9 章）/ `docs/decisions.md`（自前パーサ採用理由）/ `docs/tools.md`（仕組み・準拠仕様・制限）
- `docs/tool-candidates.md` S-1 行の状態列 → PR 番号確定後に ✅ を記載
