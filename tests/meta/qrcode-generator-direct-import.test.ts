import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * meta test: 'qrcode-generator' 直接 import 禁止ガード (issue #216)
 *
 * 'qrcode-generator' を直接 import すると stringToBytes の UTF-8 パッチが
 * 適用されず、日本語・絵文字を含む QR コード生成が失敗する副作用がある。
 * パッチ適用と factory 呼び出しは createQrSvg (@/utils/qrcode) に閉じ込め、
 * 他ファイルからは 'qrcode-generator' を直接 import しないことを強制する。
 *
 * 許可リスト:
 *   - `src/utils/qrcode.ts`: createQrSvg を提供するラッパーとして唯一の直接 import を許可。
 *
 * 対象: `src/` 配下の `.ts` / `.tsx` / `.astro` ファイル（再帰）
 */

const REPO_ROOT = resolve(__dirname, '..', '..');

/**
 * 許可リスト。リポジトリ相対パス（`/` 区切り）で指定。
 * OS 依存しないよう path 区切りを `/` に正規化して比較する。
 */
const ALLOWLIST: ReadonlySet<string> = new Set([
  // createQrSvg のラッパーとして唯一の直接 import を許可。
  'src/utils/qrcode.ts',
]);

/**
 * シングルクォート・ダブルクォート両方の 'qrcode-generator' 直接 import を検出する正規表現。
 * `from 'qrcode-generator'` および `from "qrcode-generator"` にマッチする。
 */
const DIRECT_IMPORT_RE = /from\s+['"]qrcode-generator['"]/;

/**
 * ファイル一覧を受け取り、許可リスト外で 'qrcode-generator' を直接 import している
 * 違反箇所を返す純粋関数。
 * 陰性対照（実 src スキャン）と陽性対照（fixture 注入）の両方で共有する。
 *
 * @param files - パスとコンテンツのペア配列（path はリポジトリ相対パス、`/` 区切り）
 * @param allowlist - スキップするリポジトリ相対パスの Set
 * @returns 違反箇所 { path, line } の配列
 */
export function findDirectQrcodeGeneratorImports(
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
      if (DIRECT_IMPORT_RE.test(lines[i])) {
        violations.push({ path: normalizedPath, line: i + 1 });
      }
    }
  }
  return violations;
}

/** `src/` 配下の `.ts` / `.tsx` / `.astro` ファイルを再帰収集する */
function collectSrcFiles(root: string, results: string[] = []): string[] {
  const skipDirs = new Set(['node_modules', '.git', 'dist', '.astro', 'coverage', '__tests__']);
  // __tests__ はユニットテスト配下のため除外（テストファイルに import があっても問題ない）
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
      collectSrcFiles(fullPath, results);
    } else if (
      isFile &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.astro'))
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

// --- 陰性対照: 実 src スキャンで違反ゼロを保証 ---

describe("src 配下での 'qrcode-generator' 直接 import 禁止", () => {
  it("src/**/*.{ts,tsx,astro} に許可リスト外の 'qrcode-generator' 直接 import が存在しない", () => {
    const srcRoot = join(REPO_ROOT, 'src');
    const absolutePaths = collectSrcFiles(srcRoot);
    const files = absolutePaths.map((absPath) => ({
      path: relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
      content: readFileSync(absPath, 'utf-8'),
    }));

    const violations = findDirectQrcodeGeneratorImports(files, ALLOWLIST);
    expect(
      violations,
      violations.length > 0
        ? `'qrcode-generator' 直接 import が検出されました:\n${violations.map((v) => `  ${v.path}:${v.line}`).join('\n')}\n→ createQrSvg (@/utils/qrcode) を使うこと`
        : ''
    ).toEqual([]);
  });
});

// --- 陽性対照: 検知機構が空回りしていないことを保証 (test-gates skill 準拠) ---

describe("[陽性対照] 'qrcode-generator' 直接 import 検知機構", () => {
  it("許可リスト外のファイルに import qrcode from 'qrcode-generator' があると検出される", () => {
    const files = [
      {
        path: 'src/components/tools/FakeTool.tsx',
        content: "import qrcode from 'qrcode-generator';",
      },
    ];
    const violations = findDirectQrcodeGeneratorImports(files, ALLOWLIST);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].path).toBe('src/components/tools/FakeTool.tsx');
  });

  it('許可リストに登録されたパス（src/utils/qrcode.ts）は直接 import があっても検出されない（allowlist が効く）', () => {
    const files = [
      {
        path: 'src/utils/qrcode.ts',
        content: "import qrcode from 'qrcode-generator';",
      },
    ];
    const violations = findDirectQrcodeGeneratorImports(files, ALLOWLIST);
    expect(violations).toEqual([]);
  });

  it('違反ファイルと clean ファイルの混在で違反ファイルのみ列挙する（過検知なし）', () => {
    const files = [
      {
        path: 'src/utils/qr-ticket.ts',
        content: "import qrcode from 'qrcode-generator';\nimport something from '@/utils/other';",
      },
      {
        path: 'src/components/tools/CleanTool.tsx',
        content: "import { createQrSvg } from '@/utils/qrcode';",
      },
      {
        path: 'src/pages/tools/clean-page.astro',
        content: '// qrcode-generator には触れていないページ',
      },
    ];
    const violations = findDirectQrcodeGeneratorImports(files, ALLOWLIST);
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe('src/utils/qr-ticket.ts');
  });

  it("'qrcode-generator' を import しない clean ファイルのみでは何も検出しない（過検知なし）", () => {
    const files = [
      {
        path: 'src/components/tools/ToolA.tsx',
        content: "import { createQrSvg } from '@/utils/qrcode';",
      },
      {
        path: 'src/pages/tools/tool-b.astro',
        content: '// QR コードとは無関係なページ',
      },
    ];
    const violations = findDirectQrcodeGeneratorImports(files, ALLOWLIST);
    expect(violations).toEqual([]);
  });

  it('ダブルクォートの from "qrcode-generator" も検出される', () => {
    const files = [
      {
        path: 'src/utils/other-tool.ts',
        content: 'import qrcode from "qrcode-generator";',
      },
    ];
    const violations = findDirectQrcodeGeneratorImports(files, ALLOWLIST);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].path).toBe('src/utils/other-tool.ts');
  });
});
