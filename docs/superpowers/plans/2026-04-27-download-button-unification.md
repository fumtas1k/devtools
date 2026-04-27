# ダウンロードボタンのデザイン統一 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 各ツールに散在するダウンロードボタンを新設の `DownloadButton` コンポーネントに統一し、UIの一貫性とメンテナンス性を向上させる。

**Architecture:** `src/components/ui/DownloadButton.tsx` を新規作成し、既存の `DownloadButtonGroup` の内部実装を置換、さらに各ツールのインラインボタンや `ActionButton` を新コンポーネントに置き換える。

**Tech Stack:** React, Tailwind CSS, TypeScript

---

### Task 1: `DownloadButton` コンポーネントの作成

**Files:**

- Create: `src/components/ui/DownloadButton.tsx`
- Test: `src/utils/__tests__/download-button.test.tsx` (新規作成)

- [ ] **Step 1: コンポーネントの実装**

```tsx
import { colors, caption } from '@/utils/styles';

interface Props {
  onClick: () => void;
  label: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function DownloadButton({
  onClick,
  label,
  variant = 'primary',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: Props) {
  const isPrimary = variant === 'primary';

  const baseStyle: React.CSSProperties = {
    ...caption,
    fontWeight: 600,
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  };

  const variantStyle: React.CSSProperties = isPrimary
    ? {
        background: disabled ? colors.bgSubtle : colors.primary,
        color: disabled ? colors.muted : '#ffffff',
        border: 'none',
      }
    : {
        background: 'transparent',
        color: disabled ? colors.muted : colors.primary,
        border: `1px solid ${disabled ? colors.border : colors.primary}`,
      };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel || label}
      className={`${isPrimary ? 'hover:opacity-90' : 'hover:bg-blue-50'} ${className}`}
      style={{ ...baseStyle, ...variantStyle }}
    >
      <DownloadIcon />
      {label}
    </button>
  );
}
```

- [ ] **Step 2: ユニットテストの作成**

`src/components/ui/__tests__/DownloadButton.test.tsx` を作成し、レンダリングとクリックイベントを確認する。

- [ ] **Step 3: テスト実行とコミット**

Run: `npm run test`
Commit: `feat: add DownloadButton component`

---

### Task 2: `DownloadButtonGroup` のリファクタリング

**Files:**

- Modify: `src/components/ui/DownloadButtonGroup.tsx`

- [ ] **Step 1: 内部実装を `DownloadButton` に置換**

```tsx
import { DownloadButton } from './DownloadButton';

interface Props {
  onDownloadSvg: () => void;
  onDownloadPng?: () => void;
}

export function DownloadButtonGroup({ onDownloadSvg, onDownloadPng }: Props) {
  return (
    <div className="flex gap-2">
      <DownloadButton onClick={onDownloadSvg} label="SVGダウンロード" variant="secondary" />
      {onDownloadPng && (
        <DownloadButton onClick={onDownloadPng} label="PNGダウンロード" variant="primary" />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 動作確認とコミット**

既存のテストが通ることを確認。
Commit: `refactor: use DownloadButton in DownloadButtonGroup`

---

### Task 3: インライン実装の置換 (QrCode, JsonCsv, EncodingConverter)

**Files:**

- Modify: `src/components/tools/QrCode.tsx`
- Modify: `src/components/tools/JsonCsv.tsx`
- Modify: `src/components/tools/EncodingConverter.tsx`

- [ ] **Step 1: 各ツールのボタンを置換**
  - QrCode: 「SVG ダウンロード」→ `DownloadButton` (secondary, "SVGダウンロード")
  - JsonCsv: インラインボタン → `DownloadButton` (secondary, "CSVダウンロード")
  - EncodingConverter: インラインボタン → `DownloadButton` (secondary, "ダウンロード")

- [ ] **Step 2: コミット**
      Commit: `refactor: replace inline download buttons with DownloadButton`

---

### Task 4: Gs1Databar と QRチケット の置換

**Files:**

- Modify: `src/components/tools/Gs1Databar.tsx`
- Modify: `src/components/tools/qr-ticket/GenerateTab.tsx`

- [ ] **Step 1: Gs1Databar の「全件ZIPダウンロード」を置換**
- [ ] **Step 2: QRチケットのダウンロード系ボタンを置換**
  - 「一括ZIPダウンロード」 (primary)
  - 「SVG保存」→「SVGダウンロード」 (secondary)
- [ ] **Step 3: コミット**
      Commit: `refactor: update GS1 DataBar and QR Ticket download buttons`

---

### Task 5: E2Eテストの修正と最終確認

**Files:**

- Modify: `tests/e2e/qr-code.spec.ts`
- Modify: `tests/e2e/qr-ticket.spec.ts` (必要に応じて)
- Modify: `CLAUDE.md`

- [ ] **Step 1: E2Eテストのラベル修正**
  - `page.getByRole('button', { name: 'SVG ダウンロード' })` → `page.getByRole('button', { name: 'SVGダウンロード' })`
- [ ] **Step 2: 全テスト実行**
      Run: `npm run test && npm run test:e2e`
- [ ] **Step 3: CLAUDE.md の更新**
      共通UIコンポーネント表に `DownloadButton` を追加。
- [ ] **Step 4: コミット**
      Commit: `test: fix E2E tests and update documentation`
