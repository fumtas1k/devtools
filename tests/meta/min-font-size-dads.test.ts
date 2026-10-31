import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * meta test: 14px 未満の文字サイズの使用禁止ガード（docs/decisions.md [145] / issue #814）
 *
 * DADS は本文・UI を 16px 以上、補助的な用途でも 14px を下限とし、14px 未満は使わない。
 * DADS 移行 Phase 5 で `.hint-xs` / `.jwt-pre` / `.uuid-field-*` / `.json-count` / 鉄道図の SVG ラベル /
 * CopyButton を 14px 以上にそろえたので、再混入を CI で検知する。
 *
 * 検知対象（`src/` 配下の ts / tsx / astro / css。テストコードは除く）
 *   - CSS の `font-size: <値>`（rem / em / px。14px 未満）
 *   - SVG 属性・JSX の `fontSize` / `font-size="<数値>"`（14 未満）
 *   - Tailwind の `text-xs`（12px）と任意値 `text-[11px]` / `text-[0.7rem]`
 *
 * 限界: 数値リテラルの直書きだけを見る。`font-size="${FONT_SIZE}"` のように定数・テンプレート経由で組む
 * SVG（`src/utils/ddl-er-diagram.ts` 等）は検知できない（docs/decisions.md [145]）。
 *
 * 許可リスト: セレクタ（CSS）またはパス（その他）単位で、理由を書いて最小限に置く。
 */

const REPO_ROOT = resolve(__dirname, '..', '..');
const MIN_PX = 14;

/** 許可リストの 1 件。CSS は直前の規則のセレクタに含まれる文字列、それ以外はパスで指定する */
interface Allow {
  path: string;
  selector?: string;
  reason: string;
}

const ALLOWLIST: readonly Allow[] = [
  {
    path: 'src/styles/global.css',
    selector: '.toggle-chip__token',
    reason: 'トグル類（ToggleChips）の担当セッションが DADS のチップ規約に合わせて別 PR で扱う',
  },
  {
    path: 'src/styles/global.css',
    selector: '.toggle-chip__count',
    reason: 'トグル類（ToggleChips）の担当セッションが DADS のチップ規約に合わせて別 PR で扱う',
  },
];

/** `1.2rem` / `0.7em` / `11px` / `11` を px に換算する（rem・em は 16px 基準）。換算できなければ null */
function toPx(value: string, unit: string): number | null {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return null;
  if (unit === 'rem' || unit === 'em') return n * 16;
  if (unit === 'px' || unit === '') return n;
  return null;
}

const CSS_FONT_SIZE_RE = /font-size\s*:\s*([\d.]+)(rem|em|px)\b/g;
const ATTR_FONT_SIZE_RE = /(?:font-size=|fontSize[=:]\s*)\{?["']?([\d.]+)(rem|em|px)?["']?/g;
const TEXT_XS_RE = /\btext-xs\b/;
const TEXT_ARBITRARY_RE = /\btext-\[([\d.]+)(rem|em|px)\]/g;

function lineViolates(line: string): boolean {
  for (const re of [CSS_FONT_SIZE_RE, ATTR_FONT_SIZE_RE, TEXT_ARBITRARY_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const px = toPx(m[1], m[2] ?? '');
      if (px !== null && px < MIN_PX) return true;
    }
  }
  return TEXT_XS_RE.test(line);
}

/** CSS で index 行目を含む規則の直近のセレクタ行（`{` で終わる行）を返す */
function enclosingSelector(lines: string[], index: number): string {
  for (let i = index; i >= 0; i--) {
    if (lines[i].trimEnd().endsWith('{')) return lines[i];
  }
  return '';
}

/** ファイル一覧から違反行を返す純粋関数。陰性対照（実 src）と陽性対照（fixture）で共有する */
function findSmallFonts(
  files: { path: string; content: string }[],
  allowlist: readonly Allow[]
): { path: string; line: number }[] {
  const violations: { path: string; line: number }[] = [];
  for (const file of files) {
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!lineViolates(lines[i])) continue;
      const selector = file.path.endsWith('.css') ? enclosingSelector(lines, i) : '';
      const allowed = allowlist.some(
        (a) =>
          a.path === file.path &&
          (a.selector === undefined || (selector !== '' && selector.includes(a.selector)))
      );
      if (!allowed) violations.push({ path: file.path, line: i + 1 });
    }
  }
  return violations;
}

/** `src/` 配下の `.ts` / `.tsx` / `.astro` / `.css` を再帰収集する（テストコードは除く） */
function collectSrcFiles(root: string, results: string[] = []): string[] {
  const skipDirs = new Set(['node_modules', '.git', 'dist', '.astro', 'coverage', '__tests__']);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const fullPath = join(root, entry.name);
    if (statSync(fullPath).isDirectory()) {
      collectSrcFiles(fullPath, results);
    } else if (/\.(ts|tsx|astro|css)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// --- 陰性対照: 実 src に違反がない ---

describe('src 配下で 14px 未満の文字サイズを使わない', () => {
  it('src/**/*.{ts,tsx,astro,css} に許可リスト外の 14px 未満の指定がない', () => {
    const files = collectSrcFiles(join(REPO_ROOT, 'src')).map((absPath) => ({
      path: relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
      content: readFileSync(absPath, 'utf-8'),
    }));
    const violations = findSmallFonts(files, ALLOWLIST);
    expect(
      violations,
      `14px 未満の文字サイズが検出されました:\n${violations.map((v) => `  ${v.path}:${v.line}`).join('\n')}\n→ 0.875rem（14px）以上にしてください`
    ).toEqual([]);
  });

  it('許可リストの各項目に理由があり、実在するセレクタを指している', () => {
    const css = readFileSync(join(REPO_ROOT, 'src/styles/global.css'), 'utf-8');
    for (const a of ALLOWLIST) {
      expect(a.reason.length).toBeGreaterThan(0);
      if (a.selector) expect(css).toContain(a.selector);
    }
  });
});

// --- 陽性対照: 検知機構が空回りしていないことを保証（test-gates skill 準拠） ---

describe('[陽性対照] 14px 未満の文字サイズの検知機構', () => {
  const detect = (path: string, content: string) =>
    findSmallFonts([{ path, content }], ALLOWLIST).length;

  it.each([
    ['src/styles/global.css', '.a {\n  font-size: 0.75rem;\n}'],
    ['src/styles/global.css', '.a {\n  font-size: 0.7rem;\n}'],
    ['src/styles/global.css', '.a {\n  font-size: 13px;\n}'],
    ['src/styles/global.css', '.a {\n  font-size: 0.8125rem;\n}'],
    ['src/components/X.tsx', '<text fontSize="11">a</text>'],
    ['src/components/X.tsx', '<text font-size="11px">a</text>'],
    ['src/components/X.tsx', '<span className="text-xs">a</span>'],
    ['src/components/X.tsx', '<span className="text-[11px]">a</span>'],
    ['src/components/X.tsx', '<span className="text-[0.7rem]">a</span>'],
  ])('%s の「%s」を検出する', (path, content) => {
    expect(detect(path, content)).toBeGreaterThan(0);
  });

  it.each([
    ['src/styles/global.css', '.a {\n  font-size: 0.875rem;\n}'],
    ['src/styles/global.css', '.a {\n  font-size: 14px;\n}'],
    ['src/styles/global.css', '.a {\n  font-size: 1.25rem;\n}'],
    ['src/components/X.tsx', '<span className="text-sm text-[1rem]">a</span>'],
    ['src/components/X.tsx', '<text fontSize="14">a</text>'],
    ['src/components/X.tsx', "const s = { fontSize: '1rem' };"],
  ])('%s の「%s」は検出しない（過検知なし）', (path, content) => {
    expect(detect(path, content)).toBe(0);
  });

  it('許可リストのセレクタ内だけが免除され、他のセレクタの同じ指定は検出する', () => {
    const css =
      '.toggle-chip__token {\n  font-size: 0.8125rem;\n}\n.other {\n  font-size: 0.8125rem;\n}';
    const v = findSmallFonts([{ path: 'src/styles/global.css', content: css }], ALLOWLIST);
    expect(v).toEqual([{ path: 'src/styles/global.css', line: 5 }]);
  });
});
