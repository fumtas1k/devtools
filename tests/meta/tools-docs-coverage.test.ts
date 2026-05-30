import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tools } from '@/data/tools';

/**
 * meta test: tools.md 見出しカバレッジ漏れ検出 (issue #524 再発防止策)
 *
 * `src/data/tools.ts` の全ツール表示名に対して、`docs/tools.md` に
 * 対応する `### <表示名>` 見出しが存在するかを機械的に検証する。
 *
 * 背景: PR #523 で docs/tools.md を新設したが、新規ツール追加時に見出しを
 * 足し忘れても CI が通ってしまう silent drift が起きうる。
 * 本テストを `npm run test` (Vitest) で走らせることで、ツール追加 PR で
 * 見出し追加漏れが merge 前に fail として検知される。
 */

const toolsMdPath = fileURLToPath(new URL('../../docs/tools.md', import.meta.url));

/** docs/tools.md から `###` レベル見出し一覧を抽出する純粋関数 */
function extractH3Headings(content: string): Set<string> {
  return new Set([...content.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim()));
}

/** tools.ts の name に対応する ### 見出しが欠落しているツール名を返す */
function findMissingToolHeadings(toolList: { name: string }[], headings: Set<string>): string[] {
  return toolList.filter((t) => !headings.has(t.name)).map((t) => t.name);
}

/** docs/tools.md の ### 見出しのうち tools.ts のツール名と対応しないものを返す */
function findOrphanHeadings(toolList: { name: string }[], headings: Set<string>): string[] {
  const toolNames = new Set(toolList.map((t) => t.name));
  return [...headings].filter((h) => !toolNames.has(h));
}

/** docs/tools.md 内で複数回出現する ### 見出しを返す（Set 重複除去をすり抜けるバグ検出用）*/
function findDuplicateH3Headings(content: string): string[] {
  const all = [...content.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim());
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const h of all) {
    if (seen.has(h)) dups.add(h);
    else seen.add(h);
  }
  return [...dups];
}

// --- 陰性対照: 現状の正常系で pass ---

describe('tools.md ↔ tools.ts カバレッジ', () => {
  const content = readFileSync(toolsMdPath, 'utf-8');
  const headings = extractH3Headings(content);

  it('src/data/tools.ts の全ツールに対応する ### 見出しが docs/tools.md に存在する', () => {
    const missing = findMissingToolHeadings(tools, headings);
    expect(missing, `docs/tools.md に見出しが不足しているツール: ${missing.join(', ')}`).toEqual(
      []
    );
  });
});

// --- 陽性対照: 検知機構が空回りしていないことを保証 (test-gates skill 準拠) ---

describe('[陽性対照] tools.md カバレッジ検知機構', () => {
  const content = readFileSync(toolsMdPath, 'utf-8');
  const headings = extractH3Headings(content);

  it('存在しないツール名を fixture に注入すると欠落として検出される', () => {
    const fakeTools = [{ name: '存在しないツール（テスト専用）' }];
    const missing = findMissingToolHeadings(fakeTools, headings);
    expect(missing).toEqual(['存在しないツール（テスト専用）']);
  });

  it('登録済み + 未登録の混在 fixture で未登録のみを検出する（過検知なし）', () => {
    const fakeTools = [
      { name: 'URLエンコード/デコード' }, // 既存（見出しあり）
      { name: '存在しないツールA' },
      { name: '存在しないツールB' },
    ];
    const missing = findMissingToolHeadings(fakeTools, headings);
    expect(missing.sort()).toEqual(['存在しないツールA', '存在しないツールB']);
  });

  it('全登録済み fixture では何も検出しない（過検知なし）', () => {
    const fakeTools = [{ name: 'URLエンコード/デコード' }, { name: 'JWTデコーダー' }];
    const missing = findMissingToolHeadings(fakeTools, headings);
    expect(missing).toEqual([]);
  });
});

// --- orphan 検出: tools.md に見出しがあるが tools.ts に対応するツールが存在しない ---

describe('tools.md orphan 見出し検出', () => {
  const content = readFileSync(toolsMdPath, 'utf-8');
  const headings = extractH3Headings(content);

  it('docs/tools.md の ### 見出しはすべて tools.ts のツール名と対応している', () => {
    const orphans = findOrphanHeadings(tools, headings);
    expect(orphans, `tools.ts に対応するツールがない orphan 見出し: ${orphans.join(', ')}`).toEqual(
      []
    );
  });
});

describe('[陽性対照] orphan 検出機構', () => {
  it('tools.ts に存在しないツール名の見出しを偽 doc に注入すると orphan として検出される', () => {
    const fakeContent = '### URLエンコード/デコード\n### 存在しないオーファンツール\n';
    const fakeHeadings = extractH3Headings(fakeContent);
    const fakeTools = [{ name: 'URLエンコード/デコード' }];
    const orphans = findOrphanHeadings(fakeTools, fakeHeadings);
    expect(orphans).toEqual(['存在しないオーファンツール']);
  });

  it('全ツール名が一致する場合は orphan なし（過検知なし）', () => {
    const fakeContent = '### URLエンコード/デコード\n### JWTデコーダー\n';
    const fakeHeadings = extractH3Headings(fakeContent);
    const fakeTools = [{ name: 'URLエンコード/デコード' }, { name: 'JWTデコーダー' }];
    const orphans = findOrphanHeadings(fakeTools, fakeHeadings);
    expect(orphans).toEqual([]);
  });

  it('ツール 0 件 fixture では全 ### 見出しが orphan として検出される', () => {
    const fakeContent = '### URLエンコード/デコード\n### JWTデコーダー\n';
    const fakeHeadings = extractH3Headings(fakeContent);
    const orphans = findOrphanHeadings([], fakeHeadings);
    expect(orphans.length).toBe(2);
  });
});

// --- 重複見出し検出: 同じ ### 見出しが 2 回書かれると Set が dedup して missing/orphan を両方すり抜ける ---

describe('tools.md 重複見出し検出', () => {
  it('docs/tools.md に重複する ### 見出しがない', () => {
    const content = readFileSync(toolsMdPath, 'utf-8');
    const dups = findDuplicateH3Headings(content);
    expect(dups, `docs/tools.md に重複している ### 見出し: ${dups.join(', ')}`).toEqual([]);
  });
});

describe('[陽性対照] 重複見出し検出機構', () => {
  it('同じ見出しを 2 回含む偽 doc では重複として検出される', () => {
    const fakeContent =
      '### URLエンコード/デコード\n### JWTデコーダー\n### URLエンコード/デコード\n';
    const dups = findDuplicateH3Headings(fakeContent);
    expect(dups).toEqual(['URLエンコード/デコード']);
  });

  it('重複なし fixture では何も検出しない（過検知なし）', () => {
    const fakeContent = '### URLエンコード/デコード\n### JWTデコーダー\n';
    const dups = findDuplicateH3Headings(fakeContent);
    expect(dups).toEqual([]);
  });
});
