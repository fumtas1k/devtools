# SQL整形・パラメータ埋め込みツール 設計ドキュメント

## 1. 目的

汚い SQL を整形（インデント）するツールに加え、ログからコピーした「プレースホルダ付き SQL（例: `SELECT * FROM users WHERE id = ?`）」と「パラメータ配列（例: `[123]`）」をブラウザ上で合体させ、人間がデバッグで読むための完全な SQL 文を組み立てる機能を提供する。

## 2. 背景

- 既存 17 ツールに純粋な SQL 整形ツールは存在しない。
- ORM / クエリビルダのログはプレースホルダとパラメータが分離して出力されるため、実際に発行された SQL を頭の中で組み立てる必要があり、デバッグ時の負荷が高い。
- 出力はあくまで **人間がデバッグで読む用** であり、DB に投げる用途ではない（文字列連結による埋め込みは本質的に SQL インジェクションの形そのものであるため、UI に警告を常設する）。

## 3. ツール定義

| 項目     | 値                                           |
| :------- | :------------------------------------------- |
| name     | `SQL整形・パラメータ埋め込み`                |
| slug     | `sql-formatter`                              |
| category | `convert`（変換・解析）                      |
| yomi     | `えすきゅーえるせいけい`                     |
| 依存追加 | `sql-formatter`（MIT・バージョン固定で導入） |

## 4. UI 構成

- 画面上部に **方言セレクタ**（`Select`）— 両タブ共通。選択肢: MySQL / PostgreSQL / SQLite / SQL Server。
- **タブ切替**（`ToggleGroup`）で 2 機能を提供:
  - **整形タブ**: SQL 入力 → 整形済み SQL を出力。
  - **埋め込みタブ**: プレースホルダ付き SQL + パラメータ（JSON）→ 値を埋め込んだ後に整形した完全な SQL を出力。**「実行禁止・デバッグ表示用」警告バナーを常設**。
- 整形オプションは露出しない（キーワード大文字・2 スペースインデントを既定固定）。要望が出たら後で追加する（YAGNI）。
- 入出力・操作は既存共通コンポーネント（`InputField` / `OutputField` / `CopyButton` / `ErrorMessage` / `Select` / `ToggleGroup`）を再利用する。
- 入力 → 変換 → 結果 / エラー / pending は `useDebouncedTransform` で駆動する。

## 5. ファイル構成

- `src/components/tools/SqlFormatter.tsx` — タブ・状態管理・方言選択。
- `src/pages/tools/sql-formatter.astro` — `client:load` で React コンポーネントをマウント。
- `src/utils/sql/format.ts` — `sql-formatter` ラッパ。方言マッピングと整形オプション既定値を集約。
- `src/utils/sql/embedParams.ts` — プレースホルダ検出 + 値レンダリング + 置換。失敗時は明確な日本語メッセージの `Error` を throw。

## 6. 整形ロジック（`format.ts`）

- 入力 SQL と方言を受け取り `sql-formatter` の `format()` に委譲する。
- 方言マッピング: MySQL → `mysql` / PostgreSQL → `postgresql` / SQLite → `sqlite` / SQL Server → `transactsql`。
- 整形オプション既定: `keywordCase: 'upper'`、`tabWidth: 2`、`indentStyle: 'standard'`。
- `sql-formatter` が例外を投げた場合はそのまま伝播させ、`useDebouncedTransform` 側でエラー表示に変換する。

## 7. 埋め込みロジック（`embedParams.ts`）

### 7.1. プレースホルダ検出スキャナ

正規表現の単純マッチではなく **軽量スキャナ** で SQL を走査し、以下を読み飛ばした **外側** にあるプレースホルダのみを検出する。

- 文字列リテラル `'...'`（`''` エスケープを含む）
- 識別子クォート `"..."` および `` `...` ``
- 行コメント `-- ...`
- ブロックコメント `/* ... */`

検出対象のプレースホルダ:

| スタイル | 構文      | パラメータ入力    | 説明                               |
| :------- | :-------- | :---------------- | :--------------------------------- |
| 位置指定 | `?`       | JSON 配列         | 出現順に配列要素を割り当て         |
| 番号指定 | `$1` `$2` | JSON 配列         | `$n` → 配列[n-1]。同番号の再利用可 |
| 名前付き | `:name`   | JSON オブジェクト | キー名で参照                       |

- **スタイル混在はエラー**（1 クエリ 1 スタイル）。`?` と `$1` と `:name` が混在した場合は明確なエラーを出す。
- これにより `WHERE name = '誰?'` の `?` を誤って置換しない（本ツール最大の複雑さ）。

### 7.2. 値レンダリング（方言依存）

| JSON 型            | 出力                                           |
| :----------------- | :--------------------------------------------- |
| 文字列             | `'` で囲み、内部の `'` を `''` にエスケープ    |
| 数値               | そのまま                                       |
| `null`             | `NULL`                                         |
| 真偽値             | PostgreSQL は `TRUE` / `FALSE`、他は `1` / `0` |
| 配列・オブジェクト | エラー（意味が曖昧なため非対応）               |

### 7.3. 置換規則

- `?`: パラメータ配列を出現順に割り当て。**件数一致必須**。
- `$n`: 配列[n-1] を割り当て。参照する全 index が配列範囲内であることを検証（再利用可）。
- `:name`: オブジェクトのキーを参照。SQL 中の全ての名前がキーとして存在することを検証。

置換後の SQL を `format.ts` に通して整形済み完全 SQL を出力する。

## 8. エラーハンドリング

`useDebouncedTransform` が `transform` の throw を捕捉し、以下を日本語メッセージで表示する。

- パラメータが JSON として解釈できない
- プレースホルダ数とパラメータ数の不一致（「プレースホルダ N 個に対しパラメータ M 個」）
- 名前付きパラメータのキー欠落（欠落キー名を提示）
- 番号指定の参照 index が範囲外
- ネストした配列・オブジェクトの値
- プレースホルダスタイルの混在
- `sql-formatter` の整形例外

## 9. PR 分割（2 PR・機能垂直分割）

各 PR が独立して動くユーザー価値を出荷する。

### PR1: SQL 整形ツール

- `sql-formatter` 依存追加（`package.json` + `package-lock.json` 同期）。
- `src/utils/sql/format.ts`。
- `src/components/tools/SqlFormatter.tsx`（**整形タブのみ**）+ `src/pages/tools/sql-formatter.astro`。
- `src/data/tools.ts` にエントリ追加。
- VRT 登録: `tests/e2e/visual-regression-pages.ts` の `PAGES` に `/tools/sql-formatter` を追加し、CI Linux runner で baseline 生成。
- ドキュメント更新: `README.md` / `SPEC.md`（2.3/2.4/4/5/9 章）/ `docs/decisions.md`（`sql-formatter` 選定理由）。
- この時点で「動く SQL 整形ツール」として出荷可能。

### PR2: パラメータ埋め込みタブ

- `src/utils/sql/embedParams.ts`（スキャナ + 値レンダリング + 置換）。
- `SqlFormatter.tsx` に埋め込みタブ + 警告バナーを追加。
- `test-gates` skill を呼び、検出スキャナの **陽性対照**（意図的に違反入力を与えて捕捉できるテスト）を併設。
- E2E に埋め込みフローを追加。VRT は UI 変更分の baseline を再生成。
- ドキュメント更新: `README.md` / `SPEC.md` の機能説明を埋め込み機能込みに更新。

## 10. 検証計画

- **単体テスト**（`src/utils/sql/__tests__/`）:
  - `format.ts`: 4 方言マッピングのスモークテスト。
  - `embedParams.ts`: 3 スタイルそれぞれ、クォートエスケープ（`O'Brien` → `'O''Brien'`）、`null` / 真偽値（方言別）/ 数値、ネスト値エラー、件数不一致、番号 index 範囲外、名前付きキー欠落、スタイル混在エラー。
  - **陽性対照（PR2 / test-gates 必須）**: 文字列リテラル内・コメント内の `?` `$n` `:name` が置換されないことを検証。スキャナを無効化すると fail することを確認できるテストを置く。
- **E2E テスト**（`npm run test:e2e`）: 整形フロー（PR1）/ 埋め込みフロー（PR2）/ a11y。
- **VRT**: `/tools/sql-formatter` を登録し CI Linux で baseline 生成。
- **型チェック**: `node_modules/.bin/astro check`。
