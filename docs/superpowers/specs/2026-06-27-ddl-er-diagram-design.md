# DDL → ER 図ジェネレータ（`ddl-er-diagram`）設計

## 目的

`CREATE TABLE` 文（MySQL / PostgreSQL）を貼り付けると ER 図を即描画するツール。明示的な FK 制約からリレーション線を自動描画し、Mermaid コード・SVG・PNG で出力する。本番スキーマは社外秘の塊であり、外部サービスに貼れない現場向けに **全処理ブラウザ内完結** とする点が差別化。

候補リスト B2-1（`docs/tool-candidates.md`）由来。技術メモ: `node-sql-parser` + `mermaid`、SQL 整形ツール（`sql-formatter`）とシナジー。

## スコープ

### 対応（初版）

- `CREATE TABLE` 文のパース（カラム名・型・NULL 可否）
- 主キー（PK）: 列定義内 `PRIMARY KEY` ／テーブル制約 `PRIMARY KEY (...)` の両方
- 明示的な外部キー（FK）:
  - テーブル制約 `FOREIGN KEY (col) REFERENCES other(col)`
  - 列定義内 `REFERENCES other(col)`
- 方言: MySQL / PostgreSQL（`ToggleGroup` で切替）
- 複数テーブルの一括入力
- 出力: Mermaid ER 記法のコピー／ER 図の SVG・PNG ダウンロード

### スコープ外（初版）

- 命名規則（`user_id` → `users`）からのリレーション推測
- `ALTER TABLE ADD CONSTRAINT ... FOREIGN KEY`（CREATE 文内の制約のみ対象）
- ビュー・インデックス・トリガー・シーケンス等
- 自前 SVG レイアウトエンジン（描画は mermaid に委譲）
- カラム型の方言間正規化（パーサが返す型表記をそのまま表示）

## アーキテクチャ（責務分離）

### 1. 純ロジック層 `src/utils/ddl-er-diagram.ts`（テスト対象）

外部 UI に依存しない純関数群。

- `parseDdl(sql: string, dialect: Dialect): ParseResult`
  - `node-sql-parser` を **dynamic import** で遅延ロードし、`CREATE TABLE` を AST へパース
  - AST を下記の中間モデルへ正規化
  - パース失敗時は `errors` に行・メッセージを格納して返す（throw しない）
- `toMermaid(model: SchemaModel): string`
  - 中間モデル → Mermaid `erDiagram` 記法の文字列へ変換（「Mermaid コードのコピー」機能用のテキスト出力）
  - テーブルごとに属性行（型 + PK/FK マーカー）、FK ごとにリレーション行を出力
- `toSvg(model: SchemaModel): string`
  - 中間モデル → 自前レイアウトの**自己完結 SVG 文字列**へ変換（アプリ内描画＋SVG/PNG ダウンロード用）
  - **CSP 準拠の必須制約**: `style=` 属性・`<style>` 要素を一切使わず、SVG の **presentation 属性のみ**（`fill` / `stroke` / `x` / `y` / `width` / `font-size` / `font-family` / `text-anchor` 等）で描画する。presentation 属性は CSS ではないため `style-src` の対象外
  - **純関数**（DOM 非依存・テスト可能）。テキスト幅は等幅フォント前提で文字数 × 係数で推定し、DOM 計測を不要にする（決定的出力 → VRT 安定）
  - テキストは `<` `>` `&` `"` をエスケープして挿入（XSS / SVG 破壊防止、規約 9.5）

`node-sql-parser` は dynamic import によりバンドルを当該ページに閉じ込める（既存の `recheck` / `jszip` と同パターン）。

### 描画方式の決定（mermaid 不採用）

当初は mermaid によるクライアント描画を予定したが、実機検証で **mermaid の `render()` が描画時に一時 DOM へインラインスタイルを当てるため、本プロジェクトの strict CSP（`style-src` に `unsafe-inline` なし、decisions [067][068]）と根本衝突**することが判明した。最終 SVG は `<img>` 経由で正常表示されるが、レンダリング毎に約 100 件の CSP 違反コンソールエラーが発生し、39/49 の E2E が依拠する `withProductionCsp`（`assertNoViolations`）ガートを通せない。blob/srcdoc iframe でも Chromium が親の CSP を子へ伝播するため回避不可。

したがって **描画は mermaid を使わず、presentation 属性のみの自前 SVG レンダラ（`toSvg`）で行う**。`mermaid` 依存は撤去する（`toMermaid` は文字列生成のみで mermaid ライブラリ不要）。表示は生成 SVG を blob URL の `<img>` で行い（スクリプト非実行・CSP 隔離）、同じ SVG 文字列から SVG/PNG をダウンロードする。

### 中間モデル（well-defined interface）

```ts
type Dialect = 'mysql' | 'postgresql';

interface Column {
  name: string;
  type: string; // 例: "VARCHAR(255)", "INTEGER"
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
}

interface Relation {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

interface Table {
  name: string;
  columns: Column[];
}

interface SchemaModel {
  tables: Table[];
  relations: Relation[];
}

interface ParseError {
  message: string;
  line?: number;
}

interface ParseResult {
  model: SchemaModel;
  errors: ParseError[];
}
```

### 2. UI 層 `src/components/tools/DdlErDiagram.tsx`

- 入力: `InputField`（textarea）にサンプルボタン。`ToggleGroup<Dialect>` で MySQL / PostgreSQL を切替
  - 方言切替はサブバリアントではなくパース対象が変わるため、切替時に再パースする（入力は保持）
- パース → mermaid を **dynamic import** して `mermaid.render()` で SVG 化し表示
- 出力:
  - Mermaid コードを `CopyButton` でコピー
  - ER 図 SVG を `DownloadButtonGroup`（SVG / PNG）でダウンロード
- パースエラーは `ErrorMessage`（`role="alert"`）で表示
- mermaid の描画失敗（生成コードが mermaid 構文エラー）も握りつぶさずエラー表示

### 3. ページ層 `src/pages/tools/ddl-er-diagram.astro`

- `ToolLayout` + `DdlErDiagram` を `client:load` でマウント
- `ToolInfoSection` に概要・ユースケース・制限（ALTER 非対応・明示 FK のみ）を記載

## データフロー

```
入力SQL + dialect
  → parseDdl (node-sql-parser, dynamic import)
  → SchemaModel { tables, relations }
  → toMermaid → Mermaid erDiagram 文字列
  → mermaid.render (dynamic import) → SVG 文字列
  → 画面表示 + コピー/ダウンロード
```

パースエラー時は SchemaModel を空にして `errors` を表示。一部テーブルのみパース成功した場合は成功分を描画しつつエラーも併記する（部分的成功を許容）。

## エラーハンドリング

- SQL 構文エラー: `parseDdl` が throw せず `errors[]` に格納 → `ErrorMessage` 表示
- 未対応構文（ビュー等）: 該当文をスキップし、対象外である旨を errors に注記
- FK の参照先テーブルが入力に存在しない: リレーションは描画せず警告として errors に注記（描画は継続）
- mermaid 描画エラー: try/catch でキャッチしエラー表示

## テスト

### ユニット（Vitest）`src/utils/__tests__/ddl-er-diagram.test.ts`

- `parseDdl`:
  - 単一テーブル（カラム・型・NULL 可否・PK）の正規化
  - 複数テーブル + テーブル制約 FK のリレーション抽出
  - 列定義内 `REFERENCES` の FK 抽出
  - MySQL 方言（バッククォート識別子）と PostgreSQL 方言（ダブルクォート識別子）の差
  - 構文エラー時に `errors` が埋まり throw しない
  - FK 参照先が未定義テーブルのときの警告
- `toMermaid`:
  - テーブル属性行（型 + PK/FK マーカー）の出力
  - リレーション行の出力
  - 出力が `erDiagram` で始まる妥当な Mermaid 記法であること

### E2E（Playwright）

- サンプル SQL 貼り付け → ER 図（SVG）が描画される
- Mermaid コードのコピーボタン動作
- SVG / PNG ダウンロードボタンの存在・動作
- `tests/e2e/visual-regression-pages.ts` の `PAGES` に `/tools/ddl-er-diagram` を追加（VRT 登録。baseline は CI workflow_dispatch で生成）

### test-gates 対象外の根拠

本ツールは「検出・拒否・警告で fail させる検知器」ではなく **変換器**（DDL → 図）。陽性対照テストの必須対象（CSP / validator / lint / セキュリティヘッダ / 検知器）に該当しないため test-gates skill のスコープ外。ただしパース正常系・エラー系の双方をユニットで担保する。

## 依存追加

- `node-sql-parser`（CREATE TABLE パース、ブラウザ動作可・dynamic import）

`mermaid` は描画方式の決定（上記）により **不採用**。描画は自前 SVG レンダラで行い外部依存を増やさない。`package.json` 追加時は `package-lock.json` の同期を確認する。

## カテゴリ・メタ情報

- カテゴリ: `convert`（変換・解析）
- slug: `ddl-er-diagram`
- name: `DDL → ER図ジェネレータ`
- yomi: `でぃーでぃーえるいーあーるずせいせい`（並び替え用）

## ドキュメント更新（`.agents/rules/common.md` 4・5 章）

- `README.md`: ツール一覧に追加
- `SPEC.md`: 2.3（ライブラリ追加）, 2.4, 4, 5, 9 章
- `docs/tools.md`: 仕組み・準拠・制限
- `docs/decisions.md`: 選定理由（node-sql-parser + mermaid 採用、明示 FK のみの初版スコープ）
- `docs/tool-candidates.md`: B2-1 行の状態列に ✅ と PR 番号（マージ時）
