# HAR ウォーターフォール（タイミング可視化）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HAR ビューアに、各リクエストの所要時間をフェーズ別色分けの横棒で可視化するウォーターフォールを追加する。

**Architecture:** 純関数 `computeWaterfall` が `HarEntry[]` から全体タイムライン基準の配置モデルを計算し、一覧テーブルの新列（スマホでは非表示）と詳細パネルが描画する。動的な幅・オフセットは inline `style` 禁止のため `useDynamicStyleSheet`（Constructable Stylesheets）で CSS カスタムプロパティとして注入する。配色は `@theme` semantic token + `@layer components` クラス経由。

**Tech Stack:** TypeScript, React, Astro, Tailwind v4, Vitest, @testing-library/react, Playwright。

設計仕様の正本: `docs/superpowers/specs/2026-06-15-har-waterfall-design.md`

---

## File Structure

- `src/utils/har/types.ts`（変更）: `HarTimings` 型を追加し `HarEntry.timings` を定義
- `src/utils/har/waterfall.ts`（新規）: `computeWaterfall` と関連型（純関数）
- `src/utils/har/index.ts`（変更）: waterfall の型・関数を re-export
- `src/utils/har/__tests__/waterfall.test.ts`（新規）: 陽性対照テスト
- `src/utils/har/__tests__/sanitize.test.ts`（変更）: timings 非破壊テストを追加
- `src/styles/global.css`（変更）: フェーズ色トークン + `.har-phase-*` / `.har-bar` / `.har-seg` / `.har-track` クラス
- `src/components/tools/HarWaterfallBar.tsx`（新規）: 一覧用の横棒セル（表示専用）
- `src/components/tools/__tests__/HarWaterfallBar.test.tsx`（新規）: 描画テスト
- `src/components/tools/HarEntryList.tsx`（変更）: タイミング列追加 + 単一の動的 stylesheet
- `src/components/tools/HarEntryDetail.tsx`（変更）: フェーズ別内訳セクション追加
- `src/components/tools/HarViewer.tsx`（変更）: `computeWaterfall` を `useMemo` 配線
- ドキュメント: `docs/tools.md` / `docs/decisions.md` / `SPEC.md`

---

## Task 1: 型拡張（HarTimings）とサニタイズ非破壊テスト

**Files:**
- Modify: `src/utils/har/types.ts`
- Modify: `src/utils/har/index.ts`
- Test: `src/utils/har/__tests__/sanitize.test.ts`

- [ ] **Step 1: `HarTimings` 型を追加し `HarEntry` に `timings` を足す**

`src/utils/har/types.ts` の `HarEntry` 定義の直前に以下を追加:

```ts
export interface HarTimings {
  blocked?: number;
  dns?: number;
  connect?: number;
  send?: number;
  wait?: number;
  receive?: number;
  ssl?: number;
  comment?: string;
  [key: string]: unknown;
}
```

`HarEntry` を次のように変更（`timings` フィールドを追加）:

```ts
export interface HarEntry {
  startedDateTime?: string;
  time?: number;
  request: HarRequest;
  response: HarResponse;
  timings?: HarTimings;
  [key: string]: unknown;
}
```

- [ ] **Step 2: `index.ts` で `HarTimings` を re-export**

`src/utils/har/index.ts` の `export type { ... } from './types';` ブロックに `HarTimings` を追加:

```ts
export type {
  Har,
  HarLog,
  HarEntry,
  HarRequest,
  HarResponse,
  HarNameValue,
  HarCookie,
  HarPostData,
  HarContent,
  HarTimings,
} from './types';
```

- [ ] **Step 3: timings 非破壊テストを追加（失敗を確認）**

`src/utils/har/__tests__/sanitize.test.ts` の末尾の `describe` 内（最後の `})` の前）に追加。
既存ファイル冒頭の import（`sanitizeHar`, `HAR_REDACT_DEFAULT` 等）を流用する。
import に無ければ補う（`import { HAR_REDACT_DEFAULT } from '../rules';` など既存スタイルに合わせる）:

```ts
it('timings フィールドをサニタイズで破壊・改変しない', () => {
  const timings = {
    blocked: 10,
    dns: 20,
    connect: 30,
    ssl: 10,
    send: 5,
    wait: 30,
    receive: 5,
  };
  const input = {
    log: {
      version: '1.2',
      entries: [
        {
          startedDateTime: '2026-06-15T00:00:00.000Z',
          time: 100,
          timings: { ...timings },
          request: {
            method: 'GET',
            url: 'https://example.com/',
            headers: [],
            queryString: [],
            cookies: [],
          },
          response: { status: 200, headers: [], cookies: [], content: { size: 0 } },
        },
      ],
    },
  };
  const { har } = sanitizeHar(input, HAR_REDACT_DEFAULT);
  expect(har.log.entries[0]!.timings).toEqual(timings);
  // 入力非破壊
  expect(input.log.entries[0]!.timings).toEqual(timings);
});
```

Run: `npm run test -- src/utils/har/__tests__/sanitize.test.ts`
Expected: 既存テストは PASS、追加テストも PASS（サニタイザは `structuredClone` で timings を保持・mutate しないため最初から通る想定。型を追加したことで `entries[0]!.timings` が型エラーにならないことを併せて確認する）。

- [ ] **Step 4: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（`timings` 参照が型解決される）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/har/types.ts src/utils/har/index.ts src/utils/har/__tests__/sanitize.test.ts
git commit -m "feat: HarEntry に timings 型を追加しサニタイズ非破壊を担保 (#674)"
```

---

## Task 2: computeWaterfall 純関数（陽性対照テスト先行・TDD）

**Files:**
- Create: `src/utils/har/waterfall.ts`
- Modify: `src/utils/har/index.ts`
- Test: `src/utils/har/__tests__/waterfall.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/har/__tests__/waterfall.test.ts` を新規作成:

```ts
import { describe, it, expect } from 'vitest';
import { computeWaterfall } from '../waterfall';
import type { HarEntry } from '../types';

function entry(over: Partial<HarEntry>): HarEntry {
  return {
    startedDateTime: '2026-06-15T00:00:00.000Z',
    time: 100,
    request: { method: 'GET', url: 'https://example.com/', headers: [], queryString: [], cookies: [] },
    response: { status: 200, headers: [], cookies: [], content: { size: 0 } },
    ...over,
  };
}

describe('computeWaterfall', () => {
  it('既知 timings をフェーズ別 widthRatio に分解する', () => {
    const model = computeWaterfall([
      entry({ timings: { blocked: 10, dns: 20, connect: 30, ssl: 10, send: 5, wait: 30, receive: 5 } }),
    ]);
    expect(model.totalMs).toBe(100);
    const row = model.rows[0];
    expect(row.hasTimeline).toBe(true);
    expect(row.offsetRatio).toBe(0);
    expect(row.widthRatio).toBeCloseTo(1, 5);
    // connect は ssl を控除して 20ms、ssl は別セグメント 10ms
    const phases = row.segments.map((s) => [s.phase, s.ms]);
    expect(phases).toEqual([
      ['blocked', 10],
      ['dns', 20],
      ['connect', 20],
      ['ssl', 10],
      ['send', 5],
      ['wait', 30],
      ['receive', 5],
    ]);
    // バー内相対幅: connect 20/100=0.2
    const connect = row.segments.find((s) => s.phase === 'connect')!;
    expect(connect.widthRatio).toBeCloseTo(0.2, 5);
  });

  it('ssl を connect から控除し二重計上しない', () => {
    const model = computeWaterfall([entry({ timings: { connect: 100, ssl: 40, wait: 50 } })]);
    const segs = model.rows[0].segments;
    expect(segs.find((s) => s.phase === 'connect')!.ms).toBe(60);
    expect(segs.find((s) => s.phase === 'ssl')!.ms).toBe(40);
    // 合計は connect(60)+ssl(40)+wait(50)=150（元の connect 100 を二重に数えない）
    expect(model.rows[0].totalMs).toBe(150);
  });

  it('-1 / 未定義 / 0 のフェーズはセグメント化しない', () => {
    const model = computeWaterfall([entry({ timings: { blocked: -1, dns: 0, wait: 40 } })]);
    expect(model.rows[0].segments.map((s) => s.phase)).toEqual(['wait']);
  });

  it('全体タイムライン基準で後発エントリを相対配置する', () => {
    const model = computeWaterfall([
      entry({ startedDateTime: '2026-06-15T00:00:00.000Z', timings: { wait: 100 } }),
      entry({ startedDateTime: '2026-06-15T00:00:00.050Z', timings: { wait: 50 } }),
    ]);
    expect(model.totalMs).toBe(100);
    expect(model.rows[0].offsetRatio).toBeCloseTo(0, 5);
    expect(model.rows[0].widthRatio).toBeCloseTo(1, 5);
    expect(model.rows[1].offsetRatio).toBeCloseTo(0.5, 5);
    expect(model.rows[1].widthRatio).toBeCloseTo(0.5, 5);
  });

  it('startedDateTime / timings 欠落・null エントリを安全に degrade する', () => {
    const model = computeWaterfall([
      null,
      entry({ startedDateTime: undefined, timings: { wait: 10 } }),
      entry({ timings: undefined }),
      entry({ timings: { wait: 30 } }),
    ]);
    expect(model.rows).toHaveLength(4);
    expect(model.rows[0].hasTimeline).toBe(false);
    expect(model.rows[1].hasTimeline).toBe(false); // start 無し
    expect(model.rows[2].hasTimeline).toBe(false); // timings 無し
    expect(model.rows[3].hasTimeline).toBe(true);
  });

  it('有効なタイムラインが 1 つも無くても例外を投げない', () => {
    const model = computeWaterfall([null, entry({ startedDateTime: undefined, timings: undefined })]);
    expect(model.rows.every((r) => r.hasTimeline === false)).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test -- src/utils/har/__tests__/waterfall.test.ts`
Expected: FAIL（`computeWaterfall` 未定義 / モジュール解決不可）。

- [ ] **Step 3: `computeWaterfall` を実装**

`src/utils/har/waterfall.ts` を新規作成:

```ts
import type { HarEntry, HarTimings } from './types';

/** ウォーターフォールで描画する HAR タイミングフェーズ（描画順）。 */
export type HarPhase = 'blocked' | 'dns' | 'connect' | 'ssl' | 'send' | 'wait' | 'receive';

/** フェーズ描画順。ssl は connect の末尾区間として connect の直後に置く。 */
export const PHASE_ORDER: HarPhase[] = [
  'blocked',
  'dns',
  'connect',
  'ssl',
  'send',
  'wait',
  'receive',
];

export interface WaterfallSegment {
  phase: HarPhase;
  /** フェーズ所要時間（ms, > 0）。 */
  ms: number;
  /** バー内相対幅（ms / totalMs, 0..1）。flex セグメント幅に使う。 */
  widthRatio: number;
}

export interface WaterfallRow {
  /** 起点・timings から横棒を描画できるか。false なら "—" を表示。 */
  hasTimeline: boolean;
  /** 全体起点からの相対開始位置（(start - t0) / globalTotal, 0..1）。 */
  offsetRatio: number;
  /** バー全体幅（durationMs / globalTotal, 0..1）。 */
  widthRatio: number;
  /** このエントリのフェーズ合計 ms。 */
  totalMs: number;
  segments: WaterfallSegment[];
}

export interface WaterfallModel {
  /** 全体タイムラインの総時間（ms, >= 1）。 */
  totalMs: number;
  /** entries と同じ長さ・同じ順序。 */
  rows: WaterfallRow[];
}

/** startedDateTime（ISO 文字列）を epoch ms に変換。解析不能・非文字列は null。 */
function parseStart(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** timings の 1 フィールドを正の ms として読む（-1 / 未定義 / 非数 / 0 以下は 0）。 */
function phaseMs(timings: HarTimings, key: string): number {
  const v = timings[key];
  return typeof v === 'number' && v > 0 ? v : 0;
}

/** timings をフェーズ別 ms 列に分解する（ssl は connect から控除）。 */
function buildPhaseMs(timings: HarTimings | undefined): { phase: HarPhase; ms: number }[] {
  if (!timings || typeof timings !== 'object') return [];
  const sslMs = phaseMs(timings, 'ssl');
  // HAR 1.2: ssl は connect の部分時間。二重計上を避けるため connect から控除する。
  const connectMs = Math.max(phaseMs(timings, 'connect') - sslMs, 0);
  const byPhase: Record<HarPhase, number> = {
    blocked: phaseMs(timings, 'blocked'),
    dns: phaseMs(timings, 'dns'),
    connect: connectMs,
    ssl: sslMs,
    send: phaseMs(timings, 'send'),
    wait: phaseMs(timings, 'wait'),
    receive: phaseMs(timings, 'receive'),
  };
  const out: { phase: HarPhase; ms: number }[] = [];
  for (const phase of PHASE_ORDER) {
    if (byPhase[phase] > 0) out.push({ phase, ms: byPhase[phase] });
  }
  return out;
}

/**
 * HAR エントリ列から全体タイムライン基準のウォーターフォール配置モデルを計算する。
 * 純関数・入力非破壊（entries を読むのみ）。
 */
export function computeWaterfall(entries: (HarEntry | null)[]): WaterfallModel {
  // 1st pass: 各エントリの起点とフェーズ列・所要時間を求める。
  const pre = entries.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return { start: null as number | null, phases: [] as { phase: HarPhase; ms: number }[], durationMs: 0 };
    }
    const start = parseStart(entry.startedDateTime);
    const phases = buildPhaseMs(entry.timings);
    const durationMs = phases.reduce((a, p) => a + p.ms, 0);
    return { start, phases, durationMs };
  });

  // 全体タイムライン（描画可能なエントリのみで起点・終点を決める）。
  let t0 = Infinity;
  let tEnd = -Infinity;
  for (const p of pre) {
    if (p.start == null || p.phases.length === 0) continue;
    if (p.start < t0) t0 = p.start;
    const end = p.start + p.durationMs;
    if (end > tEnd) tEnd = end;
  }
  const hasGlobal = Number.isFinite(t0) && Number.isFinite(tEnd);
  const totalMs = hasGlobal ? Math.max(tEnd - t0, 1) : 1;

  const rows: WaterfallRow[] = pre.map((p) => {
    const hasTimeline = hasGlobal && p.start != null && p.phases.length > 0;
    if (!hasTimeline) {
      return { hasTimeline: false, offsetRatio: 0, widthRatio: 0, totalMs: p.durationMs, segments: [] };
    }
    const offsetRatio = (p.start! - t0) / totalMs;
    const widthRatio = p.durationMs / totalMs;
    const segments: WaterfallSegment[] = p.phases.map((ph) => ({
      phase: ph.phase,
      ms: ph.ms,
      widthRatio: ph.ms / p.durationMs,
    }));
    return { hasTimeline: true, offsetRatio, widthRatio, totalMs: p.durationMs, segments };
  });

  return { totalMs, rows };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- src/utils/har/__tests__/waterfall.test.ts`
Expected: PASS（全 6 ケース）。

- [ ] **Step 5: `index.ts` で waterfall を re-export**

`src/utils/har/index.ts` の末尾に追加:

```ts
export { computeWaterfall, PHASE_ORDER } from './waterfall';
export type { HarPhase, WaterfallSegment, WaterfallRow, WaterfallModel } from './waterfall';
```

- [ ] **Step 6: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし。

- [ ] **Step 7: Commit**

```bash
git add src/utils/har/waterfall.ts src/utils/har/index.ts src/utils/har/__tests__/waterfall.test.ts
git commit -m "feat: computeWaterfall でタイミング配置モデルを算出 (#674)"
```

---

## Task 3: フェーズ配色トークンと CSS クラス

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: `@theme` にフェーズ色トークンを追加**

`src/styles/global.css` の `@theme` ブロック内（既存のセマンティック色トークン群の近く、
`--color-info-bg` 行のあたり）に追加:

```css
  /* HAR ウォーターフォール フェーズ色（質的パレット・primitive 直書き回避のためトークン化） */
  --color-har-blocked: #9ca3af; /* neutral-400: 待機/キュー */
  --color-har-dns: #854d0e; /* amber-800: 名前解決 */
  --color-har-connect: #15803d; /* green-700: TCP 接続 */
  --color-har-ssl: #7c3aed; /* violet-600: TLS */
  --color-har-send: #0e3293; /* tertiary: 送信 */
  --color-har-wait: #1a56db; /* primary: TTFB（最重要） */
  --color-har-receive: #2563eb; /* blue-600: 受信 */
```

- [ ] **Step 2: `@layer components` にウォーターフォール用クラスを追加**

`src/styles/global.css` の `@layer components { ... }` ブロック内に追加。
動的な `--bar-left` / `--bar-width` / `--seg-width` は `useDynamicStyleSheet` が当てる
（ここでは参照のみ）。フォールバック値を付け、stylesheet 適用前（FOUC 1 frame）も破綻させない:

```css
  /* HAR ウォーターフォール */
  .har-track {
    position: relative;
    width: 100%;
    min-width: 8rem;
    height: 0.75rem;
    background: var(--color-bg-subtle);
    border-radius: 9999px;
    overflow: hidden;
  }
  .har-bar {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--bar-left, 0%);
    width: var(--bar-width, 0%);
    display: flex;
    min-width: 1px;
  }
  .har-seg {
    height: 100%;
    width: var(--seg-width, 0%);
    min-width: 1px;
  }
  .har-phase-blocked { background: var(--color-har-blocked); }
  .har-phase-dns { background: var(--color-har-dns); }
  .har-phase-connect { background: var(--color-har-connect); }
  .har-phase-ssl { background: var(--color-har-ssl); }
  .har-phase-send { background: var(--color-har-send); }
  .har-phase-wait { background: var(--color-har-wait); }
  .har-phase-receive { background: var(--color-har-receive); }
  /* 詳細パネルのミニバー（1 行 1 フェーズ） */
  .har-mini-track {
    position: relative;
    height: 0.5rem;
    width: 100%;
    background: var(--color-bg-subtle);
    border-radius: 9999px;
    overflow: hidden;
  }
  .har-mini-fill {
    height: 100%;
    width: var(--mini-width, 0%);
    min-width: 1px;
  }
  /* フェーズ色チップ（詳細パネルの凡例） */
  .har-chip {
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 0.125rem;
    vertical-align: middle;
  }
```

- [ ] **Step 3: ビルドでクラスが出力されることを確認**

Run: `npm run build`
Expected: 成功。続けて生成 CSS にクラスが含まれるか確認:

Run: `grep -o "har-phase-wait" dist/_astro/*.css | head -1`
Expected: `har-phase-wait` が出力される（手書き class なので variant は付けていない＝ build に含まれる）。

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: HAR ウォーターフォールのフェーズ色トークンと CSS クラスを追加 (#674)"
```

---

## Task 4: HarWaterfallBar コンポーネント（表示専用）

**Files:**
- Create: `src/components/tools/HarWaterfallBar.tsx`
- Test: `src/components/tools/__tests__/HarWaterfallBar.test.tsx`

このコンポーネントは **表示専用**。動的 stylesheet は親（HarEntryList）が一括管理し、
ここでは `data-har-bar` / `data-har-seg` 属性と `.har-phase-*` クラスを付けるだけ。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/tools/__tests__/HarWaterfallBar.test.tsx` を新規作成:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HarWaterfallBar } from '../HarWaterfallBar';
import type { WaterfallRow } from '@/utils/har';

const row: WaterfallRow = {
  hasTimeline: true,
  offsetRatio: 0,
  widthRatio: 1,
  totalMs: 100,
  segments: [
    { phase: 'wait', ms: 70, widthRatio: 0.7 },
    { phase: 'receive', ms: 30, widthRatio: 0.3 },
  ],
};

describe('HarWaterfallBar', () => {
  it('hasTimeline=true でセグメントを描画し aria-label に内訳を出す', () => {
    render(<HarWaterfallBar row={row} rowIndex={2} />);
    const bar = screen.getByLabelText(/wait 70ms/);
    expect(bar).toBeInTheDocument();
    expect(bar.getAttribute('data-har-bar')).toBe('2');
    // セグメント要素が 2 つ、フェーズ色クラスと data-har-seg を持つ
    const segs = bar.querySelectorAll('.har-seg');
    expect(segs).toHaveLength(2);
    expect(segs[0].classList.contains('har-phase-wait')).toBe(true);
    expect(segs[0].getAttribute('data-har-seg')).toBe('2-0');
  });

  it('hasTimeline=false ではダッシュを表示しバーを描画しない', () => {
    const empty: WaterfallRow = { hasTimeline: false, offsetRatio: 0, widthRatio: 0, totalMs: 0, segments: [] };
    const { container } = render(<HarWaterfallBar row={empty} rowIndex={0} />);
    expect(container.querySelector('.har-bar')).toBeNull();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test -- src/components/tools/__tests__/HarWaterfallBar.test.tsx`
Expected: FAIL（`HarWaterfallBar` 未定義）。

- [ ] **Step 3: `HarWaterfallBar` を実装**

`src/components/tools/HarWaterfallBar.tsx` を新規作成:

```tsx
import type { WaterfallRow } from '@/utils/har';

interface Props {
  row: WaterfallRow;
  /** 親が生成する動的 stylesheet と対応付ける行 index。 */
  rowIndex: number;
}

/** フェーズ→色クラスの対応。色は CSS クラス経由（色値直書き禁止）。 */
const PHASE_CLASS: Record<string, string> = {
  blocked: 'har-phase-blocked',
  dns: 'har-phase-dns',
  connect: 'har-phase-connect',
  ssl: 'har-phase-ssl',
  send: 'har-phase-send',
  wait: 'har-phase-wait',
  receive: 'har-phase-receive',
};

/**
 * 一覧テーブル用のタイミング横棒（表示専用）。
 * 幅・オフセットは親の useDynamicStyleSheet が `[data-har-bar]` / `[data-har-seg]`
 * 属性経由で当てる（inline style は CSP style-src 制約により使用しない）。
 */
export function HarWaterfallBar({ row, rowIndex }: Props) {
  if (!row.hasTimeline || row.segments.length === 0) {
    return <span className="text-muted">—</span>;
  }
  const label =
    row.segments.map((s) => `${s.phase} ${Math.round(s.ms)}ms`).join(', ') +
    `, 合計 ${Math.round(row.totalMs)}ms`;
  return (
    <div className="har-track">
      <div className="har-bar" data-har-bar={rowIndex} aria-label={label} title={label}>
        {row.segments.map((s, j) => (
          <span
            key={j}
            className={`har-seg ${PHASE_CLASS[s.phase] ?? ''}`}
            data-har-seg={`${rowIndex}-${j}`}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- src/components/tools/__tests__/HarWaterfallBar.test.tsx`
Expected: PASS（2 ケース）。

- [ ] **Step 5: 型チェック**

Run: `npx astro check`
Expected: エラーなし。

- [ ] **Step 6: Commit**

```bash
git add src/components/tools/HarWaterfallBar.tsx src/components/tools/__tests__/HarWaterfallBar.test.tsx
git commit -m "feat: HarWaterfallBar で一覧用タイミング横棒を描画 (#674)"
```

---

## Task 5: HarEntryList にタイミング列と動的 stylesheet を追加

**Files:**
- Modify: `src/components/tools/HarEntryList.tsx`

`computeWaterfall` の結果（`WaterfallModel`）を props で受け取り、新列にバーを描画する。
動的な幅・オフセットは **このコンポーネントで 1 回だけ** `useDynamicStyleSheet` を呼び、
全行・全セグメント分の CSS ルールを生成して当てる。

- [ ] **Step 1: import と props を追加**

`src/components/tools/HarEntryList.tsx` の先頭 import を次に置き換える:

```tsx
import type { HarEntry, WaterfallModel } from '@/utils/har';
import { useDynamicStyleSheet } from '@/hooks/useDynamicStyleSheet';
import { cx } from '@/utils/cx';
import { HarWaterfallBar } from './HarWaterfallBar';

interface Props {
  entries: (HarEntry | null)[];
  waterfall: WaterfallModel;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}
```

- [ ] **Step 2: 動的 stylesheet と列を追加**

`export function HarEntryList(...)` を次のように書き換える（`shortUrl` / `formatSize` /
`formatTime` のヘルパー関数はそのまま残す）:

```tsx
export function HarEntryList({ entries, waterfall, selectedIndex, onSelect }: Props) {
  // 全行・全セグメントの幅/オフセットを 1 枚の stylesheet にまとめて注入する。
  // inline style / setProperty は CSP style-src 制約により使用しない（decisions [067]）。
  // 行ごとに hook を呼ぶと sheet を量産するため、必ずここで 1 回だけ呼ぶ。
  const dynClassName = useDynamicStyleSheet((className) => {
    const rules: string[] = [];
    waterfall.rows.forEach((row, i) => {
      if (!row.hasTimeline) return;
      rules.push(
        `.${className} [data-har-bar="${i}"] { --bar-left: ${(row.offsetRatio * 100).toFixed(4)}%; --bar-width: ${(row.widthRatio * 100).toFixed(4)}%; }`
      );
      row.segments.forEach((seg, j) => {
        rules.push(
          `.${className} [data-har-seg="${i}-${j}"] { --seg-width: ${(seg.widthRatio * 100).toFixed(4)}%; }`
        );
      });
    });
    return rules.join('\n');
  });

  return (
    <div className={cx('overflow-x-auto rounded border border-default', dynClassName)}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">HTTP リクエスト一覧</caption>
        <thead>
          <tr className="bg-subtle text-left">
            <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
              メソッド
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              URL
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
              ステータス
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
              サイズ
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
              時間
            </th>
            <th scope="col" className="hidden whitespace-nowrap px-3 py-2 font-medium md:table-cell">
              タイミング
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const request = e?.request;
            const response = e?.response;
            const url = typeof request?.url === 'string' ? request.url : null;
            return (
              <tr key={i} className={selectedIndex === i ? 'bg-active' : undefined}>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                  {request?.method ?? '—'}
                </td>
                <td className="px-3 py-1.5">
                  {url != null ? (
                    <button
                      type="button"
                      aria-current={selectedIndex === i ? 'true' : undefined}
                      className="text-left text-primary underline-offset-2 hover:underline"
                      onClick={() => onSelect(i)}
                    >
                      {shortUrl(url)}
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-current={selectedIndex === i ? 'true' : undefined}
                      className="text-left text-muted underline-offset-2 hover:underline"
                      onClick={() => onSelect(i)}
                    >
                      （壊れたエントリ）
                    </button>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                  {response?.status ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                  {formatSize(response?.content?.size ?? response?.bodySize)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono">{formatTime(e?.time)}</td>
                <td className="hidden px-3 py-1.5 md:table-cell">
                  <HarWaterfallBar row={waterfall.rows[i]} rowIndex={i} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

> 注: `waterfall.rows` は `entries` と同じ長さ・順序（Task 2 で保証）。`rows[i]` は常に存在する。

- [ ] **Step 3: 型チェック**

Run: `npx astro check`
Expected: エラーなし（`HarViewer` 側はまだ `waterfall` を渡していないので、この時点では
`HarViewer.tsx` で型エラーが出る可能性がある。Task 6 で配線するまでの一時的エラーは許容。
ただし `HarEntryList.tsx` 自体の構文・型は通っていること）。

- [ ] **Step 4: Commit**

```bash
git add src/components/tools/HarEntryList.tsx
git commit -m "feat: 一覧テーブルにタイミング列を追加（スマホ非表示） (#674)"
```

---

## Task 6: HarViewer で computeWaterfall を配線

**Files:**
- Modify: `src/components/tools/HarViewer.tsx`

- [ ] **Step 1: import と useMemo を追加**

`src/components/tools/HarViewer.tsx` の import 群に追加:

```tsx
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
```

（既存の `import { useState, useEffect, useCallback, useRef } from 'react';` を上記に置換）

`import { computeWaterfall } from '@/utils/har';` を `@/utils/har` からの既存 import に追加するか、
別行で追加する。既存の名前付き import ブロックは型主体のため、別途:

```tsx
import { computeWaterfall } from '@/utils/har';
```

- [ ] **Step 2: waterfall を計算して HarEntryList に渡す**

`const totalRedacted = ...` の直後あたりに追加:

```tsx
  const waterfall = useMemo(
    () => computeWaterfall(result ? result.har.log.entries : []),
    [result]
  );
```

`<HarEntryList ... />` の呼び出しに `waterfall` props を追加:

```tsx
          <HarEntryList
            entries={result.har.log.entries}
            waterfall={waterfall}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />
```

- [ ] **Step 3: 型チェック・ユニットテスト**

Run: `npx astro check`
Expected: エラーなし。

Run: `npm run test`
Expected: 全 PASS。

- [ ] **Step 4: Commit**

```bash
git add src/components/tools/HarViewer.tsx
git commit -m "feat: HarViewer で computeWaterfall を配線 (#674)"
```

---

## Task 7: HarEntryDetail にフェーズ別内訳セクションを追加

**Files:**
- Modify: `src/components/tools/HarEntryDetail.tsx`

スマホで一覧のバー列が消える分、ここがタイミング情報の主担保。1 エントリのみ描画のため
`useDynamicStyleSheet` を 1 回呼び、各フェーズのミニバー幅を当てる。

- [ ] **Step 1: import を追加**

`src/components/tools/HarEntryDetail.tsx` の先頭 import を置き換える:

```tsx
import type { HarEntry, HarNameValue } from '@/utils/har';
import { computeWaterfall } from '@/utils/har';
import { useDynamicStyleSheet } from '@/hooks/useDynamicStyleSheet';
import { cx } from '@/utils/cx';
```

- [ ] **Step 2: タイミング内訳サブコンポーネントを追加**

`NameValueTable` 関数の下に追加:

```tsx
const PHASE_LABEL: Record<string, string> = {
  blocked: '待機(blocked)',
  dns: 'DNS',
  connect: '接続(connect)',
  ssl: 'TLS(ssl)',
  send: '送信(send)',
  wait: '待ち(wait)',
  receive: '受信(receive)',
};

const PHASE_CLASS: Record<string, string> = {
  blocked: 'har-phase-blocked',
  dns: 'har-phase-dns',
  connect: 'har-phase-connect',
  ssl: 'har-phase-ssl',
  send: 'har-phase-send',
  wait: 'har-phase-wait',
  receive: 'har-phase-receive',
};

/** 詳細パネルのタイミング内訳（フェーズ名・色チップ・ms・ミニバー）。 */
function TimingBreakdown({ entry }: { entry: HarEntry }) {
  // 単一エントリのフェーズ分解には computeWaterfall を再利用する（ssl 控除等を一元化）。
  const model = computeWaterfall([entry]);
  const row = model.rows[0];
  const dynClassName = useDynamicStyleSheet((className) => {
    if (!row.hasTimeline) return '';
    return row.segments
      .map(
        (seg, j) =>
          `.${className} [data-har-mini="${j}"] { --mini-width: ${(seg.widthRatio * 100).toFixed(4)}%; }`
      )
      .join('\n');
  });

  if (!row.hasTimeline || row.segments.length === 0) return null;

  // PHASE_ORDER 順に並べる（segments は既にこの順）。
  return (
    <div className={dynClassName}>
      <h4 className="mb-1 mt-3 font-medium">タイミング</h4>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {row.segments.map((seg, j) => (
            <tr key={seg.phase} className="align-middle">
              <td className="whitespace-nowrap px-2 py-1">
                <span className={cx('har-chip', PHASE_CLASS[seg.phase])} aria-hidden="true" />{' '}
                {PHASE_LABEL[seg.phase] ?? seg.phase}
              </td>
              <td className="whitespace-nowrap px-2 py-1 text-right font-mono">
                {Math.round(seg.ms)} ms
              </td>
              <td className="w-1/2 px-2 py-1">
                <span className="har-mini-track">
                  <span className={cx('har-mini-fill', PHASE_CLASS[seg.phase])} data-har-mini={j} />
                </span>
              </td>
            </tr>
          ))}
          <tr className="align-middle font-medium">
            <td className="px-2 py-1">合計</td>
            <td className="px-2 py-1 text-right font-mono">{Math.round(row.totalMs)} ms</td>
            <td className="px-2 py-1" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

> 注: `segments` は `computeWaterfall` 側で既に `PHASE_ORDER` 順に整列済みのため、
> 本コンポーネントでは並べ替え不要（`PHASE_ORDER` を import しない）。

- [ ] **Step 3: レスポンスセクションの後に内訳を描画**

`return (` 内の最後の `</div>`（レスポンス div の閉じ）の直後、ルート div を閉じる前に
`<TimingBreakdown entry={entry} />` を追加する。具体的には:

```tsx
      <div>
        <h3 className="font-medium">
          レスポンス（{response.status} {response.statusText ?? ''}）
        </h3>
        <NameValueTable rows={response.headers} label="ヘッダ" />
        <NameValueTable rows={response.cookies} label="Cookie" />
        {response.content?.text != null && (
          <div>
            <h4 className="mb-1 mt-3 font-medium">ボディ</h4>
            <pre className="overflow-x-auto rounded bg-subtle p-2 hint-xs">
              {response.content.text}
            </pre>
          </div>
        )}
      </div>
      <TimingBreakdown entry={entry} />
    </div>
  );
```

> `entry` はガード節（`if (!request || ... ) return ...`）を通過済みなので `HarEntry` として
> 扱える。型エラーが出る場合は `entry as HarEntry` ではなく、ガード後に `const e = entry;` の
> ような絞り込みを使う。実際にはガード節で `entry` は non-undefined に絞り込まれているはず。

- [ ] **Step 4: 型チェック・テスト**

Run: `npx astro check`
Expected: エラーなし。

Run: `npm run test`
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/tools/HarEntryDetail.tsx
git commit -m "feat: 詳細パネルにタイミング内訳セクションを追加 (#674)"
```

---

## Task 8: ブラウザ目視確認（PC / スマホ）

**Files:** なし（確認のみ）

- [ ] **Step 1: dev サーバ起動と確認用 HAR の用意**

Run: `npm run dev`（バックグラウンド）。`http://localhost:4321/tools/har-viewer` を開く。

`timings` を含むサンプル HAR を 1 つ用意する（2〜3 エントリ、起点をずらし、各フェーズに
正の値を持たせる）。手元に無ければ次の最小 HAR を `/tmp/claude/sample.har` に作って読み込む:

```json
{ "log": { "version": "1.2", "entries": [
  { "startedDateTime": "2026-06-15T00:00:00.000Z", "time": 100,
    "timings": { "blocked": 5, "dns": 10, "connect": 20, "ssl": 8, "send": 2, "wait": 55, "receive": 8 },
    "request": { "method": "GET", "url": "https://example.com/a", "headers": [], "queryString": [], "cookies": [] },
    "response": { "status": 200, "headers": [], "cookies": [], "content": { "size": 0 } } },
  { "startedDateTime": "2026-06-15T00:00:00.060Z", "time": 80,
    "timings": { "blocked": 2, "dns": -1, "connect": -1, "send": 1, "wait": 70, "receive": 7 },
    "request": { "method": "POST", "url": "https://example.com/b", "headers": [], "queryString": [], "cookies": [] },
    "response": { "status": 201, "headers": [], "cookies": [], "content": { "size": 0 } } }
] } }
```

- [ ] **Step 2: PC（1280x800）で確認**

Playwright で `caches.delete` + `localStorage.clear` + `sessionStorage.clear` → navigate →
resize 1280x800 → screenshot。確認:
- タイミング列に各行の横棒が表示され、2 行目が 1 行目より右にオフセットしている
- フェーズが色分けされ、バーにホバー（または title）で内訳が出る
- 行クリックで詳細パネルにタイミング内訳テーブルとミニバーが出る

- [ ] **Step 3: スマホ（390x844）で確認**

resize 390x844 → screenshot。確認:
- タイミング列が消えている（横スクロールが過度に発生しない）
- 行クリックで詳細パネルのタイミング内訳は表示される
- ボタン・レイアウトの破綻が無い

- [ ] **Step 4: 問題があれば修正、無ければ次へ（コミット不要）**

---

## Task 9: E2E と最終検証

**Files:**
- 必要なら `tests/e2e/` に har-viewer のタイミング確認を追加（既存 har-viewer E2E があれば拡張）

- [ ] **Step 1: 既存 har-viewer E2E の有無を確認**

Run: `ls tests/e2e | grep -i har || echo "no har e2e"`
既存があれば、タイミング列が PC で表示され詳細にミニバーが出ることを 1 ケース追加する
（`getByRole('columnheader', { name: 'タイミング' })` 等、ロケータは getByRole/getByText を使う）。
無ければ本タスクでの E2E 追加は任意（VRT がページ全体を担保するため）。

- [ ] **Step 2: VRT 登録確認**

`/tools/har-viewer` が既に `tests/e2e/visual-regression-pages.ts` の `PAGES` にあることを確認:

Run: `grep "har-viewer" tests/e2e/visual-regression-pages.ts`
Expected: `/tools/har-viewer` がヒット（既存。無ければ追加）。

- [ ] **Step 3: フル検証**

Run: `npm run test`
Expected: 全 PASS（meta テスト含む）。

Run: `node_modules/.bin/astro check`
Expected: エラーなし。

Run: `npm run lint`
Expected: エラーなし。

Run: `npm run test:e2e`
Expected: PASS（VRT は baseline 未更新なら har-viewer ページで pixel diff により FAIL し
うる。これは新列追加による想定内の変化。**baseline 再生成は CI Linux runner の手動
`workflow_dispatch` が必要**で web セッションからは起動不可。E2E の他ケースが通ることを
確認し、VRT の har-viewer 差分は「baseline 再生成待ち」として扱う）。

- [ ] **Step 4: Commit（E2E を追加した場合のみ）**

```bash
git add tests/e2e/
git commit -m "test: HAR ウォーターフォールの E2E を追加 (#674)"
```

---

## Task 10: ドキュメント更新

**Files:**
- Modify: `docs/tools.md`
- Modify: `docs/decisions.md`
- Modify: `SPEC.md`

- [ ] **Step 1: `docs/tools.md` に解説を追記**

HAR ビューアの該当節に、`timings`（blocked/dns/connect/ssl/send/wait/receive）を全体
タイムライン基準で横棒可視化する旨、ssl は connect の部分時間として控除する旨、HAR 1.2 準拠、
`timings` を持たないエントリはバー非表示で degrade する制限を追記する。

- [ ] **Step 2: `docs/decisions.md` を更新**

`[116]` に追補するか新規番号で、ウォーターフォール実装方針を記録:
- 全体タイムライン基準の相対配置
- ssl/connect 二重計上の控除
- 配色は `@theme` フェーズトークン + `@layer components` クラス（primitive 直書き回避）
- inline style 禁止に伴い `useDynamicStyleSheet` で幅・オフセットを注入
- スマホは列非表示・詳細パネルで内訳を担保

- [ ] **Step 3: `SPEC.md` の該当章を更新**

HAR ビューアの機能記述・進捗チェックリストにウォーターフォール対応を反映する。

- [ ] **Step 4: 整形チェックとコミット**

Run: `npm run format`
Run: `git add docs/tools.md docs/decisions.md SPEC.md`

```bash
git commit -m "docs: HAR ウォーターフォール対応をドキュメントへ反映 (#674)"
```

---

## 完了条件（全タスク後の最終チェックリスト）

- [ ] `npm run test` 全 PASS（waterfall 陽性対照・timings 非破壊・コンポーネント描画含む）
- [ ] `node_modules/.bin/astro check` エラーなし
- [ ] `npm run lint` エラーなし
- [ ] `npm run build` 成功
- [ ] PC / スマホ目視確認済み（スマホで列非表示・詳細で内訳）
- [ ] ドキュメント更新済み（tools.md / decisions.md / SPEC.md）
- [ ] push → PR 作成（base develop）→ VRT baseline 再生成の手動トリガーをユーザーに依頼
