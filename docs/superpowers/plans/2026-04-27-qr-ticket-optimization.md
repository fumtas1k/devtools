# QRチケットデータ構造最適化 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QRチケットのデータ構造をJSONからパイプ `|` 区切りのフラットな形式に変更し、Unixタイムスタンプを採用することでデータ量を削減し、読取精度を向上させる。

**Architecture:** `src/utils/qr-ticket.ts` の内部ロジックを全面的に刷新し、JSONのパース/文字列化を `split('|')` / `join('|')` に置き換える。バリデーション層で入力データの `|` を置換し、パースの崩れを防止する。

**Tech Stack:** TypeScript, Web Crypto API, Vitest (Unit Tests), Playwright (E2E Tests)

---

### Task 1: ユーティリティ関数の修正とユニットテストの更新

**Files:**

- Modify: `src/utils/qr-ticket.ts`
- Modify: `src/utils/__tests__/qr-ticket.test.ts`

- [ ] **Step 1: ユニットテストを新しい形式に合わせて修正（失敗させる）**
      既存のJSONベースのテストを削除し、新しい区切り文字形式の期待値に変更する。

```typescript
// src/utils/__tests__/qr-ticket.test.ts の一部
test('正しい形式の文字列を検証できる', async () => {
  const keyPair = await generateKeyPair();
  const payload = { e: 'E-1', t: 'T-1', x: '2099-12-31T23:59:59Z' };
  const signed = await signTicket(payload, keyPair.privateKey);
  const qrString = ticketToQrString(signed);

  // 期待値: eventId|ticketId|timestamp|name|category|signature
  expect(qrString).toMatch(/^E-1\|T-1\|\d+\|\|\|.+/);

  const result = await verifyTicket(qrString, keyPair.publicKey);
  expect(result.valid).toBe(true);
});
```

- [ ] **Step 2: テストを実行して失敗することを確認**
      Run: `npx vitest src/utils/__tests__/qr-ticket.test.ts`
      Expected: FAIL (JSON.parse エラーなど)

- [ ] **Step 3: `src/utils/qr-ticket.ts` の実装を更新**
      `buildPayload`, `signTicket`, `verifyTicket`, `ticketToQrString` を設計通りに修正する。

```typescript
// 内部ヘルパー: パイプを置換
function sanitizeField(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\|/g, ' ');
}

export function buildPayload(ticket: TicketPayload): string {
  const timestamp = Math.floor(new Date(ticket.x).getTime() / 1000);
  return [
    sanitizeField(ticket.e),
    sanitizeField(ticket.t),
    timestamp.toString(),
    sanitizeField(ticket.n),
    sanitizeField(ticket.p),
  ].join('|');
}

export function ticketToQrString(ticket: SignedTicket): string {
  const payload = buildPayload(ticket);
  return `${payload}|${ticket.s}`;
}

export async function verifyTicket(
  rawData: string,
  publicKey: CryptoKey
): Promise<VerificationResult> {
  const parts = rawData.split('|');
  if (parts.length !== 6) {
    return { valid: false, ticket: null, expired: false, error: 'QRデータの形式が不正です' };
  }

  const [e, t, tsStr, n, p, s] = parts;
  const timestamp = parseInt(tsStr, 10);
  const expiryDate = new Date(timestamp * 1000);

  const payload: TicketPayload = {
    e,
    t,
    x: expiryDate.toISOString(),
    n: n || undefined,
    p: p || undefined,
  };
  // ... 署名検証ロジック ...
}
```

- [ ] **Step 4: ユニットテストを実行してパスすることを確認**
      Run: `npx vitest src/utils/__tests__/qr-ticket.test.ts`
      Expected: PASS

- [ ] **Step 5: コミット**
      Run: `git branch --show-current` (featureブランチであることを確認)
      Run: `git add src/utils/qr-ticket.ts src/utils/__tests__/qr-ticket.test.ts && git commit -m "feat: QRチケットのデータ構造をパイプ区切り形式に移行"`

---

### Task 2: UIコンポーネントの不整合修正

**Files:**

- Modify: `src/components/tools/QrTicket.tsx`
- Modify: `src/components/tools/qr-ticket/TicketDetail.tsx`
- Modify: `src/components/tools/qr-ticket/types.ts`

- [ ] **Step 1: UI側の生成ロジックの修正**
      `QrTicket.tsx` で、有効期限を `timestamp` (number) として扱うように変更する。
- [ ] **Step 2: 表示コンポーネントの修正**
      `TicketDetail.tsx` で `timestamp` を人間が読める形式に変換して表示するように変更する。
- [ ] **Step 3: 型定義の整合性確認**
      `types.ts` やテストコード内の `@ts-ignore` を削除し、完全に型安全な状態にする。
- [ ] **Step 4: コミット**
      Run: `git add . && git commit -m "fix: QRチケットのUI層を新しいデータ構造に対応"`

---

### Task 3: 読取限界の調査とバリデーションの実装

**Files:**

- Create: `src/utils/__tests__/qr-limit-investigation.test.ts` (調査完了後削除)
- Modify: `src/components/tools/QrTicket.tsx`
- Modify: `src/components/tools/qr-ticket/GenerateTab.tsx`
- Modify: `tests/e2e/qr-ticket.spec.ts`

- [x] **Step 1: 読取限界の調査**
      160pxサイズにおいて、文字数と読取成功率の相関を調査。合計300バイト（UTF-8）程度が実用上の限界であることを特定。
- [x] **Step 2: 生成時のバリデーション実装**
      `QrTicket.tsx` に全入力項目の合計300バイト超えをブロックするロジックを追加。
- [x] **Step 3: UIへのヒント追加**
      `GenerateTab.tsx` に推奨データ量の注釈を表示し、各行にリアルタイムのバイト数計算表示を追加。
- [x] **Step 4: E2Eテストの追加**
      `qr-ticket.spec.ts` に文字数制限バリデーションのテストケースを追加。
- [x] **Step 5: コミット**
      Run: `git add . && git commit -m "feat: QRチケットの名前・区分に合計80文字のバリデーションを追加"`

---

### Task 4: E2Eテストによる全体の動作確認

**Files:**

- Test: `tests/e2e/qr-ticket.spec.ts`

- [ ] **Step 1: E2Eテストを実行**
      UI側での表示や動作（生成・検証）に影響がないか確認する。
      Run: `npm run test:e2e tests/e2e/qr-ticket.spec.ts`
      Expected: PASS (UIの入力・表示項目は変わっていないため、正常に動作するはず)

- [ ] **Step 2: 不具合があれば修正**
      もしUI側のパースエラー等があれば `src/components/tools/qr-ticket/VerifyTab.tsx` 等を修正する。

- [ ] **Step 3: コミット**
      Run: `git add . && git commit -m "test: QRチケット最適化後のE2Eテスト合格を確認"`

---

### Task 3: 最終クリーンアップ

- [ ] **Step 1: ビジュアルコンパニオンの停止**
      Run: `/Users/fumta/.gemini/extensions/superpowers/skills/brainstorming/scripts/stop-server.sh`

- [ ] **Step 2: 作業完了の報告**
