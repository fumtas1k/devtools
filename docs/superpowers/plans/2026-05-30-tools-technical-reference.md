# ツール技術リファレンス実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 開発者向けに各ツールの内部の仕組み・準拠 RFC・制限を解説する `docs/tools.md` を新設し、構造と代表 4 ツールの本文を整備する。

**Architecture:** 全ツールを 1 ファイル `docs/tools.md` に集約。README と同じ 4 カテゴリで見出し区切りし、各ツールは 3 小節（仕組み・アルゴリズム / 準拠 RFC / 制限・エッジケース）を持つ。本 PR では構造（全 20 ツールの見出し枠）+ 代表 4 ツールの本文を書き、残り 16 は後続 PR。

**Tech Stack:** Markdown。検証は prettier（pre-commit hook）・`astro check`・`npm run test`（meta テスト）。

**設計の正本:** `docs/superpowers/specs/2026-05-30-tools-technical-reference-design.md`

**重要な前提（推測禁止）:** 各ツールの本文は対象ソースを実際に読んで書く。挙動を推測で書かない。事実が確認できない点は本文に含めず「制限・エッジケース」に「未確認」と書くのではなく、確認できた範囲のみ記述する。

---

## 対象ツールとソース対応表

| カテゴリ             | slug               | 表示名                            | 主ソース                                                                              |
| :------------------- | :----------------- | :-------------------------------- | :------------------------------------------------------------------------------------ |
| 生成                 | ulid-generator     | ULID生成                          | `src/components/tools/UlidGenerator.tsx`（本 PR は枠のみ）                            |
| 生成                 | uuid-v7            | UUID v7 生成                      | `src/components/tools/UuidV7Generator.tsx`, `src/utils/uuid-v7.ts`（**本文**）        |
| 生成                 | dummy-text         | ダミーテキスト生成                | （枠のみ）                                                                            |
| 生成                 | totp-hotp          | TOTP/HOTP ジェネレータ            | `src/components/tools/TotpHotpGenerator.tsx`, `src/utils/totp-hotp.ts`（**本文**）    |
| コード・バーコード   | qr-code            | QRコード生成                      | （枠のみ）                                                                            |
| コード・バーコード   | jan-code           | JANコード生成                     | （枠のみ）                                                                            |
| コード・バーコード   | gs1-databar        | GS1 DataBar 生成                  | （枠のみ）                                                                            |
| コード・バーコード   | qr-ticket          | QRチケット                        | `src/components/tools/QrTicket.tsx`, `src/utils/qr-ticket.ts`（**本文**）             |
| コード・バーコード   | qr-reader          | QRリーダー                        | （枠のみ）                                                                            |
| エンコード・デコード | url-encode         | URLエンコード/デコード            | （枠のみ）                                                                            |
| エンコード・デコード | base64             | Base64 エンコード/デコード        | （枠のみ）                                                                            |
| エンコード・デコード | jwt-decoder        | JWTデコーダー                     | （枠のみ）                                                                            |
| 変換・解析           | json-xml           | JSON / XML 変換                   | （枠のみ）                                                                            |
| 変換・解析           | json-csv           | JSON / CSV 変換                   | （枠のみ）                                                                            |
| 変換・解析           | encoding-converter | 文字コード判定・変換              | （枠のみ）                                                                            |
| 変換・解析           | config-converter   | 設定ファイル相互変換              | （枠のみ）                                                                            |
| 変換・解析           | char-count         | 文字カウント                      | （枠のみ）                                                                            |
| 変換・解析           | sql-formatter      | SQL整形・パラメータ埋め込み       | （枠のみ）                                                                            |
| 変換・解析           | regex-visualizer   | 正規表現ビジュアライザ＆ReDoS検出 | `src/components/tools/RegexVisualizer.tsx`, `src/utils/regex-visualizer/`（**本文**） |
| 変換・解析           | json-formatter     | JSON整形・ビューア                | （枠のみ）                                                                            |

合計 20 ツール。表示名・カテゴリの正本は `src/data/tools.ts`。

---

### Task 1: `docs/tools.md` の骨組みを作る

**Files:**

- Create: `docs/tools.md`

- [ ] **Step 1: 骨組みを書く**

リードイン + 目次 + 4 カテゴリ見出し + 全 20 ツールの `### 表示名` 見出し枠を作る。本文を書く 4 ツール以外は見出しの下に `（後続 PR で記述）` の 1 行プレースホルダを置く。構造は以下:

```markdown
# ツール技術リファレンス

各ツールが内部でどう動くかを開発者向けに解説する。README のツール一覧は「何ができるか」、本ドキュメントは「どう動くか」を扱う。ライブラリの採用理由や設計判断の経緯は [docs/decisions.md](decisions.md) を参照。

各ツールは原則 3 小節（仕組み・アルゴリズム / 準拠仕様・RFC / 制限・エッジケース）で構成する。該当しない小節は省略する。

## 目次

- [生成](#生成)
- [コード・バーコード](#コードバーコード)
- [エンコード・デコード](#エンコードデコード)
- [変換・解析](#変換解析)

## 生成

### ULID生成

（後続 PR で記述）

### UUID v7 生成

...（Task 4 で本文）

### ダミーテキスト生成

（後続 PR で記述）

### TOTP/HOTP ジェネレータ

...（Task 5 で本文）

## コード・バーコード

（各見出し枠。qr-ticket は Task 3 で本文）

## エンコード・デコード

（各見出し枠）

## 変換・解析

（各見出し枠。regex-visualizer は Task 2 で本文）
```

見出しの並び順・表示名は上の対応表（= `src/data/tools.ts`）に厳密に従う。

- [ ] **Step 2: prettier 整形を当てる**

Run: `node_modules/.bin/prettier --write docs/tools.md`
Expected: エラーなく整形完了

- [ ] **Step 3: コミット**

```bash
git add docs/tools.md
git commit -m "docs: ツール技術リファレンスの骨組みを追加"
```

---

### Task 2: 正規表現ビジュアライザ＆ReDoS検出の本文

**Files:**

- Modify: `docs/tools.md`（`### 正規表現ビジュアライザ＆ReDoS検出` セクション）

- [ ] **Step 1: ソースを読む**

以下を読み、事実を抽出する:

- `src/utils/regex-visualizer/parse.ts` — 正規表現のパース（AST 構築）
- `src/utils/regex-visualizer/redos.ts` — ReDoS（壊滅的バックトラッキング）検出アルゴリズムと検出パターン
- `src/utils/regex-visualizer/railroad.ts`, `railroad-layout.ts` — 鉄道図の生成
- `src/utils/regex-visualizer/match.ts` — マッチハイライト・キャプチャグループ
- `src/components/tools/RegexVisualizer.tsx`, `RegexAstTree.tsx`, `RegexRailroad.tsx`, `RegexMatchTester.tsx` — UI 統合

- [ ] **Step 2: 3 小節を書く**

`### 正規表現ビジュアライザ＆ReDoS検出` の下に:

- **仕組み・アルゴリズム**: 正規表現 → AST パース → 構造ツリー / 鉄道図描画の流れ。ReDoS 検出が検査する具体パターン（例: ネストした量化子、重複する選択肢）をソースの実装に即して記述。
- **準拠仕様・RFC**: 対応する正規表現フレーバー（JS `RegExp` 準拠か等）を実装から確認して記述。該当 RFC が無ければ省略。
- **制限・エッジケース**: ReDoS 検出の限界（静的検出ゆえの偽陰性・偽陽性、対応しない構文）をソースのコメント・実装から確認して記述。

- [ ] **Step 3: prettier + コミット**

```bash
node_modules/.bin/prettier --write docs/tools.md
git add docs/tools.md
git commit -m "docs: 正規表現ビジュアライザの技術解説を追加"
```

---

### Task 3: QRチケットの本文

**Files:**

- Modify: `docs/tools.md`（`### QRチケット` セクション）

- [ ] **Step 1: ソースを読む**

- `src/utils/qr-ticket.ts` — 署名・検証・QR 生成・鍵操作のコアロジック（ECDSA P-256）
- `src/components/tools/qr-ticket/index.ts`, `types.ts`, `constants.ts` — UI 層の型・定数
- `src/components/tools/qr-ticket/useTicketKeyPair.ts` — 鍵ペア生成・管理
- `src/components/tools/qr-ticket/useTicketGeneration.ts` — 署名付与フロー
- `src/components/tools/qr-ticket/useTicketVerification.ts` — 検証フロー
- `src/components/tools/QrTicket.tsx`, `GenerateTab.tsx`, `VerifyTab.tsx`, `TicketDetail.tsx` — UI

- [ ] **Step 2: 3 小節を書く**

- **仕組み・アルゴリズム**: ECDSA 鍵ペア生成 → チケットデータに署名 → QR エンコード → 公開鍵によるオフライン検証、の一連のフロー。署名対象（何が署名されるか）と QR に載るデータ構造を実装に即して記述。
- **準拠仕様・RFC**: 使用する曲線・署名形式（実装から確認。例: P-256 / ECDSA）。WebCrypto API 依存の有無。
- **制限・エッジケース**: 鍵の保存場所・寿命、QR 容量による署名対象サイズの制約、オフライン検証の前提（公開鍵の配布方法）をソースから確認して記述。

- [ ] **Step 3: prettier + コミット**

```bash
node_modules/.bin/prettier --write docs/tools.md
git add docs/tools.md
git commit -m "docs: QRチケットの技術解説を追加"
```

---

### Task 4: UUID v7 生成の本文

**Files:**

- Modify: `docs/tools.md`（`### UUID v7 生成` セクション）

- [ ] **Step 1: ソースを読む**

- `src/utils/uuid-v7.ts` — UUID v7 生成ロジック・タイムスタンプ/ランダムフィールドのビット配置・フィールド分解
- `src/components/tools/UuidV7Generator.tsx` — UI・一括生成・表示

- [ ] **Step 2: 3 小節を書く**

- **仕組み・アルゴリズム**: 48bit Unix ミリ秒タイムスタンプ + version/variant + ランダムビットの配置を実装に即して記述。一括生成時の単調性（同一ミリ秒内の扱い）をソースから確認。フィールド分解表示の内容。
- **準拠仕様・RFC**: RFC 9562（UUID v7 を定義）へのリンク。実装がどこまで RFC に準拠しているか。
- **制限・エッジケース**: 乱数源（`crypto.getRandomValues` 等）、単調性保証の有無、時刻巻き戻り時の挙動をソースから確認して記述。

- [ ] **Step 3: prettier + コミット**

```bash
node_modules/.bin/prettier --write docs/tools.md
git add docs/tools.md
git commit -m "docs: UUID v7 生成の技術解説を追加"
```

---

### Task 5: TOTP/HOTP ジェネレータの本文

**Files:**

- Modify: `docs/tools.md`（`### TOTP/HOTP ジェネレータ` セクション）

- [ ] **Step 1: ソースを読む**

- `src/utils/totp-hotp.ts` — HOTP/TOTP コード生成・検証・HMAC・時刻ウィンドウ
- `src/components/tools/TotpHotpGenerator.tsx` — UI・シークレット入力・検証

- [ ] **Step 2: 3 小節を書く**

- **仕組み・アルゴリズム**: HOTP（カウンタ + HMAC + 動的切り出し）と TOTP（時刻ベースカウンタ）の生成手順を実装に即して記述。使用ハッシュ（SHA-1/256 等）・桁数・時間ステップをソースから確認。シークレットがブラウザ外に送信されない設計。
- **準拠仕様・RFC**: RFC 4226（HOTP）・RFC 6238（TOTP）へのリンクと、実装での解釈。
- **制限・エッジケース**: 時刻ずれ許容ウィンドウ、対応する Base32 シークレット形式、検証時の許容範囲をソースから確認して記述。

- [ ] **Step 3: prettier + コミット**

```bash
node_modules/.bin/prettier --write docs/tools.md
git add docs/tools.md
git commit -m "docs: TOTP/HOTP ジェネレータの技術解説を追加"
```

---

### Task 6: README リンクと doc 更新ルールの追記

**Files:**

- Modify: `README.md`（`## ツール一覧` 直下）
- Modify: `.agents/rules/common.md`（4 章「ドキュメント更新ルール」の表）

- [ ] **Step 1: README にリンクを追加**

`README.md` の `## ツール一覧` 見出しの次の段落（現在「トップページの検索ボックスから〜」の行）の前または後に 1 行追加:

```markdown
各ツールの技術的な仕組み・準拠 RFC・制限は [docs/tools.md](docs/tools.md) を参照。
```

- [ ] **Step 2: 既存の README テーブルは変更しない**

カテゴリ別の 1 行説明テーブルはそのまま維持する（重複させない）。

- [ ] **Step 3: doc 更新ルールに行を追加**

`.agents/rules/common.md` の 4 章「ドキュメント更新ルール」の表に行を追加:

```markdown
| ツール追加・挙動変更（技術解説に影響） | `docs/tools.md`（該当ツールの仕組み・制限を更新） |
```

挿入位置は「ツール追加」行の近く。既存行の書式（パイプ整形）に合わせる。

- [ ] **Step 4: prettier + コミット**

```bash
node_modules/.bin/prettier --write README.md .agents/rules/common.md
git add README.md .agents/rules/common.md
git commit -m "docs: README から tools.md へのリンクと更新ルールを追加"
```

---

### Task 7: 最終検証

- [ ] **Step 1: prettier 全体チェック**

Run: `node_modules/.bin/prettier --check .`
Expected: `All matched files use Prettier code style!`（EXIT 0）

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラー 0（docs 変更のみなので影響しないはずだが確認）

- [ ] **Step 3: meta テスト**

Run: `npm run test`
Expected: 全 pass。特に `tests/meta/docs-section-references.test.ts` が docs 内のセクション参照を検証するため、`docs/tools.md` 追加で壊れていないことを確認する。集計行 `Test Files N passed` / `Tests M passed` を必ず目視する。

- [ ] **Step 4: リンク・見出しの目視確認**

`docs/tools.md` の目次アンカーが各カテゴリ見出しに正しく飛ぶこと、README のリンクが `docs/tools.md` に解決することを確認する。

---

## Self-Review メモ

- **Spec coverage**: 配置・リンク（Task 6）/ 構造（Task 1）/ 3 小節（Task 2-5）/ ドリフト対策（Task 6 Step 3）/ 初期スコープ代表 4 ツール（Task 2-5）/ 全ツール見出し枠（Task 1）— 全てタスクに対応済み。
- **ツール数訂正**: spec は「21 個」と記載したが、`src/data/tools.ts` の実カウントは 20 個（`slug: string` インターフェース行を除く）。本計画は 20 で確定。spec 側も実装時に 21→20 へ修正する。
- **プレースホルダ**: 本文 4 タスクは「ソースを読んで事実を書く」性質上、最終 prose は計画に含めない。代わりに読むファイルと記述項目を具体列挙しており、これは指示であってプレースホルダではない。
