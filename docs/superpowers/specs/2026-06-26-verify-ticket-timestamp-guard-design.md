# verifyTicket の timestamp 0・負値拒否 回帰ガード（issue #576）

## 目的

`verifyTicket` が「timestamp が 0 もしくは負値の署名済みチケットを `valid: false` で拒否する」ことを回帰テストで固定する。`serializeTicket` 側（timestamp 0・負値を文字列として通す）は #574 / PR #575 で既にピン止め済みであり、その対となる verify 側の回帰ガードが欠けている。両側を固定することで「serialize で通し verify で弾く」という責務分離が回帰ガードとして完結する。

## 背景

- PR #575 レビュー（fumtas1k）の Suggestion 由来。
- 現状の実装: `src/utils/qr-ticket.ts:182` で `timestamp <= 0` を**署名検証より前に**弾き、`valid: false` / `error: '必須フィールドの欠落または形式が不正です'` を返す。
- そのため本テスト追加は**実装変更を伴わない純粋なテスト追加**である（実装の現挙動を回帰ガードとして固定するのみ）。

## スコープ

### やること

`src/utils/__tests__/qr-ticket.test.ts` の `signTicket / verifyTicket` describe 内に以下 2 ケースを追加する。

1. `timestamp: 0` の署名済みチケットを `verifyTicket` に通すと `valid: false` になる
2. `timestamp: -3600`（負値）の署名済みチケットを `verifyTicket` に通すと `valid: false` になる

各ケースは `generateKeyPair` → `signTicket` → `ticketToQrString` → `verifyTicket` の実フローで検証する（issue #576 記載の完成形コードに準拠）。

### やらないこと

- 実装（`src/utils/qr-ticket.ts`）の変更。現挙動を固定するのみ。
- `serializeTicket` 側のテスト追加（#574 / PR #575 で対応済み）。
- UI 変更・新ツール追加に類する作業は一切ない（README / SPEC / docs/tools.md / VRT は対象外）。

## test-gates 観点

本テストは「検知機構（validator = `verifyTicket`）の回帰ガード」にあたる。陰性対照（`valid: false` を期待するケース）のみでは「`verifyTicket` が常に false を返す壊れ方」と区別できないため、陽性対照が必須。

- 陽性対照は既存テスト `'正常系: 署名したチケットを公開鍵で検証できる'`（`qr-ticket.test.ts:210`、正常な未来 timestamp で `valid: true` を確認）が担保している。
- よって陽性対照の新規追加は不要。実装時に `test-gates` skill を参照し、この担保関係を確認すること。

## 検証

- `npm run test`（該当テストファイルが green になること）
- `node_modules/.bin/astro check`（型チェック）
- E2E（`npm run test:e2e`）・VRT は UI 変更がないため対象外。

## 関連

- issue #576 / PR #575（#574 対応）/ #574
