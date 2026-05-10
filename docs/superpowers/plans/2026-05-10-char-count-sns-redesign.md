# 文字カウント SNS 再設計 + X 文字数仕様準拠 — 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文字カウントツールの SNS セクションを横並びカード化 + 進捗バー化し、X (旧 Twitter) の文字数を twitter-text 公式仕様に準拠させる。

**Architecture:** SNS セクションを `<dl>` ベースの定義リストから `<article>` カードグリッドに置き換える。各カードは進捗バー (新規共通コンポーネント `ProgressBar`) を含み、計算方法ラベルと caption で単位の混在を解消する。X 文字数は `twitterWeight()` を URL 検知 + 補助 weight ranges + trim に対応させる。

**Tech Stack:** React 19, Astro, TypeScript, Tailwind v4, Vitest, Playwright (E2E + VRT)

**Spec:** `docs/superpowers/specs/2026-05-10-char-count-sns-redesign-design.md`
**Issue:** [#376](https://github.com/fumtas1k/devtools/issues/376)
**Branch:** `feat/issue-376-char-count-sns-redesign` (origin/develop 起点、起点確認済み)

---

## File Structure

| Path                                                | 操作   | 責務                                                                                  |
| --------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `src/utils/char-count/sns.ts`                       | Modify | `twitterWeight()` を新仕様で書き換え、URL 検知 helper を export                       |
| `src/utils/char-count/__tests__/char-count.test.ts` | Modify | 新仕様の unit test を追加                                                             |
| `src/components/ui/ProgressBar.tsx`                 | Create | 進捗バー共通コンポーネント (`current`/`max`/aria 属性/オーバーフロー帯)               |
| `src/components/ui/__tests__/ProgressBar.test.tsx`  | Create | ProgressBar の unit test                                                              |
| `src/styles/global.css`                             | Modify | `@layer components` に `.progress-track` `.progress-fill` `.progress-overflow` を追加 |
| `src/components/tools/CharCount.tsx`                | Modify | SNS セクションを `<dl>` → カードグリッドへ置換、ProgressBar 利用                      |
| `src/components/tools/__tests__/CharCount.test.tsx` | Modify | カード構造 / progressbar role / aria-valuenow clamp の新規テスト                      |
| `tests/e2e/char-count-sns.spec.ts`                  | Create | SNS カード layout の E2E (PC + mobile + 上限超過)                                     |
| `docs/decisions.md`                                 | Modify | X 文字数の twitter-text 準拠採用の意思決定を記録                                      |

---

## Task 1: twitterWeight を twitter-text 仕様に準拠させる

**Files:**

- Modify: `src/utils/char-count/sns.ts`
- Modify: `src/utils/char-count/__tests__/char-count.test.ts`

### - [ ] Step 1: 新規テストケースを追加

`src/utils/char-count/__tests__/char-count.test.ts` の `describe('twitterWeight', ...)` ブロック (現状 line 411-419) を以下に置換する。

```typescript
describe('twitterWeight', () => {
  // 既存の基本ケース (挙動不変)
  it('空文字は 0', () => expect(twitterWeight('')).toBe(0));
  it('ASCII 1 文字は weight 1', () => expect(twitterWeight('a')).toBe(1));
  it('ASCII 10 文字は weight 10', () => expect(twitterWeight('abcdefghij')).toBe(10));
  it('日本語 1 文字は weight 2', () => expect(twitterWeight('あ')).toBe(2));
  it('日本語 5 文字は weight 10', () => expect(twitterWeight('あいうえお')).toBe(10));
  it('絵文字 "😀" は weight 2 (U+1F600 > U+10FF)', () => expect(twitterWeight('😀')).toBe(2));
  it('ASCII と日本語の混在: "abc あ" → 3+1+2=6', () => expect(twitterWeight('abc あ')).toBe(6));

  // 新仕様: URL 検知
  it('URL 単体は 23 weighted (短縮 t.co 換算)', () =>
    expect(twitterWeight('https://example.com')).toBe(23));
  it('長い URL も 23 weighted', () =>
    expect(twitterWeight('https://very-long-domain-name.example.com/path/to/resource?q=1')).toBe(
      23
    ));
  it('URL + テキスト: "Check https://example.com out" → 6 + 23 + 4 = 33', () =>
    expect(twitterWeight('Check https://example.com out')).toBe(33));
  it('URL 末尾の句読点 "." は URL に含めない: "see https://example.com." → 4 + 23 + 1 = 28', () =>
    expect(twitterWeight('see https://example.com.')).toBe(28));
  it('http:// も対象: "http://a.com" → 23', () => expect(twitterWeight('http://a.com')).toBe(23));
  it('URL 内の日本語ドメインは現状の簡易 regex で扱う (typical https? のみ正確)', () =>
    expect(twitterWeight('https://example.com/日本')).toBe(23));

  // 新仕様: trim
  it('前後空白は trim される: "  hello  " → 5', () => expect(twitterWeight('  hello  ')).toBe(5));
  it('前後空白のみは 0', () => expect(twitterWeight('   ')).toBe(0));
  it('全角空白も trim される: "　hello　" → 5', () => expect(twitterWeight('　hello　')).toBe(5));

  // 新仕様: weight-1 ranges (一般句読点)
  it('em-dash "—" (U+2014) は weight 1', () => expect(twitterWeight('—')).toBe(1));
  it('prime "′" (U+2032) は weight 1', () => expect(twitterWeight('′')).toBe(1));
  it('zero-width joiner (U+200D) は weight 1', () => expect(twitterWeight('‍')).toBe(1));
  it('horizontal ellipsis "…" (U+2026) は weight 2 (U+2010-201F 範囲外)', () =>
    expect(twitterWeight('…')).toBe(2));
  it('範囲外の punctuation "★" (U+2605) は weight 2', () => expect(twitterWeight('★')).toBe(2));

  // 内部空白は trim 対象外
  it('内部空白は保持: "a  b" → 4', () => expect(twitterWeight('a  b')).toBe(4));

  // 改行
  it('改行 LF "a\\nb" → 3 (LF は U+0A、weight 1)', () => expect(twitterWeight('a\nb')).toBe(3));
});
```

### - [ ] Step 2: テストを実行して fail を確認

```bash
npx vitest run src/utils/char-count/__tests__/char-count.test.ts -t twitterWeight 2>&1 | tail -30
```

Expected: 新規追加テストの大半が fail する (URL を 23 chars にしない、trim しない、U+2014 を weight 2 と数える、など)。既存ケースは pass するはず。`Test Files N failed` `Tests M failed` の集計行を確認。

### - [ ] Step 3: twitterWeight を新仕様で実装

`src/utils/char-count/sns.ts` を以下に書き換える。

```typescript
import { countGraphemes } from './chars';

/**
 * URL を検出する簡易正規表現。
 * - http(s):// から始まり、空白・< > " で停止
 * - 末尾の典型的な句読点 (. , ! ? ; : ' " ) ] }) は URL から除外する
 *
 * twitter-text 公式の URL 抽出と完全互換ではない。IDN・cashtag・mention 等は別途対応。
 */
const URL_PATTERN = /https?:\/\/[^\s<>"]+/gi;
const TRAILING_PUNCT = /[.,!?;:'")\]}]+$/;

export function extractUrlRanges(s: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const m of s.matchAll(URL_PATTERN)) {
    let url = m[0];
    const trail = url.match(TRAILING_PUNCT);
    if (trail) url = url.slice(0, -trail[0].length);
    if (url.length === 0) continue;
    const start = m.index!;
    ranges.push({ start, end: start + url.length });
  }
  return ranges;
}

/**
 * twitter-text 仕様の weight-1 範囲。これ以外は weight 2。
 * - U+0000–U+10FF
 * - U+2000–U+200D (general punctuation 前半)
 * - U+2010–U+201F (dashes / quotation 系)
 * - U+2032–U+2037 (prime 系)
 */
function isWeightOne(cp: number): boolean {
  return (
    cp <= 0x10ff ||
    (cp >= 0x2000 && cp <= 0x200d) ||
    (cp >= 0x2010 && cp <= 0x201f) ||
    (cp >= 0x2032 && cp <= 0x2037)
  );
}

const URL_WEIGHT = 23;

/**
 * X (Twitter) 公式仕様準拠の weighted character length。
 * 1. 前後空白を trim
 * 2. URL を 23 weighted chars 換算
 * 3. 残り文字を weight-1 / weight-2 範囲で集計
 *
 * twitter-text 公式 conformance との誤差は URL regex の簡易性のみ (~5% 以下の URL pattern)。
 */
export function twitterWeight(s: string): number {
  const trimmed = s.trim();
  if (trimmed.length === 0) return 0;

  const ranges = extractUrlRanges(trimmed);

  let weight = 0;
  let cursor = 0;
  for (const { start, end } of ranges) {
    // URL 前のテキストを通常 weight で集計
    if (start > cursor) {
      const segment = trimmed.slice(cursor, start);
      for (const ch of segment) {
        const cp = ch.codePointAt(0)!;
        weight += isWeightOne(cp) ? 1 : 2;
      }
    }
    weight += URL_WEIGHT;
    cursor = end;
  }
  // 末尾の残りテキスト
  if (cursor < trimmed.length) {
    const segment = trimmed.slice(cursor);
    for (const ch of segment) {
      const cp = ch.codePointAt(0)!;
      weight += isWeightOne(cp) ? 1 : 2;
    }
  }
  return weight;
}

/** Bluesky の文字数 (書記素クラスタ数) */
export function blueskyCount(s: string): number {
  return countGraphemes(s);
}
```

### - [ ] Step 4: テストを実行して pass を確認

```bash
npx vitest run src/utils/char-count/__tests__/char-count.test.ts -t twitterWeight 2>&1 | tail -10
```

Expected: 全テスト pass (`Tests N passed`)。集計行を必ず確認する。

### - [ ] Step 5: 全 unit test を回して回帰を確認

```bash
npm run test 2>&1 | tail -10
```

Expected: 既存テストへの影響なし、`Test Files X passed` `Tests Y passed`。失敗があれば twitterWeight の変更が他箇所に波及していないか確認。

### - [ ] Step 6: 型チェック

```bash
node_modules/.bin/astro check 2>&1 | tail -10
```

Expected: `0 errors, 0 warnings, 0 hints`.

### - [ ] Step 7: Commit

```bash
git add src/utils/char-count/sns.ts src/utils/char-count/__tests__/char-count.test.ts
git commit -m "$(cat <<'EOF'
feat(char-count): X 文字数を twitter-text 仕様に準拠 (#376)

URL 検知 (23 weighted chars 換算) / weight-1 ranges (general
punctuation) / 前後空白 trim を実装。conformance 仕様準拠で
「概算」ラベルを外せる精度に。
EOF
)"
```

---

## Task 2: ProgressBar 共通コンポーネントを作成する

**Files:**

- Create: `src/components/ui/ProgressBar.tsx`
- Create: `src/components/ui/__tests__/ProgressBar.test.tsx`
- Modify: `src/styles/global.css`

### - [ ] Step 1: progress 用 CSS を追加

`src/styles/global.css` の `@layer components` ブロック内に、既存セマンティック class の並びに沿って以下を追加する (例えば `.bg-error-tint` の直後あたり)。

```css
/* === ProgressBar (CharCount SNS / 任意上限) === */
.progress-track {
  background: var(--color-bg-subtle);
  border-radius: 9999px;
  height: 0.5rem; /* 8px */
  overflow: hidden;
  display: flex;
}
.progress-fill {
  background: var(--color-primary);
  height: 100%;
  transition: width 0.2s ease-out;
}
.progress-overflow {
  background: var(--color-error);
  height: 100%;
  transition: width 0.2s ease-out;
}
```

注意: Tailwind v4 `@layer components` 内手書き class は `hover:` `focus:` variant を生成しない (`memory[Tailwind v4 layer-components no variant]`)。本コンポーネントは hover/focus 状態を持たないため問題なし。

### - [ ] Step 2: ProgressBar の失敗テストを書く

`src/components/ui/__tests__/ProgressBar.test.tsx` を新規作成。

```typescript
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { ProgressBar } from '@/components/ui/ProgressBar';

afterEach(() => cleanup());

describe('ProgressBar', () => {
  it('role="progressbar" を持つ', () => {
    render(<ProgressBar current={50} max={100} />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('100% 未満時: aria-valuenow=current, valuemin=0, valuemax=max', () => {
    render(<ProgressBar current={50} max={100} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('100% 超時: aria-valuenow は max で clamp される', () => {
    render(<ProgressBar current={150} max={100} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
  });

  it('100% 超時: aria-valuetext で実数値と「上限超過」を通知', () => {
    render(<ProgressBar current={150} max={100} />);
    const bar = screen.getByRole('progressbar');
    const valuetext = bar.getAttribute('aria-valuetext') ?? '';
    expect(valuetext).toContain('150');
    expect(valuetext).toMatch(/超過|over/i);
  });

  it('max=0 / current=0 では progressbar を描画しない (任意上限の空欄想定)', () => {
    render(<ProgressBar current={0} max={0} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('100% 超時: progress-overflow セグメントを描画する', () => {
    const { container } = render(<ProgressBar current={150} max={100} />);
    expect(container.querySelector('.progress-overflow')).toBeTruthy();
  });

  it('100% 未満時: progress-overflow セグメントは描画しない', () => {
    const { container } = render(<ProgressBar current={50} max={100} />);
    expect(container.querySelector('.progress-overflow')).toBeNull();
  });

  it('progress-fill の width は current/max * 100% (clamped)', () => {
    const { container } = render(<ProgressBar current={50} max={100} />);
    const fill = container.querySelector('.progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('100% 超時: progress-fill は 100%、progress-overflow は超過率 (clamp 100%)', () => {
    const { container } = render(<ProgressBar current={150} max={100} />);
    const fill = container.querySelector('.progress-fill') as HTMLElement;
    const overflow = container.querySelector('.progress-overflow') as HTMLElement;
    expect(fill.style.width).toBe('100%');
    expect(overflow.style.width).toBe('50%'); // (150-100)/100 = 50%
  });

  it('aria-describedby を伝播する', () => {
    render(<ProgressBar current={50} max={100} aria-describedby="desc-x" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-describedby')).toBe('desc-x');
  });
});
```

### - [ ] Step 3: テスト実行で fail を確認

```bash
npx vitest run src/components/ui/__tests__/ProgressBar.test.tsx 2>&1 | tail -10
```

Expected: 全テスト fail (モジュール未存在)。

### - [ ] Step 4: ProgressBar 実装

`src/components/ui/ProgressBar.tsx` を新規作成。

```tsx
type ProgressBarProps = {
  current: number;
  max: number;
  /** 上限超過時の補助テキスト (例: "X 仕様準拠") を a11y で関連付けるための id */
  'aria-describedby'?: string;
};

/**
 * 進捗バー (current / max)。
 * - max=0 なら描画しない (任意上限の空欄想定)
 * - current が max 以下: 単一の filled セグメント
 * - current が max 超: filled (max ぶん) + overflow (超過分、最大 100% で clamp)
 *
 * a11y:
 * - role="progressbar"
 * - aria-valuemin / valuemax / valuenow (valuenow は max で clamp)
 * - aria-valuetext で 100% 超時に「上限超過」を通知
 */
export function ProgressBar({ current, max, 'aria-describedby': describedBy }: ProgressBarProps) {
  if (max <= 0) return null;

  const isOver = current > max;
  const fillRatio = Math.min(current / max, 1);
  const overflowRatio = isOver ? Math.min((current - max) / max, 1) : 0;

  const valuenow = Math.min(current, max);
  const valuetext = isOver
    ? `${current} / ${max} (上限超過 +${current - max})`
    : `${current} / ${max}`;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={valuenow}
      aria-valuetext={valuetext}
      aria-describedby={describedBy}
      className="progress-track"
    >
      <span className="progress-fill" style={{ width: `${fillRatio * 100}%` }} aria-hidden="true" />
      {isOver && (
        <span
          className="progress-overflow"
          style={{ width: `${overflowRatio * 100}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
```

### - [ ] Step 5: テスト実行で pass を確認

```bash
npx vitest run src/components/ui/__tests__/ProgressBar.test.tsx 2>&1 | tail -10
```

Expected: 全テスト pass。

### - [ ] Step 6: 型チェック

```bash
node_modules/.bin/astro check 2>&1 | tail -10
```

Expected: 0 errors。

### - [ ] Step 7: Commit

```bash
git add src/components/ui/ProgressBar.tsx src/components/ui/__tests__/ProgressBar.test.tsx src/styles/global.css
git commit -m "$(cat <<'EOF'
feat(ui): ProgressBar 共通コンポーネントを追加 (#376)

current/max のオーバーフロー帯付き進捗バー。aria-valuenow を max で
clamp し、aria-valuetext で上限超過を SR に通知する。CharCount SNS
セクションで利用予定。
EOF
)"
```

---

## Task 3: SNS セクションをカードグリッドに置換する

**Files:**

- Modify: `src/components/tools/CharCount.tsx`
- Modify: `src/components/tools/__tests__/CharCount.test.tsx`

### - [ ] Step 1: 既存テストに新規ケースを追加 (TDD: 先に fail させる)

`src/components/tools/__tests__/CharCount.test.tsx` の末尾 (line 142 の `});` の直後) に以下のブロックを追加する。

```typescript
describe('CharCountTool — SNS カード', () => {
  it('SNS カード 3 枚 (X / Bluesky / 任意上限) が描画される', () => {
    render(<CharCountTool />);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(screen.getByText('X (旧 Twitter)')).toBeTruthy();
    expect(screen.getByText('Bluesky')).toBeTruthy();
    expect(screen.getByText('任意上限')).toBeTruthy();
  });

  it('各カードに progressbar role が描画される', () => {
    render(<CharCountTool />);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    const bars = screen.getAllByRole('progressbar');
    // X (280) + Bluesky (300) + 任意上限 (デフォルト 280) = 3
    expect(bars.length).toBe(3);
  });

  it('X カードの aria-valuemax は 280', () => {
    render(<CharCountTool />);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    const bars = screen.getAllByRole('progressbar');
    // 描画順は X / Bluesky / 任意上限 を前提
    expect(bars[0].getAttribute('aria-valuemax')).toBe('280');
    expect(bars[1].getAttribute('aria-valuemax')).toBe('300');
    expect(bars[2].getAttribute('aria-valuemax')).toBe('280');
  });

  it('上限超過時: aria-valuenow が max で clamp される', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    // ASCII 281 字 (Twitter weight 281、Bluesky 281、任意上限 281)
    act(() => {
      fireEvent.change(textarea, { target: { value: 'a'.repeat(281) } });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    const bars = screen.getAllByRole('progressbar');
    expect(bars[0].getAttribute('aria-valuenow')).toBe('280'); // X clamped
    expect(bars[2].getAttribute('aria-valuenow')).toBe('280'); // 任意上限 clamped
  });

  it('カード caption に計算方法説明が表示される', () => {
    render(<CharCountTool />);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(screen.getByText(/URL を 23 字換算/)).toBeTruthy();
    expect(screen.getByText(/絵文字や合字も 1 文字/)).toBeTruthy();
    expect(screen.getByText(/書記素クラスタ単位/)).toBeTruthy();
  });

  it('「概算」ラベルは X カードから消えている', () => {
    render(<CharCountTool />);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(screen.queryByText('概算')).toBeNull();
    expect(screen.queryByText(/（概算）/)).toBeNull();
  });
});
```

### - [ ] Step 2: テスト実行で新規ケースが fail することを確認

```bash
npx vitest run src/components/tools/__tests__/CharCount.test.tsx 2>&1 | tail -10
```

Expected: SNS カードブロックの 6 ケースが fail (要素が見つからない)。既存テストは pass。

### - [ ] Step 3: CharCount.tsx の SNS セクションを書き換える

`src/components/tools/CharCount.tsx` の以下を変更する。

**(a) import 文に ProgressBar を追加** (line 5 の `import { BareInput } ...` の直後):

```tsx
import { ProgressBar } from '@/components/ui/ProgressBar';
```

**(b) `EncRow` の直後 (line 31 の後)に SnsCard コンポーネントを追加**:

```tsx
type SnsCardProps = {
  title: string;
  method: string;
  caption: string;
  current: number;
  limit: number;
  isOver: boolean;
  /** 「current / limit」表示を任意上限 input と組合わせる場合に渡す */
  limitNode?: React.ReactNode;
  /** caption 用 id (aria-describedby に使用) */
  captionId: string;
};

function SnsCard({
  title,
  method,
  caption,
  current,
  limit,
  isOver,
  limitNode,
  captionId,
}: SnsCardProps) {
  return (
    <article className="border-default rounded-md border p-3 flex flex-col gap-2">
      <div>
        <h3 className="caption font-bold">{title}</h3>
        <p className="caption text-muted">{method}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`font-mono${isOver ? ' text-error' : ''}`}>{current}</span>
        <span className="text-muted">/</span>
        {limitNode ?? <span className="font-mono text-muted">{limit}</span>}
        {isOver && <span className="sr-only"> 上限超過</span>}
      </div>
      <ProgressBar current={current} max={limit} aria-describedby={captionId} />
      <p id={captionId} className="caption text-muted">
        {caption}
        {isOver && <span className="text-error"> (+{current - limit} over)</span>}
      </p>
    </article>
  );
}
```

注: `React.ReactNode` を使うため `import { useState, useMemo }` 行を以下に変更する:

```tsx
import { useState, useMemo, type ReactNode } from 'react';
```

そして `SnsCardProps` の `limitNode` の型は `ReactNode` に変更:

```tsx
  limitNode?: ReactNode;
```

**(c) SNS Section 全体 (line 138-172) を以下に置換**:

```tsx
{
  /* 4. SNS */
}
<Section title="SNS" role="status" aria-live="polite">
  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
    <SnsCard
      title="X (旧 Twitter)"
      method="Twitter weight"
      caption="URL を 23 字換算、CJK は 2 weight"
      current={sns.twitterWeight}
      limit={280}
      isOver={isOver.twitter}
      captionId="sns-card-x-caption"
    />
    <SnsCard
      title="Bluesky"
      method="書記素 (grapheme)"
      caption="絵文字や合字も 1 文字として計上"
      current={sns.blueskyCount}
      limit={300}
      isOver={isOver.bluesky}
      captionId="sns-card-bluesky-caption"
    />
    <SnsCard
      title="任意上限"
      method="書記素"
      caption="書記素クラスタ単位で計上"
      current={chars.graphemes}
      limit={customLimit ?? 0}
      isOver={isOver.custom}
      captionId="sns-card-custom-caption"
      limitNode={
        <span className="inline-block w-20">
          <BareInput
            type="number"
            inputMode="numeric"
            value={snsLimit}
            onChange={handleSnsLimitChange}
            aria-label="任意上限"
            min="1"
          />
        </span>
      }
    />
  </div>
</Section>;
```

### - [ ] Step 4: テスト実行で全 pass を確認

```bash
npx vitest run src/components/tools/__tests__/CharCount.test.tsx 2>&1 | tail -10
```

Expected: 全テスト pass。`Tests N passed` 集計行を確認。

### - [ ] Step 5: 全 unit test を回す

```bash
npm run test 2>&1 | tail -10
```

Expected: 全 pass。

### - [ ] Step 6: 型チェック

```bash
node_modules/.bin/astro check 2>&1 | tail -10
```

Expected: 0 errors。

### - [ ] Step 7: Playwright で実機ビジュアル確認 (PC + モバイル)

UI 変更につき必須 (CLAUDE.md `feedback[デザイン変更は Playwright 実機確認]`)。dev server 起動 → Playwright MCP で 1280x800 と 390x844 のスクリーンショット撮影 → ユーザに確認を依頼。

```bash
# 別ターミナルで dev server 起動 (background 推奨)
npm run dev
# → http://localhost:4321/tools/char-count を開いて目視確認
```

確認項目:

- [ ] PC でカード 3 枚が横並びになる
- [ ] モバイルでカードが縦積みになる
- [ ] 281 文字 ASCII を入れて X カードのオーバーフロー帯が描画される
- [ ] 任意上限 input がカード内に収まり編集できる
- [ ] 「概算」ラベルが消えている

スクリーンショットをユーザに見せて承認を取ってから次に進む。

### - [ ] Step 8: Commit

```bash
git add src/components/tools/CharCount.tsx src/components/tools/__tests__/CharCount.test.tsx
git commit -m "$(cat <<'EOF'
feat(char-count): SNS セクションをカードグリッドに再設計 (#376)

X / Bluesky / 任意上限 を 3 枚の <article> カードに分け、
ProgressBar (オーバーフロー帯対応) と計算方法 caption を付与。
PC で横並び、モバイルで縦積み。「概算」ラベル削除。
EOF
)"
```

---

## Task 4: E2E テストを追加する

**Files:**

- Create: `tests/e2e/char-count-sns.spec.ts`

### - [ ] Step 1: 既存 E2E スペックの構造を確認

```bash
ls tests/e2e/ | head -10
```

その中の `char-count*.spec.ts` 等を一つ Read して、import / setup の流儀 (`import { test, expect } from '@playwright/test'` / preview ベース等) を確認する。

### - [ ] Step 2: `tests/e2e/char-count-sns.spec.ts` を新規作成

既存スペックの作法に合わせて以下を作成する (locator は role-based、`memory[Playwright Locators]` 準拠)。

```typescript
import { test, expect } from '@playwright/test';

const CHAR_COUNT_PATH = '/tools/char-count';

test.describe('文字カウント — SNS カード layout', () => {
  test('PC: SNS カード 3 枚が横並びになる', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(CHAR_COUNT_PATH);

    const xCard = page.getByRole('heading', { name: 'X (旧 Twitter)' });
    const blueskyCard = page.getByRole('heading', { name: 'Bluesky' });
    const customCard = page.getByRole('heading', { name: '任意上限' });

    await expect(xCard).toBeVisible();
    await expect(blueskyCard).toBeVisible();
    await expect(customCard).toBeVisible();

    // 横並び判定: 3 つの heading が同じ Y 座標 (±5px) に並ぶ
    const xBox = await xCard.boundingBox();
    const bskyBox = await blueskyCard.boundingBox();
    const customBox = await customCard.boundingBox();
    expect(xBox).not.toBeNull();
    expect(bskyBox).not.toBeNull();
    expect(customBox).not.toBeNull();
    if (xBox && bskyBox && customBox) {
      expect(Math.abs(xBox.y - bskyBox.y)).toBeLessThan(5);
      expect(Math.abs(xBox.y - customBox.y)).toBeLessThan(5);
    }
  });

  test('モバイル: SNS カード 3 枚が縦積みになる', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(CHAR_COUNT_PATH);

    const xCard = page.getByRole('heading', { name: 'X (旧 Twitter)' });
    const blueskyCard = page.getByRole('heading', { name: 'Bluesky' });
    const customCard = page.getByRole('heading', { name: '任意上限' });

    const xBox = await xCard.boundingBox();
    const bskyBox = await blueskyCard.boundingBox();
    const customBox = await customCard.boundingBox();
    expect(xBox).not.toBeNull();
    expect(bskyBox).not.toBeNull();
    expect(customBox).not.toBeNull();
    if (xBox && bskyBox && customBox) {
      expect(bskyBox.y).toBeGreaterThan(xBox.y);
      expect(customBox.y).toBeGreaterThan(bskyBox.y);
    }
  });

  test('281 字 ASCII を入れると X カードがオーバーフロー帯を描画する', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(CHAR_COUNT_PATH);

    await page.getByLabel('入力テキスト').fill('a'.repeat(281));
    // X カードの progressbar (1 番目) の aria-valuetext で「上限超過」を通知
    const bars = page.getByRole('progressbar');
    const xBar = bars.nth(0);
    await expect(xBar).toHaveAttribute('aria-valuenow', '280');
    const valuetext = await xBar.getAttribute('aria-valuetext');
    expect(valuetext).toContain('281');
    expect(valuetext).toMatch(/超過|over/i);
  });

  test('URL を入れると X weight が 23 換算される', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(CHAR_COUNT_PATH);

    await page.getByLabel('入力テキスト').fill('https://example.com');
    const xBar = page.getByRole('progressbar').nth(0);
    await expect(xBar).toHaveAttribute('aria-valuenow', '23');
  });
});
```

### - [ ] Step 3: stale port を kill して E2E を実行

```bash
npm run pretest:e2e 2>&1 | tail -5
npm run test:e2e -- char-count-sns 2>&1 | tail -20
```

Expected: 4 ケース pass。Playwright のサマリ `passed` 行を確認 (`memory[テスト結果は集計行を必ず見る]`)。

### - [ ] Step 4: Commit

```bash
git add tests/e2e/char-count-sns.spec.ts
git commit -m "$(cat <<'EOF'
test(char-count): SNS カード layout の E2E を追加 (#376)

PC 横並び / モバイル縦積み / 上限超過時のオーバーフロー帯 /
URL の 23 換算 を Playwright で検証。
EOF
)"
```

---

## Task 5: ドキュメントを更新する

**Files:**

- Modify: `docs/decisions.md`

### - [ ] Step 1: docs/decisions.md に意思決定エントリを追加

`docs/decisions.md` の末尾に以下のエントリを追加する (既存スタイルの番号体系に従い、最大番号 +1 を使う。最大番号は `grep -E '^\[\d+\]' docs/decisions.md | tail -1` で確認)。

```markdown
[XXX] X (旧 Twitter) 文字数を twitter-text 公式仕様に準拠 (2026-05-10)

- **背景**: 既存 `twitterWeight()` は `cp <= 0x10FF ? 1 : 2` のみで、URL 短縮 / weight ranges / trim 未対応。
- **決定**: twitter-text 公式仕様に準拠する。URL 検知は自前の簡易 regex (`/https?:\/\/[^\s<>"]+/gi` + 末尾句読点除去) を使い、`twitter-text` npm パッケージは導入しない。
- **理由**:
  - 依存追加の保守コスト > 自前 regex の typical URL 一致率 (~95%)。
  - twitter-text は 1MB 超の正規表現テーブルを含み bundle 増を招く (本ツールはブラウザ完結型で軽量重視)。
  - IDN / cashtag / mention 等の周辺仕様は SNS 投稿前のセルフチェック用途では precision より recall を優先するため簡易対応で十分。
- **トレードオフ**:
  - URL の末尾形 / IDN / 未来の TLD 拡張で誤差が出る → conformance テストで早期検知。
  - 完全互換が必要になったら別 issue で twitter-text lib 採択を再検討。
- **影響範囲**: `src/utils/char-count/sns.ts`、関連テスト。`/tools/char-count` の SNS セクション UI 表記も「概算」を外す。
```

### - [ ] Step 2: README.md / SPEC.md の影響を確認

`docs/shared-agent-rules.md` 4 章のドキュメント更新ルールに従い、以下を確認:

- ツール追加 / 削除 / slug 変更 → なし
- ライブラリ追加 / 削除 → なし (twitter-text 不採用)
- ディレクトリ構成変更 → なし

→ README.md / SPEC.md 更新は不要。

### - [ ] Step 3: 型チェック / format

```bash
npm run format -- docs/decisions.md
```

Expected: format 適用済み or unchanged。

### - [ ] Step 4: Commit

```bash
git add docs/decisions.md
git commit -m "$(cat <<'EOF'
docs(char-count): X 文字数の twitter-text 準拠採用を decisions に記録 (#376)
EOF
)"
```

---

## Task 6: PR を作成する

**Files:** なし (git / gh 操作のみ)

### - [ ] Step 1: 全テスト + 型チェックを最終確認

```bash
npm run test 2>&1 | tail -10
node_modules/.bin/astro check 2>&1 | tail -10
npm run pretest:e2e && npm run test:e2e 2>&1 | tail -20
npm run format:check 2>&1 | tail -10
```

すべて pass を確認 (`memory[レビュー修正後の必須手順]`)。

### - [ ] Step 2: ブランチを push

```bash
git status
git log --oneline origin/develop..HEAD
git push -u origin feat/issue-376-char-count-sns-redesign
```

`git log` の出力をユーザに見せて承認を取ってから push する (`memory[push 前 commit + git log 確認]`)。

### - [ ] Step 3: PR 本文を準備

`/tmp/claude/pr_body.md` を作成 (`memory[Settings allow-list first]` の writable 範囲)。

```markdown
## 概要

Resolves #376

`/tools/char-count` の SNS セクションを横並びカード化 + 進捗バー化し、X (旧 Twitter) の文字数を twitter-text 公式仕様に準拠させた。

## 変更内容

### UI (SNS セクション)

- `<dl>` 定義リスト → 3 枚の `<article>` カードグリッド (PC: `md:grid-cols-3` / モバイル: 縦積み)
- 新規 `ProgressBar` 共通コンポーネント (オーバーフロー帯付き)
- 各カードに計算方法ラベル + caption (`URL を 23 字換算、CJK は 2 weight` 等)
- 「概算」ラベル削除

### ロジック (X 文字数)

- URL 検知: `https?://...` を 23 weighted chars に換算 (末尾句読点除去込み)
- weight-1 ranges 追加: `U+2000-200D`, `U+2010-201F`, `U+2032-2037`
- 前後空白 (半角・全角) trim

### a11y

- ProgressBar に `role="progressbar"` + `aria-valuemin/max/now` (clamp)
- `aria-valuetext` で上限超過を SR に通知
- caption と `aria-describedby` で関連付け

## テスト

- [x] Vitest unit (twitterWeight 新仕様 / ProgressBar / CharCount カード構造)
- [x] Playwright E2E (PC 横並び / モバイル縦積み / 上限超過 / URL 23 換算)
- [ ] VRT baseline (CI Linux runner で workflow_dispatch 実行予定)
- [x] Playwright MCP で実機ビジュアル確認 (PC + モバイル)

## 非対象 (out of scope)

- 文字数 / エンコーディング / 行 / 原稿 セクションのレイアウト変更 → 別 issue
- twitter-text npm パッケージの採択 (依存最小化のため自前実装) → `docs/decisions.md` 参照

## 設計書 / 計画

- `docs/superpowers/specs/2026-05-10-char-count-sns-redesign-design.md`
- `docs/superpowers/plans/2026-05-10-char-count-sns-redesign.md`
```

### - [ ] Step 4: PR を作成 (--base develop 指定必須)

```bash
gh pr create --base develop --title "feat(char-count): SNS セクション再設計 + X 文字数を twitter-text 仕様準拠 (#376)" --body-file /tmp/claude/pr_body.md
```

`memory[gh 本文投稿は常に --body-file 経由]` 準拠。

### - [ ] Step 5: CI / VRT baseline workflow を起動

PR 作成直後に VRT baseline を再生成する (`memory[VRT CI Only]` 準拠、ローカル baseline 生成は禁止)。

```bash
gh workflow run "Update Visual Regression Baseline" --ref feat/issue-376-char-count-sns-redesign 2>&1 || \
  echo "workflow_dispatch trigger failed — UI で手動実行"
```

workflow が実行された後の baseline commit が PR に push される。CI green 確認はユーザレビュー後に。

### - [ ] Step 6: PR URL をユーザに報告

```bash
gh pr view --json url -q .url
```

URL をユーザに伝え、レビュー / マージ判断を依頼する。

---

## 自己レビュー (Self-Review) チェックリスト

実装計画完成後、spec と突き合わせて以下を確認した:

**1. Spec coverage:**

| Spec 章                                       | 対応 Task                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| 4.1 レイアウト (PC 3 カラム / モバイル縦積み) | Task 3 (CharCount.tsx grid-cols-1 md:grid-cols-3) + Task 4 (E2E 検証)      |
| 4.2 カード構造                                | Task 3 (SnsCard component)                                                 |
| 4.3 進捗バー視覚仕様                          | Task 2 (ProgressBar + CSS)                                                 |
| 4.4 上限超過時挙動                            | Task 2 (overflow segment + aria-valuetext) + Task 3 (text-error + sr-only) |
| 4.5 caption 説明                              | Task 3 (`URL を 23 字換算、CJK は 2 weight` 等)                            |
| 5.1 trim / URL / weight ranges                | Task 1                                                                     |
| 5.2 URL regex                                 | Task 1 (extractUrlRanges)                                                  |
| 5.3 ラベル変更 (「概算」削除)                 | Task 3 + Task 5 (decisions.md)                                             |
| 7.1 unit test (twitter-text サンプル)         | Task 1 Step 1 (URL / trim / punctuation ケース)                            |
| 7.2 unit test (CharCount)                     | Task 3 Step 1                                                              |
| 7.3 E2E                                       | Task 4                                                                     |
| 7.4 ガード対象外 (validator ではなく精度向上) | (テスト方針として記述、コードなし)                                         |
| 8 既存テスト・VRT 影響                        | Task 1 Step 5 (回帰確認) + Task 6 Step 5 (VRT baseline)                    |
| 9 リスク (URL regex edge case)                | Task 1 Step 1 のテスト網羅                                                 |
| 10 PR スコープ (1 PR)                         | Task 6                                                                     |

ギャップなし。

**2. Placeholder scan:**

- "TBD" / "TODO" / "implement later" の検索 → 該当なし
- 「適切なエラーハンドリングを追加」のような曖昧記述 → なし
- コードブロックなしの "code step" → なし

**3. Type consistency:**

- `extractUrlRanges` の戻り値 (`Array<{ start: number; end: number }>`) は Task 1 のみで使用、整合
- `ProgressBar` の props (`current`, `max`, `aria-describedby`) は Task 2 で定義し Task 3 で使用、整合
- `SnsCardProps` (`limitNode?: ReactNode`) は Task 3 内で完結、整合

問題なし。
