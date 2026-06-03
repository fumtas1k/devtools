import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * meta test: primitive `text-xs` 直書き禁止ガード (PR #571 レビュー指摘 / issue #399 恒久化)
 *
 * PR #571 で `text-xs` 直書き 4 箇所を semantic class `.hint-xs` に統一した。
 * しかし手作業の置換なので、将来 `src/` に再び `text-xs` が書かれても検知されない。
 * 本テストを CI (`npm run test`) で走らせることで、primitive `text-xs` の再混入が
 * merge 前に必ず fail として検知される。
 *
 * 許可リスト:
 *   - `src/components/ui/CopyButton.tsx`: コンパクトボタン内テキストで別用途として
 *     意図的に維持（PR #399 のスコープ外として除外）。
 *
 * 対象: `src/` 配下の tsx / astro ファイル（再帰）
 * 除外: css ファイル（global.css の `.hint-xs` 説明コメント内の "text-xs" を
 *        誤検知しないため）/ `tests/` ディレクトリ
 */

const REPO_ROOT = resolve(__dirname, '..', '..');

/**
 * 許可リスト。リポジトリ相対パス（`/` 区切り）で指定。
 * OS 依存しないよう path 区切りを `/` に正規化して比較する。
 */
const ALLOWLIST: ReadonlySet<string> = new Set([
  // CopyButton のコンパクト表示で別用途。#399 のスコープ外として意図的に維持。
  'src/components/ui/CopyButton.tsx',
]);

/** `\btext-xs\b` (word boundary) で primitive Tailwind utility を検出する正規表現 */
const TEXT_XS_RE = /\btext-xs\b/;

/**
 * ファイル一覧を受け取り、許可リスト外で `text-xs` を使っている違反箇所を返す純粋関数。
 * 陰性対照（実 src スキャン）と陽性対照（fixture 注入）の両方で共有する。
 *
 * @param files - パスとコンテンツのペア配列（path はリポジトリ相対パス、`/` 区切り）
 * @param allowlist - スキップするリポジトリ相対パスの Set
 * @returns 違反箇所 { path, line } の配列
 */
function findPrimitiveTextXs(
  files: { path: string; content: string }[],
  allowlist: ReadonlySet<string>
): { path: string; line: number }[] {
  const violations: { path: string; line: number }[] = [];
  for (const file of files) {
    // path 区切りを `/` に正規化して OS 依存しない比較を行う
    const normalizedPath = file.path.replace(/\\/g, '/');
    if (allowlist.has(normalizedPath)) continue;
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (TEXT_XS_RE.test(lines[i])) {
        violations.push({ path: normalizedPath, line: i + 1 });
      }
    }
  }
  return violations;
}

/** `src/` 配下の `.tsx` / `.astro` ファイルを再帰収集する */
function collectSrcComponents(root: string, results: string[] = []): string[] {
  const skipDirs = new Set(['node_modules', '.git', 'dist', '.astro', 'coverage']);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const fullPath = join(root, entry.name);
    let isDir = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const stat = statSync(fullPath);
        isDir = stat.isDirectory();
        isFile = stat.isFile();
      } catch {
        continue;
      }
    }
    if (isDir) {
      collectSrcComponents(fullPath, results);
    } else if (isFile && (entry.name.endsWith('.tsx') || entry.name.endsWith('.astro'))) {
      results.push(fullPath);
    }
  }
  return results;
}

// --- 陰性対照: 実 src スキャンで違反ゼロを保証 ---

describe('src 配下での primitive text-xs 使用禁止', () => {
  it('src/**/*.{tsx,astro} に許可リスト外の text-xs が存在しない', () => {
    const srcRoot = join(REPO_ROOT, 'src');
    const absolutePaths = collectSrcComponents(srcRoot);
    const files = absolutePaths.map((absPath) => ({
      path: relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
      content: readFileSync(absPath, 'utf-8'),
    }));

    const violations = findPrimitiveTextXs(files, ALLOWLIST);
    expect(
      violations,
      violations.length > 0
        ? `primitive text-xs が検出されました:\n${violations.map((v) => `  ${v.path}:${v.line}`).join('\n')}\n→ .hint-xs など semantic class に置き換えてください`
        : ''
    ).toEqual([]);
  });
});

// --- 陽性対照: 検知機構が空回りしていないことを保証 (test-gates skill 準拠) ---

describe('[陽性対照] primitive text-xs 検知機構', () => {
  it('許可リスト外のファイルに className="text-xs ..." があると検出される', () => {
    const files = [
      {
        path: 'src/components/tools/FakeTool.tsx',
        content: 'return <span className="text-xs font-medium">ヒント</span>;',
      },
    ];
    const violations = findPrimitiveTextXs(files, ALLOWLIST);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].path).toBe('src/components/tools/FakeTool.tsx');
  });

  it('許可リストに登録されたパスは text-xs があっても検出されない (allowlist が効く)', () => {
    const files = [
      {
        path: 'src/components/ui/CopyButton.tsx',
        content: 'className="btn-copy text-xs px-2"',
      },
    ];
    const violations = findPrimitiveTextXs(files, ALLOWLIST);
    expect(violations).toEqual([]);
  });

  it('違反ファイルと clean ファイルの混在で違反ファイルのみ列挙する (過検知なし)', () => {
    const files = [
      {
        path: 'src/components/tools/ViolatingTool.tsx',
        content: '<span className="text-xs">bad</span>',
      },
      {
        path: 'src/components/tools/CleanTool.tsx',
        content: '<span className="hint-xs">good</span>',
      },
      {
        path: 'src/pages/tools/clean-page.astro',
        content: '<p class="body-sm">no violation here</p>',
      },
    ];
    const violations = findPrimitiveTextXs(files, ALLOWLIST);
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe('src/components/tools/ViolatingTool.tsx');
  });

  it('text-xs を含まない clean ファイルのみでは何も検出しない (過検知なし)', () => {
    const files = [
      {
        path: 'src/components/tools/ToolA.tsx',
        content: '<div className="hint-xs">ヒントテキスト</div>',
      },
      {
        path: 'src/pages/tools/tool-b.astro',
        content: '<p class="body-sm text-sm">通常テキスト</p>',
      },
    ];
    const violations = findPrimitiveTextXs(files, ALLOWLIST);
    expect(violations).toEqual([]);
  });
});
