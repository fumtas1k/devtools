# ダウンロードボタンのデザイン統一 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 各ツールに散在するダウンロードボタンを新設の `DownloadButton` コンポーネントに統一し、UIの一貫性とメンテナンス性を向上させる。

**Architecture:** `src/components/ui/DownloadButton.tsx` を新規作成し、既存の `DownloadButtonGroup` の内部実装を置換、さらに各ツールのインラインボタンや `ActionButton` を新コンポーネントに置き換える。

**Tech Stack:** React, Tailwind CSS, TypeScript

---

### Task 1: `DownloadButton` コンポーネントの作成

**Files:**

- Create: `src/components/ui/DownloadButton.tsx`
- Test: `tests/e2e/download-button.spec.ts` (新規作成)

- [x] **Step 1: コンポーネントの実装**
  - カラーコードを規約に従い `colors.textOnPrimary` に修正。
- [x] **Step 2: E2Eテストの作成**
  - `tests/e2e/download-button.spec.ts` を作成し、実際の画面上での表示とスタイルを確認する。
- [x] **Step 3: テスト実行とコミット**
  - Run: `npm run test:e2e`
  - Commit: `feat: add DownloadButton component and its E2E test`

---

### Task 2: `DownloadButtonGroup` のリファクタリング

**Files:**

- Modify: `src/components/ui/DownloadButtonGroup.tsx`

- [x] **Step 1: 内部実装を `DownloadButton` に置換**
  - **追加**: モバイル対応として `flex-wrap` と `justify-center` を適用。
- [x] **Step 2: 動作確認とコミット**
  - 既存のテストが通ることを確認。
  - Commit: `refactor: use DownloadButton in DownloadButtonGroup`

---

### Task 3: インライン実装の置換 (QrCode, JsonCsv, EncodingConverter)

**Files:**

- Modify: `src/components/tools/QrCode.tsx`
- Modify: `src/components/tools/JsonCsv.tsx`
- Modify: `src/components/tools/EncodingConverter.tsx`

- [x] **Step 1: 各ツールのボタンを置換**
  - QrCode: 「SVG ダウンロード」→ `DownloadButton` (secondary, "SVGダウンロード")
  - JsonCsv: インラインボタン → `DownloadButton` (secondary, "CSVダウンロード")
  - EncodingConverter: インラインボタン → `DownloadButton` (secondary, "ダウンロード")

- [x] **Step 2: コミット**
  - Commit: `refactor: replace inline download buttons with DownloadButton`

---

### Task 4: Gs1Databar と QRチケット の置換

**Files:**

- Modify: `src/components/tools/Gs1Databar.tsx`
- Modify: `src/components/tools/qr-ticket/GenerateTab.tsx`

- [x] **Step 1: Gs1Databar の「全件ZIPダウンロード」を置換**
  - **追加**: AIフィールドのレスポンシブ対応（`flex-col sm:flex-row`）。
  - **追加**: 幅指定を Tailwind 標準クラス `sm:w-50` に修正。
- [x] **Step 2: QRチケットのダウンロード系ボタンを置換**
  - 「一括ZIPダウンロード」 (primary)
  - 「SVG保存」→「SVGダウンロード」 (secondary)
- [x] **Step 3: コミット**
  - Commit: `refactor: update GS1 DataBar and QR Ticket download buttons`

---

### Task 5: E2Eテストの修正と最終確認

**Files:**

- Modify: `tests/e2e/qr-code.spec.ts`
- Modify: `tests/e2e/qr-ticket.spec.ts` (必要に応じて)
- Modify: `CLAUDE.md`

- [x] **Step 1: E2Eテストのラベル修正**
  - スペースなしの「SVGダウンロード」に統一されていることを確認済み。
- [x] **Step 2: 全テスト実行**
  - Run: `npm run test && npm run test:e2e`
- [x] **Step 3: CLAUDE.md の更新**
  - 共通UIコンポーネント表に `DownloadButton` が含まれていることを確認済み。
- [x] **Step 4: コミット**
  - Commit: `test: fix E2E tests and update documentation`
