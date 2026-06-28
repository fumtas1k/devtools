# ダミー個人データ生成: 一意性オプション 設計書

- 対象 issue: #735
- 由来: PR #734（`dummy-personal-data` 追加）レビュー改善提案 2 の分離

## 背景・目的

現状の辞書規模（姓 30 × 名 40 ≒ 1,200 通り）に対し最大 3,000 件生成可能なため、
氏名・メール・電話番号の重複が高頻度で発生する。テストデータ用途では「メールや主キーは
一意であってほしい」需要があるため、一意性を担保するオプションを追加する。

## スコープ

- **連番ID列 (No.)**: 各レコードに 1 始まりの連番列を付与（出力時の列、レコード値ではない）
- **一意化トグル**: メール・固定電話・携帯番号を一意化する
  - 氏名・フリガナは一意化対象外（辞書規模 ≒1,200 で 3,000 件の完全一意化は原理的に不可）
- UI は「連番列」と「一意化」を**別トグル**として提供

### スコープ外

- 氏名の一意化（辞書規模の制約）
- Excel 出力対応（既存スコープ通り CSV/JSON のみ）

## UI 設計（`src/components/tools/DummyPersonalData.tsx`）

既存の `ToggleChips`（多選択トグル・各チップ独立 ON/OFF・`aria-pressed`・`<fieldset>`/`<legend>`
で a11y 対応済み）を再利用し、「出力オプション」グループに 2 チップを追加する。

- チップ 1: **連番ID列 (No.)** — state `seqId: boolean`、既定 `false`
- チップ 2: **メール・電話番号を一意化** — state `unique: boolean`、既定 `false`

挙動:

- プレビュー表: `seqId` が ON のとき先頭に「No.」列を追加し、行番号（index + 1）を表示する
- 生成: `generateRecords` の options に `unique` を渡す
- ダウンロード: `toCsv` / `toJson` に `seqId` を渡す

## ロジック設計（`src/utils/dummy-personal-data/generate.ts`）

`GenerateOptions` に `unique: boolean` を追加。`generateRecords` で全件生成した後、
`unique` が true のときに一意化の後処理を行う（issue の指示「`generateRecords` に一意化の
後処理を加える」に沿う）。

### メールアドレスの一意化（連番付与）

- `Set<string>` で既出を追跡し、初出はそのまま採用
- 衝突時はローカル部（`@` の前）に最小の整数サフィックスを付けて一意化
  - 例: `sato.haruto@example.com` → `sato.haruto1@example.com` → `sato.haruto2@example.com`
- サフィックス付与後も Set に含まれる場合はインクリメントして再試行（必ず成功する）
- 関数: `makeUniqueEmail(email: string, seen: Set<string>): string`

### 固定電話の一意化（市外局番保持・再生成）

- `Set<string>` で既出を追跡し、初出はそのまま採用
- 衝突時は電話文字列から市外局番（先頭 `-` まで）を取り出し、加入者番号
  （市内局番 + 末尾 4 桁）のみを再生成する。市外局番を保持するため住所との整合が崩れない
  - 全体 10 桁・先頭 0 を維持
- 境界付きリトライ（既定 1000 回）。枯渇時（現実的には起こらない）は元値を採用
- 関数: `regenPhoneKeepingAreaCode(phone: string): string`

### 携帯番号の一意化（再生成）

- `Set<string>` で既出を追跡し、初出はそのまま採用
- 衝突時は `pickMobile()` で再生成（`090-0XXX-XXXX` / `070-0XXX-XXXX` の非実在帯を維持）
- 境界付きリトライ

### 共通ヘルパー

- `makeUniqueByRegen(value, seen, generator, maxAttempts): string`
  - 固定電話・携帯の再生成方式で共用する

export: 上記ヘルパーはテスト検証のため export する。

## シリアライズ設計（`src/utils/dummy-personal-data/serialize.ts`）

`toCsv` / `toJson` に第 3 引数 `withSeqId: boolean`（既定 `false`）を追加。

- ON のとき先頭に「No.」列/キー（1 始まり）を付与
- JSON: `No.` を数値（主キー用途で扱いやすい）
- CSV: `No.` を文字列（papaparse のヘッダ・行に追加）

## テスト設計（test-gates 準拠）

### `__tests__/generate.test.ts`

- 一意化 ON・3,000 件で `email` / `phone` / `mobile` が全件一意（`new Set(...).size === count`）
- **陽性対照**: 一意化 OFF・高件数（例 3,000）で少なくとも 1 つのフィールドに重複が発生する
  ことを確認（テストに検出能力があること＝一意化処理が実際に効いていることを担保）
- 一意化後も固定電話が市外局番を保持し 10 桁整合を維持
- 一意化後も携帯が `isNonExistentMobile` を満たす
- `makeUniqueEmail` の連番付与（初出はそのまま・衝突で `1,2,…`）

### `__tests__/serialize.test.ts`

- `withSeqId` ON で「No.」列が先頭に来る（CSV ヘッダ・JSON キー順）
- JSON の `No.` が数値で 1 始まり

### E2E

- 既存 E2E があれば一意化トグル ON → 生成 → No. 列表示・一意性を確認するケースを追加

## ドキュメント更新

- `SPEC.md` 5.31（生成ロジック・シリアライズの記述に一意化・連番列を追記）
- `docs/tools.md` 日本語ダミー個人データ生成（一意化・連番列の仕組みを追記）
- `docs/decisions.md`（一意化戦略: メールは連番付与・電話/携帯は再生成・氏名は対象外の理由）

## 注意（運用）

UI にチップを追加するため VRT baseline に差分が出る。**web セッションのトークンでは
`workflow_dispatch` 不可**のため、`Update Visual Regression Baseline` workflow の手動トリガーが
PR 後に必要（`.claude/rules/github-web-session.md`）。
