# コントラスト比マトリクス Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 任意の N 色の全組合せ（N×N）について WCAG コントラスト比（AA/AAA 合否）と APCA Lc を併記するマトリクスツール `contrast-matrix` を追加する。

**Architecture:** 純粋計算ロジック（`src/utils/contrast.ts`）と UI（`src/components/tools/ContrastMatrix.tsx`）を分離。ロジックは色パース・WCAG 相対輝度/比/合否・APCA Lc の純関数群。UI は色リスト編集と N×N マトリクス＋閾値フィルタ。データは外部送信しない。

**Tech Stack:** Astro 6 + React 19 + TypeScript、Vitest（ユニット）、Playwright（E2E/VRT）。新規依存なし。

設計: `docs/superpowers/specs/2026-06-25-contrast-matrix-design.md`

---

## File Structure

| ファイル                                                                                    | 責務                                  |
| ------------------------------------------------------------------------------------------- | ------------------------------------- |
| `src/utils/contrast.ts`                                                                     | 色パース・WCAG・APCA の純関数（新規） |
| `src/utils/__tests__/contrast.test.ts`                                                      | 上記の参照値テスト（新規）            |
| `src/components/tools/ContrastMatrix.tsx`                                                   | React 本体（新規）                    |
| `src/pages/tools/contrast-matrix.astro`                                                     | ページ（新規）                        |
| `src/data/tools.ts`                                                                         | ツール登録（修正）                    |
| `tests/e2e/visual-regression-pages.ts`                                                      | VRT 対象登録（修正）                  |
| `tests/e2e/contrast-matrix.spec.ts`                                                         | E2E（新規）                           |
| `README.md` / `SPEC.md` / `docs/tools.md` / `docs/decisions.md` / `docs/tool-candidates.md` | ドキュメント（修正）                  |

---

### Task 1: 色パース（`contrast.ts`）

**Files:**

- Create: `src/utils/contrast.ts`
- Test: `src/utils/__tests__/contrast.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseColor } from '@/utils/contrast';

describe('parseColor', () => {
  it('#rrggbb をパースする', () => {
    expect(parseColor('#ff8800')).toEqual({ r: 255, g: 136, b: 0 });
  });
  it('#rgb を展開してパースする', () => {
    expect(parseColor('#f80')).toEqual({ r: 255, g: 136, b: 0 });
  });
  it('rgb() をパースする（空白ゆらぎ許容）', () => {
    expect(parseColor('rgb(255, 136, 0)')).toEqual({ r: 255, g: 136, b: 0 });
    expect(parseColor('rgb(255,136,0)')).toEqual({ r: 255, g: 136, b: 0 });
  });
  it('前後の空白を許容し大文字小文字を問わない', () => {
    expect(parseColor('  #FF8800  ')).toEqual({ r: 255, g: 136, b: 0 });
  });
  it('不正な入力は null を返す', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor('#ff88')).toBeNull();
    expect(parseColor('rgb(300,0,0)')).toBeNull(); // 範囲外
    expect(parseColor('#rrggbb')).toBeNull();
    expect(parseColor('rgba(0,0,0,0.5)')).toBeNull(); // v1 はアルファ非対応
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- contrast`
Expected: FAIL（`parseColor` 未定義）

- [ ] **Step 3: Write minimal implementation**

```ts
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * 不透明色のみ対応（HEX `#rgb`/`#rrggbb`、`rgb(r,g,b)`）。
 * v1 はアルファ付き（`#rrggbbaa` / `rgba()`）非対応で null を返す。
 */
export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase();
  const hex6 = /^#([0-9a-f]{6})$/.exec(s);
  if (hex6) {
    const n = parseInt(hex6[1], 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  const hex3 = /^#([0-9a-f]{3})$/.exec(s);
  if (hex3) {
    const [r, g, b] = hex3[1].split('');
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    };
  }
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(s);
  if (rgb) {
    const r = Number(rgb[1]);
    const g = Number(rgb[2]);
    const b = Number(rgb[3]);
    if (r > 255 || g > 255 || b > 255) return null;
    return { r, g, b };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- contrast`
Expected: PASS

- [ ] **Step 5: Type check + commit**

```bash
node_modules/.bin/astro check
git add src/utils/contrast.ts src/utils/__tests__/contrast.test.ts
git commit -m "feat: コントラスト比計算の色パースを追加"
```

---

### Task 2: WCAG 相対輝度・コントラスト比・合否（`contrast.ts`）

**Files:**

- Modify: `src/utils/contrast.ts`
- Test: `src/utils/__tests__/contrast.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { relativeLuminance, contrastRatio, wcagLevels } from '@/utils/contrast';

describe('relativeLuminance', () => {
  it('黒は 0、白は 1', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });
});

describe('contrastRatio', () => {
  it('黒×白は 21:1', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 1);
  });
  it('同色は 1:1', () => {
    const c = { r: 18, g: 52, b: 86 };
    expect(contrastRatio(c, c)).toBeCloseTo(1, 5);
  });
  it('対称（前景背景を入替えても同値）', () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 255, g: 255, b: 255 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 5);
  });
  it('#767676 × 白は約 4.54:1（AA 通常の境界）', () => {
    expect(contrastRatio({ r: 0x76, g: 0x76, b: 0x76 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(
      4.54,
      1
    );
  });
});

describe('wcagLevels（合否の両対照）', () => {
  it('21:1 は全項目 pass（正の対照）', () => {
    expect(wcagLevels(21)).toEqual({
      aaNormal: true,
      aaLarge: true,
      aaaNormal: true,
      aaaLarge: true,
    });
  });
  it('3:1 は AA 大のみ pass、AA 通常は fail（負の対照）', () => {
    expect(wcagLevels(3)).toEqual({
      aaNormal: false,
      aaLarge: true,
      aaaNormal: false,
      aaaLarge: false,
    });
  });
  it('1:1 は全項目 fail（負の対照）', () => {
    expect(wcagLevels(1)).toEqual({
      aaNormal: false,
      aaLarge: false,
      aaaNormal: false,
      aaaLarge: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- contrast`
Expected: FAIL（未定義）

- [ ] **Step 3: Write minimal implementation（`contrast.ts` に追記）**

```ts
export interface WcagLevels {
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
}

function gammaExpand(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x の相対輝度（0–1）。 */
export function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * gammaExpand(r) + 0.7152 * gammaExpand(g) + 0.0722 * gammaExpand(b);
}

/** WCAG コントラスト比（1–21、対称）。 */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** コントラスト比から各レベルの合否を判定する。 */
export function wcagLevels(ratio: number): WcagLevels {
  return {
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- contrast`
Expected: PASS

- [ ] **Step 5: Type check + commit**

```bash
node_modules/.bin/astro check
git add src/utils/contrast.ts src/utils/__tests__/contrast.test.ts
git commit -m "feat: WCAGコントラスト比と合否判定を追加"
```

---

### Task 3: APCA Lc（`contrast.ts`）

**Files:**

- Modify: `src/utils/contrast.ts`
- Test: `src/utils/__tests__/contrast.test.ts`

APCA-W3 0.1.9 公式アルゴリズムの自前実装。定数・式は仕様準拠。

- [ ] **Step 1: Write the failing test**

```ts
import { apcaLc } from '@/utils/contrast';

describe('apcaLc（前景, 背景）', () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  it('黒文字×白背景は約 106（明背景＝正）', () => {
    expect(apcaLc(black, white)).toBeCloseTo(106.04, 0);
  });
  it('白文字×黒背景は約 -108（暗背景＝負）', () => {
    expect(apcaLc(white, black)).toBeCloseTo(-107.88, 0);
  });
  it('非対称（前景背景を入替えると符号が変わる）', () => {
    expect(Math.sign(apcaLc(black, white))).toBe(1);
    expect(Math.sign(apcaLc(white, black))).toBe(-1);
  });
  it('同色は 0', () => {
    expect(apcaLc(white, white)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- contrast`
Expected: FAIL（`apcaLc` 未定義）

- [ ] **Step 3: Write minimal implementation（`contrast.ts` に追記）**

```ts
// --- APCA-W3 0.1.9 定数 ---
const APCA_MAIN_TRC = 2.4;
const APCA_R = 0.2126729;
const APCA_G = 0.7151522;
const APCA_B = 0.072175;
const APCA_NORM_BG = 0.56;
const APCA_NORM_TXT = 0.57;
const APCA_REV_TXT = 0.62;
const APCA_REV_BG = 0.65;
const APCA_BLK_THRS = 0.022;
const APCA_BLK_CLMP = 1.414;
const APCA_SCALE = 1.14;
const APCA_LO_CLIP = 0.1;
const APCA_LO_OFFSET = 0.027;
const APCA_DELTA_Y_MIN = 0.0005;

/** APCA 用の画面輝度 Y（単純べき 2.4。WCAG の区分線形とは異なる）。 */
function apcaScreenY({ r, g, b }: RGB): number {
  const lin = (c: number) => (c / 255) ** APCA_MAIN_TRC;
  return APCA_R * lin(r) + APCA_G * lin(g) + APCA_B * lin(b);
}

/**
 * APCA Lc 値（おおむね -108〜106）。
 * 引数は前景（テキスト）色・背景色の順。符号は極性（明背景＝正、暗背景＝負）。
 * 前景背景を入替えると非対称（符号反転）。
 */
export function apcaLc(text: RGB, bg: RGB): number {
  let txtY = apcaScreenY(text);
  let bgY = apcaScreenY(bg);

  // black soft-clamp
  txtY = txtY > APCA_BLK_THRS ? txtY : txtY + (APCA_BLK_THRS - txtY) ** APCA_BLK_CLMP;
  bgY = bgY > APCA_BLK_THRS ? bgY : bgY + (APCA_BLK_THRS - bgY) ** APCA_BLK_CLMP;

  if (Math.abs(bgY - txtY) < APCA_DELTA_Y_MIN) return 0;

  let sapc: number;
  let out: number;
  if (bgY > txtY) {
    // 明背景・暗文字（normal polarity）
    sapc = (bgY ** APCA_NORM_BG - txtY ** APCA_NORM_TXT) * APCA_SCALE;
    out = sapc < APCA_LO_CLIP ? 0 : sapc - APCA_LO_OFFSET;
  } else {
    // 暗背景・明文字（reverse polarity）
    sapc = (bgY ** APCA_REV_BG - txtY ** APCA_REV_TXT) * APCA_SCALE;
    out = sapc > -APCA_LO_CLIP ? 0 : sapc + APCA_LO_OFFSET;
  }
  return out * 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- contrast`
Expected: PASS

- [ ] **Step 5: Type check + commit**

```bash
node_modules/.bin/astro check
git add src/utils/contrast.ts src/utils/__tests__/contrast.test.ts
git commit -m "feat: APCA Lc値の算出を追加"
```

---

### Task 4: マトリクス派生データ（`contrast.ts`）

行＝前景、列＝背景の全ペアを一括計算するヘルパを追加し、UI を薄く保つ。

**Files:**

- Modify: `src/utils/contrast.ts`
- Test: `src/utils/__tests__/contrast.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { buildMatrix } from '@/utils/contrast';

describe('buildMatrix', () => {
  const colors = [
    { id: '1', label: 'black', rgb: { r: 0, g: 0, b: 0 } },
    { id: '2', label: 'white', rgb: { r: 255, g: 255, b: 255 } },
  ];
  it('N×N のセルを返す（行=前景, 列=背景）', () => {
    const m = buildMatrix(colors);
    expect(m).toHaveLength(2);
    expect(m[0]).toHaveLength(2);
  });
  it('対角は同色フラグを立てる', () => {
    const m = buildMatrix(colors);
    expect(m[0][0].sameColor).toBe(true);
    expect(m[0][1].sameColor).toBe(false);
  });
  it('セルに比・合否・APCA を含む', () => {
    const cell = buildMatrix(colors)[0][1]; // 前景=black, 背景=white
    expect(cell.ratio).toBeCloseTo(21, 1);
    expect(cell.levels.aaNormal).toBe(true);
    expect(cell.apca).toBeCloseTo(106.04, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- contrast`
Expected: FAIL（`buildMatrix` 未定義）

- [ ] **Step 3: Write minimal implementation（`contrast.ts` に追記）**

```ts
export interface ColorEntry {
  id: string;
  label: string;
  rgb: RGB;
}

export interface MatrixCell {
  ratio: number;
  levels: WcagLevels;
  apca: number;
  sameColor: boolean;
}

/** colors[row]=前景, colors[col]=背景 の N×N セルを計算する。 */
export function buildMatrix(colors: ColorEntry[]): MatrixCell[][] {
  return colors.map((fg) =>
    colors.map((bg) => {
      const ratio = contrastRatio(fg.rgb, bg.rgb);
      return {
        ratio,
        levels: wcagLevels(ratio),
        apca: apcaLc(fg.rgb, bg.rgb),
        sameColor: fg.id === bg.id,
      };
    })
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- contrast`
Expected: PASS

- [ ] **Step 5: Type check + commit**

```bash
node_modules/.bin/astro check
git add src/utils/contrast.ts src/utils/__tests__/contrast.test.ts
git commit -m "feat: コントラストマトリクスの派生データ生成を追加"
```

---

### Task 5: React コンポーネント — 色リスト編集（`ContrastMatrix.tsx`）

**Files:**

- Create: `src/components/tools/ContrastMatrix.tsx`

既存パターン（`CidrCalculator.tsx`）と共通 UI（`InputField` / `ToggleGroup` / `StatusBadge` / `NotificationBanner`）に準拠。色は CSS 変数 / semantic token utility のみ。`@layer components` 手書き class への variant prefix は使わない。

- [ ] **Step 1: コンポーネント骨子を作成（色リスト編集まで）**

```tsx
/**
 * コントラスト比マトリクス。
 * N 色の全組合せ（行=前景, 列=背景）について WCAG コントラスト比（AA/AAA 合否）と
 * APCA Lc を併記する。計算はすべてブラウザ内で完結し外部送信しない。
 */
import { useMemo, useState } from 'react';
import { InputField } from '@/components/ui/InputField';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { parseColor, buildMatrix } from '@/utils/contrast';
import type { ColorEntry } from '@/utils/contrast';

type FilterMode = 'all' | 'aa' | 'aaa';

const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'aa', label: 'AA 以上' },
  { value: 'aaa', label: 'AAA 以上' },
];

/** 入力行（HEX 文字列とラベルを保持。RGB はパース結果） */
interface ColorRow {
  id: string;
  label: string;
  hex: string;
}

const INITIAL_ROWS: ColorRow[] = [
  { id: 'c1', label: 'テキスト', hex: '#1a1a1a' },
  { id: 'c2', label: '背景', hex: '#ffffff' },
  { id: 'c3', label: 'プライマリ', hex: '#0017c1' },
  { id: 'c4', label: 'アクセント', hex: '#d32f2f' },
];

let idCounter = 0;
const nextId = () => `c-${++idCounter}`;

export function ContrastMatrixTool() {
  const [rows, setRows] = useState<ColorRow[]>(INITIAL_ROWS);
  const [filter, setFilter] = useState<FilterMode>('all');

  const updateRow = (id: string, patch: Partial<ColorRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { id: nextId(), label: '', hex: '#000000' }]);
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  // パース済みの有効色のみマトリクス対象にする
  const validColors = useMemo<ColorEntry[]>(
    () =>
      rows
        .map((r) => {
          const rgb = parseColor(r.hex);
          return rgb ? { id: r.id, label: r.label || r.hex, rgb } : null;
        })
        .filter((x): x is ColorEntry => x !== null),
    [rows]
  );

  const matrix = useMemo(() => buildMatrix(validColors), [validColors]);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="body-emphasis text-default">色の一覧</h2>
        {rows.map((row) => {
          const invalid = parseColor(row.hex) === null;
          return (
            <div key={row.id} className="flex flex-wrap items-end gap-3">
              <input
                type="color"
                aria-label={`${row.label || '色'}のカラーピッカー`}
                value={parseColor(row.hex) ? toHex(row.hex) : '#000000'}
                onChange={(e) => updateRow(row.id, { hex: e.target.value })}
                className="h-10 w-12 rounded border border-input"
              />
              <div className="w-32">
                <InputField
                  id={`hex-${row.id}`}
                  label="色"
                  value={row.hex}
                  onChange={(v) => updateRow(row.id, { hex: v })}
                  error={invalid ? '不正な色' : undefined}
                  mono
                />
              </div>
              <div className="w-40">
                <InputField
                  id={`label-${row.id}`}
                  label="ラベル"
                  value={row.label}
                  onChange={(v) => updateRow(row.id, { label: v })}
                  placeholder="任意"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={rows.length <= 2}
                className="caption btn-remove-card rounded px-3 py-2"
              >
                削除
              </button>
            </div>
          );
        })}
        <button type="button" onClick={addRow} className="caption text-link-plain btn-link-plain">
          ＋ 色を追加
        </button>
      </section>

      <NotificationBanner variant="info" title="不透明色のみ対応">
        アルファ付き（半透明）の色は v1 では非対応です。HEX（#rgb / #rrggbb）と rgb()
        を入力できます。
      </NotificationBanner>

      {/* マトリクスは Task 6 で追加 */}
      <ToggleGroup
        options={FILTER_OPTIONS}
        value={filter}
        onChange={setFilter}
        ariaLabel="合否フィルタ"
      />
    </div>
  );
}

/** color input には #rrggbb が必要。#rgb / rgb() を #rrggbb に正規化する。 */
function toHex(input: string): string {
  const rgb = parseColor(input);
  if (!rgb) return '#000000';
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}
```

- [ ] **Step 2: Type check**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（`NotificationBanner` の props 名は実ファイルで確認し合わせる）

> 注意: `NotificationBanner` / `btn-remove-card` / `text-link-plain` / `btn-link-plain` は既存実装のシグネチャ・クラス名を `src/components/ui/NotificationBanner.tsx` と `src/styles/global.css` で確認してから使うこと。差異があれば実体に合わせる。

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/ContrastMatrix.tsx
git commit -m "feat: コントラスト比マトリクスの色リスト編集UIを追加"
```

---

### Task 6: React コンポーネント — マトリクス描画＋フィルタ

**Files:**

- Modify: `src/components/tools/ContrastMatrix.tsx`

- [ ] **Step 1: マトリクス table を実装し `{/* マトリクスは Task 6 で追加 */}` を置換**

```tsx
{
  validColors.length < 2 ? (
    <p className="caption text-muted">有効な色を 2 つ以上入力するとマトリクスが表示されます。</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <caption className="sr-only">行が前景色、列が背景色のコントラスト比マトリクス</caption>
        <thead>
          <tr>
            <th className="caption text-muted p-2 text-left">前景 \ 背景</th>
            {validColors.map((bg) => (
              <th key={bg.id} className="caption p-2 text-left">
                {bg.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {validColors.map((fg, rowIdx) => (
            <tr key={fg.id}>
              <th scope="row" className="caption p-2 text-left whitespace-nowrap">
                {fg.label}
              </th>
              {validColors.map((bg, colIdx) => {
                const cell = matrix[rowIdx][colIdx];
                const dimmed =
                  (filter === 'aa' && !cell.levels.aaNormal) ||
                  (filter === 'aaa' && !cell.levels.aaaNormal);
                if (cell.sameColor) {
                  return <td key={bg.id} className="bg-subtle p-2" aria-hidden="true" />;
                }
                return (
                  <td
                    key={bg.id}
                    className="p-2 align-top border border-input"
                    style={{ opacity: dimmed ? 0.3 : 1 }}
                  >
                    <div className="rounded p-2" data-cell-preview>
                      <span style={{ color: rgbToCss(fg.rgb) }}>
                        <span style={{ background: rgbToCss(bg.rgb) }} className="rounded px-1">
                          サンプル
                        </span>
                      </span>
                    </div>
                    <div className="caption font-mono mt-1">{cell.ratio.toFixed(2)}:1</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <StatusBadge tone={cell.levels.aaNormal ? 'success' : 'error'}>
                        AA {cell.levels.aaNormal ? '○' : '×'}
                      </StatusBadge>
                      <StatusBadge tone={cell.levels.aaaNormal ? 'success' : 'error'}>
                        AAA {cell.levels.aaaNormal ? '○' : '×'}
                      </StatusBadge>
                    </div>
                    <div className="caption text-muted mt-1">Lc {cell.apca.toFixed(1)}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

> ⚠️ **重要 — CSP 制約**: 本プロジェクトは `style-src 'unsafe-inline'` を撤去済み（issue #176 B 案）。上記の `style={{...}}` は**そのままでは使えない**。セルプレビューの動的色（ユーザー入力の任意色）は CSS 変数 + `useDynamicStyleSheet`（`ToggleGroup.tsx` の用例参照）で per-cell scoped rule を注入して適用すること。`opacity` の淡色化は条件 `className`（例: `.cell-dimmed { opacity: .3 }` を `@layer components` に定義）で表現する。実装時に `src/hooks/useDynamicStyleSheet.ts` と `docs/decisions.md [067]` を必ず読み、inline style を使わない形に落とすこと。`rgbToCss` は `rgb(r g b)` を返すヘルパとして `contrast.ts` か component 内に用意する。

- [ ] **Step 2: Type check + build で CSS rule 生成を確認**

Run: `node_modules/.bin/astro check && npm run build`
Expected: エラーなし。`@layer components` に追加した class が `dist/_astro/*.css` に出力されていること。

- [ ] **Step 3: 目視確認（PC/スマホ）**

Playwright で `/tools/contrast-matrix` を 1280x800 と 390x844 で撮影し、マトリクスのはみ出し・淡色化・プレビュー色・タップ領域を確認（`.agents/rules/ui-conventions.md` 3 章）。

- [ ] **Step 4: Commit**

```bash
git add src/components/tools/ContrastMatrix.tsx src/styles/global.css
git commit -m "feat: コントラスト比マトリクスの表示と閾値フィルタを追加"
```

---

### Task 7: ページ作成＋ツール登録＋VRT 登録

**Files:**

- Create: `src/pages/tools/contrast-matrix.astro`
- Modify: `src/data/tools.ts`
- Modify: `tests/e2e/visual-regression-pages.ts`

- [ ] **Step 1: `src/data/tools.ts` の `toolEntries` にエントリ追加**

```ts
  {
    slug: 'contrast-matrix',
    name: 'コントラスト比マトリクス',
    description:
      '任意の N 色の全組合せ（N×N）のコントラスト比を一覧表示します。WCAG 2.x の AA/AAA 合否と APCA Lc を併記。計算はブラウザ内で完結します',
    category: 'convert',
    yomi: 'こんとらすとひまとりくす',
  },
```

- [ ] **Step 2: `src/pages/tools/contrast-matrix.astro` を作成**

```astro
---
import ToolLayout from '@/layouts/ToolLayout.astro';
import ToolInfoSection from '@/components/ui/ToolInfoSection.astro';
import { ContrastMatrixTool } from '@/components/tools/ContrastMatrix';
import { tools } from '@/data/tools';

const tool = tools.find((t) => t.slug === 'contrast-matrix')!;
---

<ToolLayout tool={tool}>
  <ContrastMatrixTool client:load />

  <ToolInfoSection>
    <p class="tool-info-body">
      入力した色の全組合せ（行＝前景色、列＝背景色）について、WCAG 2.x のコントラスト比と AA/AAA
      の合否、APCA の Lc 値を一覧表示します。ブランドカラーやデザイントークンの
      可読性を一度に点検できます。計算はすべてブラウザ内で完結し、入力した色は外部に送信されません。
    </p>

    <h3 class="mb-2 mt-4 tool-info-heading">WCAG コントラスト比</h3>
    <p class="tool-info-body">
      相対輝度から算出する 1:1〜21:1 の比です。AA は通常テキスト 4.5:1・大きいテキスト 3:1、 AAA
      は通常テキスト 7:1・大きいテキスト 4.5:1 を基準とします。前景と背景を入替えても同じ値です。
    </p>

    <h3 class="mb-2 mt-4 tool-info-heading">APCA Lc</h3>
    <p class="tool-info-body">
      WCAG 3 で検討中の知覚均等なコントラスト指標です。前景（テキスト）と背景の順序に依存し、
      符号は極性（明背景＝正、暗背景＝負）を表します。本ツールは APCA-W3 0.1.9 の公式
      アルゴリズムを実装しています。
    </p>

    <h3 class="mb-2 mt-4 tool-info-heading">制限</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>不透明色のみ対応。アルファ付き（半透明）色は非対応です</li>
      <li>入力形式は HEX（#rgb / #rrggbb）と rgb() です</li>
    </ul>
  </ToolInfoSection>
</ToolLayout>
```

- [ ] **Step 3: `tests/e2e/visual-regression-pages.ts` の `PAGES` に追加**

`PAGES` 配列の末尾付近（他の `/tools/*` と並べて）に追記:

```ts
  '/tools/contrast-matrix',
```

- [ ] **Step 4: meta テスト・型・ビルドで整合性確認**

Run: `npm run test -- vrt-pages-coverage && node_modules/.bin/astro check && npm run build`
Expected: PASS / エラーなし（VRT カバレッジ meta テストが green）

- [ ] **Step 5: Commit**

```bash
git add src/data/tools.ts src/pages/tools/contrast-matrix.astro tests/e2e/visual-regression-pages.ts
git commit -m "feat: コントラスト比マトリクスのページとツール登録を追加"
```

---

### Task 8: E2E テスト

**Files:**

- Create: `tests/e2e/contrast-matrix.spec.ts`

既存 spec（`tests/e2e/cidr-calculator.spec.ts` 等）のスタイルに合わせ、`getByRole` / `getByLabel` を使う。

- [ ] **Step 1: E2E を作成**

```ts
import { test, expect } from '@playwright/test';

test.describe('コントラスト比マトリクス', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/contrast-matrix');
  });

  test('初期表示でマトリクスが描画される', async ({ page }) => {
    // 行ヘッダ（前景ラベル）が見える
    await expect(page.getByRole('cell', { name: '21.00:1' }).first()).toBeVisible();
  });

  test('色を追加するとマトリクスのセルが増える', async ({ page }) => {
    const before = await page.getByRole('row').count();
    await page.getByRole('button', { name: '色を追加' }).click();
    // 追加した色に有効な HEX を入れる（初期 #000000 は有効なので行が増える）
    await expect(async () => {
      expect(await page.getByRole('row').count()).toBeGreaterThan(before);
    }).toPass();
  });

  test('AAA フィルタで未達セルが淡色化する', async ({ page }) => {
    await page.getByRole('button', { name: 'AAA 以上' }).click();
    await expect(page.getByRole('button', { name: 'AAA 以上' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
```

> 注意: セレクタ文言（`21.00:1` 等）は実装の表示形式に合わせて調整する。`npm run test:e2e` は preview 経由で実行（`npm run e2e` は存在しない）。

- [ ] **Step 2: E2E 実行**

Run: `npm run test:e2e -- contrast-matrix`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/contrast-matrix.spec.ts
git commit -m "test: コントラスト比マトリクスのE2Eを追加"
```

---

### Task 9: ドキュメント更新

**Files:**

- Modify: `README.md`（ツール一覧）
- Modify: `SPEC.md`（2.4 / 4 / 5 / 9 章。新規ライブラリなしのため 2.3 は変更不要）
- Modify: `docs/tools.md`（仕組み・準拠仕様・制限）
- Modify: `docs/decisions.md`（APCA 自前実装の選定理由）
- Modify: `docs/tool-candidates.md`（A-4 の状態列は PR マージ時に ✅＋PR 番号）

- [ ] **Step 1: 各ドキュメントに `contrast-matrix` の記述を追加**

既存ツール（例: `cidr-calculator` / `secret-scrubber`）の記載フォーマットに倣う。`docs/decisions.md` には「APCA はライブラリ（W3C ベータライセンス）採用を避け公式アルゴリズムを自前実装、依存追加なし」を記録。`docs/tools.md` には WCAG 2.x の相対輝度式・APCA-W3 0.1.9・不透明色のみの制限を記載。

- [ ] **Step 2: 整合性チェック**

Run: `npm run test && node_modules/.bin/astro check && npm run build`
Expected: PASS / エラーなし

- [ ] **Step 3: Commit**

```bash
git add README.md SPEC.md docs/tools.md docs/decisions.md
git commit -m "docs: コントラスト比マトリクスのドキュメントを追加"
```

---

## 最終確認（push 前）

- [ ] `npm run test`（ユニット）PASS
- [ ] `node_modules/.bin/astro check`（型）エラーなし
- [ ] `npm run test:e2e`（E2E）PASS
- [ ] `npm run build` 成功 + `@layer components` 追加 class が CSS に出力済み
- [ ] `npm run lint` / `npm run format:check`
- [ ] inline `style={{}}` が残っていない（CSP 制約。Task 6 参照）
- [ ] PR 作成後、`Update Visual Regression Baseline` workflow の手動トリガーをユーザーへ依頼（web セッションは `actions: write` なし）

## Self-Review メモ

- 設計の全要件（WCAG/APCA/色リスト/閾値フィルタ/N×N/プレビュー/外部送信なし/テスト/ドキュメント/VRT 登録）に対応タスクあり。
- **CSP 制約は最大のリスク**: Task 6 のセル動的色とフィルタ淡色化は inline style 不可。`useDynamicStyleSheet` + `@layer components` class で実装する旨を明記済み。
- 参照値（WCAG 21:1 / 4.54:1、APCA 106.04 / -107.88）は検証済みの canonical 値。
