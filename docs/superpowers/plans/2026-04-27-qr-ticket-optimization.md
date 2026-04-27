# QRチケットデータ構造最適化 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QRチケットのデータ構造をJSONからパイプ `|` 区切りのフラットな形式に変更し、Unixタイムスタンプを採用することでデータ量を削減し、読取精度を向上させる。

**Architecture:** `src/utils/qr-ticket.ts` の内部ロジックを全面的に刷新し、JSONのパース/文字列化を `split('|')` / `join('|')` に置き換える。バリデーション層で共通のバイト数見積もり関数を使用し、一貫性を保つ。

**Tech Stack:** TypeScript, Web Crypto API, Vitest (Unit Tests), Playwright (E2E Tests)

---

### Task 1: ユーティリティ関数の修正とユニットテストの更新 ✅ 完了

**Files:**

- Modify: `src/utils/qr-ticket.ts`
- Modify: `src/utils/__tests__/qr-ticket.test.ts`

- [x] **Step 1: ユニットテストを新しい形式に合わせて修正**
- [x] **Step 2: テストを実行して失敗することを確認**
- [x] **Step 3: `src/utils/qr-ticket.ts` の実装を更新**
- [x] **Step 4: ユニットテストを実行してパスすることを確認**
- [x] **Step 5: コミット**

---

### Task 2: UIコンポーネントの不整合修正 ✅ 完了

**Files:**

- Modify: `src/components/tools/QrTicket.tsx`
- Modify: `src/components/tools/qr-ticket/TicketDetail.tsx`
- Modify: `src/components/tools/qr-ticket/types.ts`

- [x] **Step 1: UI側の生成ロジックの修正**
- [x] **Step 2: 表示コンポーネントの修正**
- [x] **Step 3: 型定義の整合性確認**
- [x] **Step 4: コミット**

---

### Task 3: 読取限界の調査とバリデーションの実装 ✅ 完了

**Files:**

- Create: `src/utils/__tests__/qr-limit-investigation.test.ts` (削除済み)
- Modify: `src/components/tools/QrTicket.tsx`
- Modify: `src/components/tools/qr-ticket/GenerateTab.tsx`
- Modify: `tests/e2e/qr-ticket.spec.ts`

- [x] **Step 1: 読取限界の調査**
- [x] **Step 2: 生成時のバリデーション実装（正確な250バイト制限）**
- [x] **Step 3: UIへのヒント追加（リアルタイムバイト数表示・スマホレスポンシブ対応）**
- [x] **Step 4: E2Eテストの追加（制限バリデーションの検証）**
- [x] **Step 5: コミット**

---

### Task 4: E2Eテストによる全体の動作確認 ✅ 完了

**Files:**

- Test: `tests/e2e/qr-ticket.spec.ts`

- [x] **Step 1: E2Eテストを実行**
- [x] **Step 2: 不具合があれば修正（構文エラーの解消等）**
- [x] **Step 3: コミット**

---

### Task 5: 最終クリーンアップ ✅ 完了

- [x] **Step 1: ビジュアルコンパニオンの停止**
- [x] **Step 2: 調査用一時ファイルの削除**
- [x] **Step 3: 各ドキュメントの最終同期**
- [x] **Step 4: 作業完了の報告**
