# PR #102 レビューコメント対応実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR #102 で指摘された Hydration ミスマッチの修正と等幅フォント判定ロジックのリファクタリングを行う。

**Architecture:**

- `QrTicket.tsx` では `useEffect` を用いてクライアントサイドでのみ初期値をセットし、SSG 時のミスマッチを防止する。
- `TicketDetail.tsx` では等幅判定用の定数をモジュールスコープに切り出し、可読性と保守性を向上させる。

**Tech Stack:** React 19, Astro 6

---

### Task 1: QrTicket.tsx の Hydration ミスマッチ修正

**Files:**

- Modify: `src/components/tools/QrTicket.tsx`

- [ ] **Step 1: expiry ステートの初期値を空文字列に変更し、useEffect で初期値をセットする**

```tsx
// 生成タブ状態
const [eventId, setEventId] = useState('');
const [expiry, setExpiry] = useState(''); // 初期値を空にする

// マウント後に初期値をセット
useEffect(() => {
  setExpiry(getDefaultExpiry());
}, []);
```

- [ ] **Step 2: 動作確認（プレビューなどで有効期限が表示されること）**

### Task 2: TicketDetail.tsx のリファクタリング

**Files:**

- Modify: `src/components/tools/qr-ticket/TicketDetail.tsx`

- [ ] **Step 1: 等幅フォントを適用するラベル名の配列をモジュールスコープに定義し、それを使用するように修正する**

```tsx
const MONO_LABELS = ['チケットID', 'イベントID'];

export function TicketDetail({ ticket }: { ticket: TicketPayload }) {
  // ...
  <td
    style={{
      ...caption,
      color: colors.text,
      fontFamily: MONO_LABELS.includes(label) ? 'monospace' : undefined,
    }}
  >
    {value}
  </td>;
  // ...
}
```

### Task 3: 最終確認と返信

- [ ] **Step 1: 全ての E2E テストを実行してリグレッションがないか確認する**

Run: `npm run test:e2e`

- [ ] **Step 2: 修正内容をコミットしてプッシュする**

- [ ] **Step 3: GitHub のレビューコメントに返信する**
