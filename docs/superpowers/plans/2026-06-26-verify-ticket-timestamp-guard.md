# verifyTicket timestamp 0・負値 回帰ガード Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `verifyTicket` が timestamp 0・負値の署名済みチケットを `valid: false` で拒否することを回帰テストで固定する。

**Architecture:** 既存実装（`src/utils/qr-ticket.ts:182` の `timestamp <= 0` ガード）の現挙動を回帰テストで固定するのみ。実装変更は行わない。陽性対照は既存の正常系テスト（`valid: true`）が担保。

**Tech Stack:** Vitest, TypeScript, WebCrypto（ECDSA P-256）

---

### Task 1: timestamp 0・負値の回帰テストを追加

**Files:**
- Modify: `src/utils/__tests__/qr-ticket.test.ts`（`signTicket / verifyTicket` describe の末尾、現状 `297` 行目 `});` の直前に追加）

**前提確認（コードは既に揃っている）:**
- `qr-ticket.test.ts` 冒頭で `generateKeyPair`, `signTicket`, `verifyTicket`, `ticketToQrString`, `type TicketPayload` が import 済み。
- describe `'signTicket / verifyTicket'` 内に正常系テスト（`valid: true`、陽性対照）が既存。

- [ ] **Step 1: 失敗するはずのテスト2件を追加**

`src/utils/__tests__/qr-ticket.test.ts` の `describe('signTicket / verifyTicket', ...)` ブロック内、最後の `it(...)`（`'任意フィールド（n, p）付きチケットの署名・検証が正しく動作する'`）の直後・describe 閉じ `});` の直前に以下を挿入する:

```ts
  it('timestamp が 0 の署名済みチケットは verifyTicket で valid: false になる', async () => {
    const pair = await generateKeyPair();
    const zeroTs: TicketPayload = { e: 'ev', t: 'T-1', timestamp: 0 };
    const signed = await signTicket(zeroTs, pair.privateKey);
    const result = await verifyTicket(ticketToQrString(signed), pair.publicKey);
    expect(result.valid).toBe(false);
  });

  it('timestamp が負値の署名済みチケットは verifyTicket で valid: false になる', async () => {
    const pair = await generateKeyPair();
    const negTs: TicketPayload = { e: 'ev', t: 'T-1', timestamp: -3600 };
    const signed = await signTicket(negTs, pair.privateKey);
    const result = await verifyTicket(ticketToQrString(signed), pair.publicKey);
    expect(result.valid).toBe(false);
  });
```

- [ ] **Step 2: テストを実行して green を確認**

実装は既に `timestamp <= 0` を弾くため、追加直後から PASS する（これは現挙動の固定）。

Run: `npm run test -- src/utils/__tests__/qr-ticket.test.ts`
Expected: 追加2件を含め全 PASS。

- [ ] **Step 3: 陽性対照の担保を確認（test-gates）**

同 describe 内の `'正常系: 署名したチケットを公開鍵で検証できる'`（`valid: true` を確認）が陽性対照として既存であることを目視確認する。「常に false を返す壊れ方」を検出できる状態であることを担保（新規追加は不要）。

- [ ] **Step 4: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラー 0。

- [ ] **Step 5: コミット**

```bash
git add src/utils/__tests__/qr-ticket.test.ts
git commit -m "test: verifyTicket が timestamp 0・負値を拒否することを回帰ガード"
```

---

## 検証（全体）

- `npm run test -- src/utils/__tests__/qr-ticket.test.ts`（該当ファイル green）
- `node_modules/.bin/astro check`（型）
- E2E / VRT: UI 変更なしのため対象外。

## ドキュメント更新

ツール追加・挙動変更ではないため README / SPEC / docs/tools.md の更新は不要。
