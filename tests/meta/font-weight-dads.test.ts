import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * meta test: DADS にない文字の太さの使用禁止ガード（docs/decisions.md [138]）
 *
 * DADS の文字の太さは Normal（400）と Bold（700）の 2 段だけで、本リポジトリも
 * Noto Sans JP の 400 / 700 しか読み込んでいない（`src/styles/global.css` 冒頭）。
 * 500 / 600 などを指定すると、ブラウザは読み込み済みの近い太さで描くため、
 * 指定と見た目が食い違う。DADS 移行 Phase 3 で `font-semibold` / `font-medium` を
 * `font-bold` / `font-normal` にそろえたので、再混入を CI で検知する。
 *
 * 対象: `src/` 配下の ts / tsx / astro / css。どの拡張子にも次の 3 種を当てる
 *   - Tailwind の太さ utility（`font-semibold` 等）と任意値（`font-[600]`）
 *   - `font-weight` 宣言・属性（CSS の `font-weight: 600`、SVG の `font-weight="600"`）。許可リスト方式
 *   - `font` shorthand の太さ（`font: 600 1rem/1.5 …`）
 */

const REPO_ROOT = resolve(__dirname, '..', '..');

/** DADS の 400 / 700 以外の Tailwind 太さ utility と、太さの任意値 */
const UTILITY_RE = /\bfont-(thin|extralight|light|medium|semibold|extrabold|black|\[)/;
/** 400 / 700 / normal / bold / CSS 全域キーワード / var() 以外の font-weight 宣言・属性（許可リスト方式） */
const DECLARATION_RE =
  /font-weight\s*[:=]\s*["']?(?!(?:400|700|normal|bold|inherit|initial|unset|revert|var\()(?![\w-]))[^\s;"'}]/;
/** font shorthand に 400 / 700 以外の数値の太さ */
const SHORTHAND_RE = /\bfont\s*:\s*(?:italic\s+)?(?!(?:400|700)\b)\d{3}\b/;

/**
 * ファイル一覧から違反行を返す純粋関数。陰性対照（実 src）と陽性対照（fixture）で共有する。
 */
function findNonDadsFontWeights(
  files: { path: string; content: string }[]
): { path: string; line: number }[] {
  const violations: { path: string; line: number }[] = [];
  for (const file of files) {
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (UTILITY_RE.test(line) || DECLARATION_RE.test(line) || SHORTHAND_RE.test(line)) {
        violations.push({ path: file.path, line: i + 1 });
      }
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
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectSrcFiles(fullPath, results);
    } else if (/\.(ts|tsx|astro|css)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// --- 陰性対照: 実 src に違反がない ---

describe('src 配下で DADS にない文字の太さを使わない', () => {
  it('src/**/*.{ts,tsx,astro,css} に 400 / 700 以外の太さ指定がない', () => {
    const files = collectSrcFiles(join(REPO_ROOT, 'src')).map((absPath) => ({
      path: relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
      content: readFileSync(absPath, 'utf-8'),
    }));
    const violations = findNonDadsFontWeights(files);
    expect(
      violations,
      `DADS にない太さの指定が検出されました:\n${violations.map((v) => `  ${v.path}:${v.line}`).join('\n')}\n→ font-normal（400）か font-bold（700）を使ってください`
    ).toEqual([]);
  });
});

// --- 陽性対照: 検知機構が空回りしていない（test-gates skill 準拠） ---

describe('[陽性対照] DADS にない文字の太さの検知', () => {
  it('tsx の font-semibold / font-medium を検出する', () => {
    const violations = findNonDadsFontWeights([
      { path: 'src/components/tools/A.tsx', content: '<p className="caption font-semibold">x</p>' },
      { path: 'src/pages/b.astro', content: '<span class="font-medium">y</span>' },
    ]);
    expect(violations.map((v) => v.path)).toEqual([
      'src/components/tools/A.tsx',
      'src/pages/b.astro',
    ]);
  });

  it('css の font-weight: 600 を検出する', () => {
    const violations = findNonDadsFontWeights([
      { path: 'src/styles/x.css', content: '.a {\n  font-weight: 600;\n}' },
    ]);
    expect(violations).toEqual([{ path: 'src/styles/x.css', line: 2 }]);
  });

  it('astro の <style> 内・ts の class 定数・任意値・SVG 属性・shorthand・空白入りの宣言・列挙外の数値も検出する', () => {
    const violations = findNonDadsFontWeights([
      { path: 'src/pages/a.astro', content: '<style>\n  .x { font-weight: 600; }\n</style>' },
      { path: 'src/components/ui/b.ts', content: "export const C = 'rounded-lg font-semibold';" },
      { path: 'src/components/c.tsx', content: '<p className="font-[600]">x</p>' },
      { path: 'src/components/d.tsx', content: '<text font-weight="600">x</text>' },
      { path: 'src/styles/e.css', content: '.y { font: 600 1rem/1.5 sans-serif; }' },
      { path: 'src/styles/f.css', content: '.z { font-weight : 650; }' },
    ]);
    expect(violations.map((v) => v.path)).toEqual([
      'src/pages/a.astro',
      'src/components/ui/b.ts',
      'src/components/c.tsx',
      'src/components/d.tsx',
      'src/styles/e.css',
      'src/styles/f.css',
    ]);
  });

  it('font-bold / font-normal / font-weight: 700 / font-mono は検出しない（過検知なし）', () => {
    const violations = findNonDadsFontWeights([
      {
        path: 'src/components/tools/C.tsx',
        content: '<p className="font-bold font-normal font-mono">z</p>',
      },
      { path: 'src/styles/y.css', content: '.b { font-weight: 700; }\n.c { font-weight: 400; }' },
      {
        path: 'src/styles/z.css',
        content: '.d { font-weight: bold; font: 700 1rem/1.7 sans-serif; }',
      },
      {
        path: 'src/components/e.tsx',
        content: '<text font-weight="700" fontWeight={400}>x</text>',
      },
    ]);
    expect(violations).toEqual([]);
  });
});
