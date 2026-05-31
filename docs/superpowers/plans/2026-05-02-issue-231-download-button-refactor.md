# DownloadButton を ActionButton ベースの薄ラッパーに再構成 (issue #231)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/components/ui/DownloadButton.tsx` を `ActionButton` を内部で利用する薄いラッパーに置き換え、`loading`/`aria-busy` の統合恩恵を享受しつつ古い `onMouseEnter`/`onMouseLeave` パターンを除去する。

**Architecture:**

- `ActionButton` に `secondary` バリアント (transparent bg + primary border/text) を新設し、`DownloadButton` の二系統のスタイルを `ActionButton` の `variant` で表現できるようにする。
- `DownloadButton` 自体は `<ActionButton variant={…} loading={…} disabled={…} aria-label={…} onClick={…}><DownloadIcon /> {label}</ActionButton>` の薄いラッパーへ縮約。アイコン+ラベルの間隔は children 側で span (`inline-flex`/`gap`) を使い、ActionButton API を変更しない。
- 既存呼び出し側 (各 tool) は `DownloadButton` の API をそのまま使用するため変更不要。dead な `className` prop は除去 (現在どの呼び出し側も渡していない)。`loading` prop を新規追加 (任意)。

**Tech Stack:** React 19 + TSX、Vitest + @testing-library/react (jsdom)、Playwright (E2E)、Astro 6、Tailwind utility + inline style mix。検証は `npm run test` / `astro check` / `npm run test:e2e`。

**Branch / PR ポリシー (CLAUDE.md / memory 由来):**

- 作業ブランチ: `feature/issue-231-download-button-actionbutton-wrap` (develop から派生)
- コミットメッセージ・PR タイトル / 本文: 日本語必須
- `gh pr create` は **`--base develop`** を必ず明示
- 親 Claude (Opus) が PR / push を担い、サブエージェント (Sonnet) はコード編集・テスト・スクショに専念
- E2E は PR 作成前に必ず実行 (CI に頼らない)

---

## File Structure

| パス                                                  | 操作     | 責務                                                                                                     |
| ----------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `src/components/ui/ActionButton.tsx`                  | Modify   | `Variant` 型に `'secondary'` を追加し bg/color/border map を拡張                                         |
| `src/components/ui/__tests__/ActionButton.test.tsx`   | Modify   | `secondary` バリアントのレンダリング・スタイル検証ケースを追加                                           |
| `src/components/ui/DownloadButton.tsx`                | Rewrite  | `ActionButton` ラッパーへ縮約 (DownloadIcon ヘルパーは保持)                                              |
| `src/components/ui/__tests__/DownloadButton.test.tsx` | Create   | DownloadButton ラッパーの unit test (label / onClick / disabled / loading / variant / aria-label / icon) |
| `tests/e2e/download-button.spec.ts`                   | 確認のみ | 既存 E2E がそのまま緑になることを保証 (修正不要のはず)                                                   |

---

## Task 0: ブランチ作成 (親 Claude が実施)

**Files:** N/A (git 操作のみ)

- [ ] **Step 1: develop の最新を取得**

```bash
git fetch origin develop
git checkout develop
git pull --ff-only origin develop
```

- [ ] **Step 2: 作業ブランチを作成**

```bash
git checkout -b feature/issue-231-download-button-actionbutton-wrap
```

期待値: `git branch --show-current` が `feature/issue-231-download-button-actionbutton-wrap` を返す。

---

## Task 1: ActionButton に `secondary` バリアントを追加 (TDD)

**Files:**

- Modify: `src/components/ui/ActionButton.tsx`
- Modify: `src/components/ui/__tests__/ActionButton.test.tsx`

### Step 1: 失敗するテストを追加

- [ ] **Step 1: `ActionButton.test.tsx` に `secondary` バリアントの検証を追加**

`src/components/ui/__tests__/ActionButton.test.tsx` の `describe('ActionButton', () => { ... })` 内、`variant="danger" を指定できる` テストの直後 (line 81 付近) に以下を追加:

```tsx
it('variant="secondary" を指定できる', () => {
  render(
    <ActionButton onClick={() => {}} variant="secondary">
      セカンダリ
    </ActionButton>
  );
  expect(screen.getByRole('button', { name: 'セカンダリ' })).toBeTruthy();
});

it('variant="secondary" は背景透過・primary 色のボーダーと文字色を持つ', () => {
  render(
    <ActionButton onClick={() => {}} variant="secondary">
      セカンダリ
    </ActionButton>
  );
  const btn = screen.getByRole('button') as HTMLButtonElement;
  // var() 文字列はそのまま inline style に展開される (jsdom は CSS 変数を解決しない)
  expect(btn.style.background).toContain('transparent');
  expect(btn.style.color).toContain('var(--color-primary)');
  expect(btn.style.border).toContain('var(--color-primary)');
});
```

### Step 2: テストを実行して失敗を確認

- [ ] **Step 2: vitest で fail することを確認**

```bash
npm run test -- src/components/ui/__tests__/ActionButton.test.tsx
```

期待値: 2 件 fail (TS2322: variant に "secondary" を指定できない / 既存実装が default にフォールバックして transparent/primary/primary を返さない)。astro check でも `Type '"secondary"' is not assignable to type 'Variant'` が出るはず。

### Step 3: ActionButton 実装を更新

- [ ] **Step 3: `Variant` 型と Map に `secondary` を追加**

`src/components/ui/ActionButton.tsx` を以下の差分で変更:

`type Variant = 'default' | 'primary' | 'danger';` を:

```ts
type Variant = 'default' | 'primary' | 'secondary' | 'danger';
```

`bgMap` / `colorMap` / `borderMap` の宣言を:

```ts
const bgMap: Record<Variant, string> = {
  default: colors.bgSubtle,
  primary: colors.primary,
  secondary: 'transparent',
  danger: 'transparent',
};
const colorMap: Record<Variant, string> = {
  default: colors.text,
  primary: colors.textOnPrimary,
  secondary: colors.primary,
  danger: colors.error,
};
const borderMap: Record<Variant, string> = {
  default: colors.borderInput,
  primary: colors.primary,
  secondary: colors.primary,
  danger: colors.error,
};
```

JSDoc の `variant` 列挙も `'default' | 'primary' | 'secondary' | 'danger'` に更新:

```ts
/**
 * 汎用アクションボタン。
 * - `variant`: 'default' | 'primary' | 'secondary' | 'danger'
 * - `loading`: true のとき `aria-busy="true"` を付与し、disabled 状態にする
 * - ローディング中の子要素はそのまま表示するため、呼び出し元でローディング文言に切り替えること
 *   （例: `{loading ? '生成中…' : '生成'}`）
 * - `aria-*` など ButtonHTMLAttributes のほとんどの属性を渡せる
 */
```

### Step 4: テストを実行して通ることを確認

- [ ] **Step 4: vitest 緑を確認**

```bash
npm run test -- src/components/ui/__tests__/ActionButton.test.tsx
```

期待値: ActionButton.test.tsx の全ケース pass (既存 9 件 + 新規 2 件 = 11 件)。

### Step 5: 型チェック

- [ ] **Step 5: astro check で 0 errors / 0 warnings**

```bash
npx astro check
```

期待値: `0 errors, 0 warnings`。

### Step 6: コミット

- [ ] **Step 6: ActionButton 拡張をコミット**

```bash
git add src/components/ui/ActionButton.tsx src/components/ui/__tests__/ActionButton.test.tsx
git commit -m "feat(ui): ActionButton に secondary variant を追加 (#231)

DownloadButton 再構成の前段として、透過背景 + primary ボーダー/文字色の
secondary variant を ActionButton に追加。
既存 default / primary / danger の挙動には影響しない。"
```

---

## Task 2: DownloadButton ラッパー化 (TDD)

**Files:**

- Modify: `src/components/ui/DownloadButton.tsx`
- Create: `src/components/ui/__tests__/DownloadButton.test.tsx`

### Step 1: DownloadButton 用のテストファイルを新規作成

- [ ] **Step 1: `src/components/ui/__tests__/DownloadButton.test.tsx` を新規作成**

ファイル全文:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { DownloadButton } from '@/components/ui/DownloadButton';

afterEach(() => {
  cleanup();
});

describe('DownloadButton', () => {
  it('label を描画する', () => {
    render(<DownloadButton onClick={() => {}} label="SVGダウンロード" />);
    expect(screen.getByRole('button', { name: 'SVGダウンロード' })).toBeTruthy();
  });

  it('onClick が呼ばれる', () => {
    const handler = vi.fn();
    render(<DownloadButton onClick={handler} label="DL" />);
    fireEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('disabled=true で disabled 属性が付き onClick が呼ばれない', () => {
    const handler = vi.fn();
    render(<DownloadButton onClick={handler} label="DL" disabled />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(handler).not.toHaveBeenCalled();
  });

  it('loading=true で aria-busy="true" が付与され disabled 状態になる', () => {
    render(<DownloadButton onClick={() => {}} label="DL" loading />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBe(true);
  });

  it('loading=false (default) で aria-busy が付与されない', () => {
    render(<DownloadButton onClick={() => {}} label="DL" />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBeNull();
  });

  it('aria-label を上書きできる', () => {
    render(<DownloadButton onClick={() => {}} label="DL" aria-label="ファイルをダウンロード" />);
    expect(screen.getByRole('button', { name: 'ファイルをダウンロード' })).toBeTruthy();
  });

  it('aria-label 未指定時は label が aria 名になる', () => {
    render(<DownloadButton onClick={() => {}} label="SVGダウンロード" />);
    expect(screen.getByRole('button', { name: 'SVGダウンロード' })).toBeTruthy();
  });

  it('variant="primary" (default) は primary 色背景・白文字', () => {
    render(<DownloadButton onClick={() => {}} label="DL" />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.style.background).toContain('var(--color-primary)');
    expect(btn.style.color).toContain('var(--color-text-on-primary)');
  });

  it('variant="secondary" は透過背景・primary 文字色', () => {
    render(<DownloadButton onClick={() => {}} label="DL" variant="secondary" />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.style.background).toContain('transparent');
    expect(btn.style.color).toContain('var(--color-primary)');
  });

  it('ダウンロードアイコン (svg, aria-hidden) が描画される', () => {
    const { container } = render(<DownloadButton onClick={() => {}} label="DL" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
```

### Step 2: テストを実行して失敗を確認

- [ ] **Step 2: vitest で新規ファイルが fail することを確認**

```bash
npm run test -- src/components/ui/__tests__/DownloadButton.test.tsx
```

期待値: 一部 pass / 一部 fail。具体的には:

- `loading` 関連 2 ケースは fail (現実装は `loading` prop 未対応)
- `variant="primary" は primary 色背景・白文字` は **fail** (現実装は `border: 'none'` で `border: 1px solid colors.primary` になっていない / inline style の構造差で `style.background` が `var(--color-primary)` を含まない可能性)
- 残りは現実装でも pass する可能性あり

確認後、Step 3 で実装を全面置き換えれば全ケース pass する。

### Step 3: DownloadButton をラッパー実装に置き換える

- [ ] **Step 3: `src/components/ui/DownloadButton.tsx` を以下の内容で全面置換**

```tsx
import { ActionButton } from './ActionButton';

interface Props {
  onClick: () => void;
  label: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
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

/**
 * ダウンロードアイコン付きのアクションボタン。
 * `ActionButton` を内部で使用する薄いラッパー。
 * - `variant="primary"`: primary 色背景 + 白文字 (デフォルト)
 * - `variant="secondary"`: 透過背景 + primary 文字色 + primary ボーダー
 * - `loading=true`: ActionButton 経由で `aria-busy="true"` と disabled 状態を付与
 */
export function DownloadButton({
  onClick,
  label,
  variant = 'primary',
  disabled = false,
  loading = false,
  'aria-label': ariaLabel,
}: Props) {
  return (
    <ActionButton
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      aria-label={ariaLabel ?? label}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
        <DownloadIcon />
        {label}
      </span>
    </ActionButton>
  );
}
```

注:

- `className` prop は呼び出し側で誰も使用していないため除去 (issue 記載の「API 互換 (props 不変)」は呼び出し側の互換性を指し、未使用 prop の除去は call-site を壊さない)。
- `onMouseEnter` / `onMouseLeave` を削除し ActionButton の静的スタイルに統一 (これが本 issue の主目的)。
- `hover:opacity-90` も削除 (`.agents/rules/ui-conventions.md` 2.1 章の `hover:` 禁止方針と整合)。

### Step 4: テストを実行して通ることを確認

- [ ] **Step 4: DownloadButton.test.tsx 全ケース pass を確認**

```bash
npm run test -- src/components/ui/__tests__/DownloadButton.test.tsx
```

期待値: 10 件すべて pass。

### Step 5: 既存ユニットテスト全体を実行

- [ ] **Step 5: `npm run test` 全件緑**

```bash
npm run test
```

期待値: 既存 + 新規含めすべて pass (フェイル 0 件)。

### Step 6: 型チェック

- [ ] **Step 6: astro check で 0 errors / 0 warnings**

```bash
npx astro check
```

期待値: `0 errors, 0 warnings`。warning が出る場合: 多くは未使用 import (旧実装で使っていた `colors`, `caption`)。新しい DownloadButton.tsx に残っていれば削除する (Step 3 のコード例どおりなら発生しない想定)。

### Step 7: コミット

- [ ] **Step 7: DownloadButton ラッパー化をコミット**

```bash
git add src/components/ui/DownloadButton.tsx src/components/ui/__tests__/DownloadButton.test.tsx
git commit -m "refactor(ui): DownloadButton を ActionButton の薄ラッパーに再構成 (#231)

- 独自の onMouseEnter/onMouseLeave による background 直接操作を削除
- hover:opacity-90 className も削除 (ui-conventions 2.1 章と整合)
- loading prop を新規追加 (ActionButton 経由で aria-busy / disabled 統合)
- 未使用だった className prop を除去
- 既存呼び出し側 (QrCode/JanCode/Gs1Databar/JsonCsv/EncodingConverter/
  ConfigConverter/qr-ticket GenerateTab/DownloadButtonGroup) は API 互換"
```

---

## Task 3: E2E 検証 (push 前必須)

**Files:** N/A (テスト実行のみ)

### Step 1: 既存 E2E (download-button.spec.ts) が緑になることを確認

- [ ] **Step 1: download-button.spec.ts のみを実行**

```bash
npm run test:e2e -- tests/e2e/download-button.spec.ts
```

期待値: 2 件 pass / 1 件 skip (現在 skip 状態の disabled テストはそのまま)。

検証ポイント:

- `SVGダウンロードボタン (secondary)` の `background-color: rgba(0, 0, 0, 0)` / `border: 1px solid rgb(26, 86, 219)` / `color: rgb(26, 86, 219)` がそのまま通る (新 secondary variant が同等のスタイルを返すため)。
- `PNGダウンロードボタン (primary)` の `background-color: rgb(26, 86, 219)` / `color: rgb(255, 255, 255)` がそのまま通る (ActionButton primary と同値)。

注: e2e テストは border の有無を primary では検証していないため、ActionButton primary が `border: 1px solid colors.primary` を持つ点は問題にならない (border 色 = bg 色で視覚的に同一)。

### Step 2: 全 E2E スイートを実行

- [ ] **Step 2: download 系を含む全 tool の E2E を実行**

```bash
npm run test:e2e
```

期待値: 全件 pass (フェイル 0 件)。タイムアウトしやすい場合は再実行で確認。

代表的に守るべき:

- `tests/e2e/qr-code.spec.ts` (QrCode tool の SVG ダウンロード)
- `tests/e2e/jan-code.spec.ts` (JANコード SVG/PNG)
- `tests/e2e/gs1-databar.spec.ts` (GS1 DataBar の単一 + ZIP ダウンロード)
- `tests/e2e/json-csv.spec.ts` (CSV ダウンロード)
- `tests/e2e/encoding-converter.spec.ts` (エンコード後ダウンロード)
- `tests/e2e/config-converter.spec.ts` (設定変換ダウンロード)
- `tests/e2e/qr-ticket-*.spec.ts` (QR チケット生成系のダウンロード)

失敗が出たら根本原因を調査 (`feedback_subagent_testing` 系の memory に従い skip 禁止)。

---

## Task 4: 視覚回帰チェック (Playwright で目視確認)

**Files:** N/A (スクリーンショットのみ、コミットしない一時確認)

`memory/feedback_playwright_cache.md` のキャッシュクリア手順に従い、PC + スマホ両サイズで描画を確認する。

### Step 1: dev サーバ起動

- [ ] **Step 1: dev サーバをバックグラウンド起動**

```bash
npm run dev
```

(別ペインで起動するか run_in_background で実行。ポート 4321。)

### Step 2: JANコードページで PNG (primary) と SVG (secondary) を確認

- [ ] **Step 2: Playwright MCP で `/tools/jan-code` を開きスクショ撮影**

手順 (browser MCP 利用想定):

1. `caches.delete + localStorage.clear + sessionStorage.clear` を `browser_evaluate` で実行
2. `browser_navigate` で `http://localhost:4321/tools/jan-code` (キャッシュなし)
3. `browser_resize 1280x800` → `browser_take_screenshot` (PC)
4. `browser_resize 390x844` → `browser_take_screenshot` (スマホ)

期待値:

- 「SVGダウンロード」ボタン: 透過背景 + 青枠 + 青文字
- 「PNGダウンロード」ボタン: 青背景 + 白文字
- アイコンとラベルの間隔が現状と同等 (約 6px)
- ホバー時の色変化が消えていることは許容 (本 refactor の意図)

### Step 3: 比較対象として現行版とのビジュアル差分を目視

- [ ] **Step 3: 現行 develop の同ページとスクショ比較**

ブランチを develop に戻して同じページのスクショを撮影し、自分のブランチのスクショと並べて確認。primary variant の静的見た目が同等であること (`視覚的回帰なし` の要件)。

```bash
git stash || true
git checkout develop
# 上と同じスクショ手順を再実行
git checkout feature/issue-231-download-button-actionbutton-wrap
git stash pop || true
```

(※ stash は変更が無ければ no-op。サブエージェントが pristine な状態で動作するなら stash は不要。)

### Step 4: dev サーバ停止

- [ ] **Step 4: dev サーバを停止**

```bash
lsof -ti:4321 | xargs kill -9 2>/dev/null || true
```

---

## Task 5: PR 作成 (親 Claude が実施)

**Files:** N/A (git/gh 操作のみ)

### Step 1: push 前最終チェック (親 Claude が memory commander_checklist に従い実施)

- [ ] **Step 1: ベース・テスト・aria 削除検出**

```bash
git log origin/develop..HEAD --oneline   # base が develop で派生していること
git diff origin/develop...HEAD -- '*.tsx' '*.ts' | grep -E '^-.*aria-' || echo "OK: aria 属性削除なし"
```

期待値: 上記コミット 2 本 (Task 1 と Task 2) が表示される。`aria-` の削除行は出ないこと。

### Step 2: push

- [ ] **Step 2: feature ブランチを push**

```bash
git push -u origin feature/issue-231-download-button-actionbutton-wrap
```

### Step 3: PR 作成 (`--base develop` 必須)

- [ ] **Step 3: gh で PR を作成**

```bash
gh pr create --base develop --title "refactor(ui): DownloadButton を ActionButton の特殊化として再構成 (#231)" --body "$(cat <<'EOF'
## 概要

issue #231 / PR #229 (#162) のフォローアップ。`DownloadButton` を独自実装から `ActionButton` ベースの薄ラッパーへ再構成する。

## 変更内容

### `ActionButton`
- `Variant` に `'secondary'` を追加 (透過背景 + primary 色のボーダー/文字色)。
- 既存 `default` / `primary` / `danger` の挙動には影響しない。

### `DownloadButton`
- `<ActionButton variant={…} loading={…} disabled={…} aria-label={…}>` を内部で利用する薄いラッパーに縮約。
- 古い `onMouseEnter` / `onMouseLeave` による background 直接操作を削除。
- `hover:opacity-90` className も削除 (`.agents/rules/ui-conventions.md` 2.1 章の `hover:` 禁止方針と整合)。
- `loading` prop を新規追加 (ActionButton 経由で `aria-busy="true"` と disabled 状態を統合享受)。
- 未使用だった `className` prop は除去 (call-site で誰も使用していなかった)。

### 呼び出し側
- `QrCode` / `JanCode` / `Gs1Databar` / `JsonCsv` / `EncodingConverter` / `ConfigConverter` / `qr-ticket/GenerateTab` / `DownloadButtonGroup` は **API 互換** (現行 props のみ使用しているため変更不要)。

## 検証

- [x] `npm run test` 緑 (ActionButton +2 ケース / DownloadButton 新規 10 ケース)
- [x] `astro check` 0 errors / 0 warnings
- [x] `npm run test:e2e` 全件緑 (`download-button.spec.ts` の primary / secondary スタイル検証含む)
- [x] Playwright で PC (1280x800) / スマホ (390x844) のビジュアル確認 — primary / secondary とも現状と同等

## 関連

- issue #231
- PR #229 (#162) review コメント (2026-05-02) の確認事項 2
- `src/components/ui/ActionButton.tsx`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

期待値: PR URL が返る。base が `develop` であること (`gh` のデフォルトに流されない)。

### Step 4: PR レビュー待ち

- [ ] **Step 4: レビューを待ち、不要な自走 push をしない**

`memory/feedback_hold_push_during_review.md` に従い、レビュー中の自発的な追加コミットは push せずローカルで待機。レビュー完了後にまとめて対応。

---

## Self-Review チェックリスト

- [x] **Spec coverage:** issue 記載の 5 項目すべてに対応するタスクを定義 — ActionButton 内部呼び出し (Task 2 Step 3)、アイコン inline 配置 (children 内 `inline-flex` span)、`loading`/`aria-busy` 享受 (Task 2 Step 3 で `loading` 追加 + Task 1 で variant 拡張)、API 互換 (`Props` から `className` 除去のみ。残り全 prop 維持)、検証 3 種 (Task 3) + 視覚回帰 (Task 4) を網羅。
- [x] **Placeholder scan:** 「TBD」「TODO」「実装の詳細は後で」「適切なエラーハンドリング」等の曖昧な指示なし。すべての code step に完全なコードブロックを含む。
- [x] **Type consistency:** `Variant` 型は `'default' | 'primary' | 'secondary' | 'danger'` で全タスク統一。`Props.loading` は `boolean` 既定 `false`。`'aria-label'` は `string | undefined`。Map のキーは Variant と完全一致。
- [x] **既知制約:**
  - `className` prop の除去は型上は破壊的変更だが、call-site grep で使用 0 件を確認済み (Task 0 前の調査)。
  - hover 時の opacity / bg 変化は意図的に削除 (issue 主目的)。`.agents/rules/ui-conventions.md` 2.1 章は別途見直しが望ましいが、本 PR スコープ外。

---

## 実行モード提案

**Plan complete and saved to `docs/superpowers/plans/2026-05-02-issue-231-download-button-refactor.md`. 二択:**

1. **Subagent-Driven (推奨)** — 親 Opus が Task 0 と Task 5 を担当、Task 1〜4 を Sonnet サブエージェントに 1 タスクずつ委譲し、タスク間で親がレビュー
2. **Inline Execution** — このセッションで連続実行 (チェックポイントごとに親確認)

ユーザ要望は「Sonnet サブエージェントに実装させたい」のため **1 を採用** が前提。
