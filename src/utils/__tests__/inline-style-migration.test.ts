import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * #176 B 案 progressive migration tracker.
 *
 * 移行済みファイルに `style={{}}` (React inline style) が再混入していないことを assert する。
 * - 各 PR で MIGRATED_FILES array に対象ファイルを追加
 * - PR 6 (flip + cleanup) で `MIGRATED_FILES` を `await glob('src/components/**\/*.tsx')` 全件に置換し、
 *   `style={{}}` 完全撲滅を CI で gate する
 *
 * 詳細: docs/superpowers/specs/2026-05-03-issue-176-b-style-src-elimination-design.md
 */

const MIGRATED_FILES: readonly string[] = [
  // PR 1 で順次追加 (Task 4-14 で各ファイル移行 → このリストの全件 pass にする):
  'src/components/ui/ClearButton.tsx',
  'src/components/ui/BareInput.tsx',
  'src/components/ui/DownloadButton.tsx',
  'src/components/ui/ActionButton.tsx',
  'src/components/ui/CopyButton.tsx',
  'src/components/ui/Section.tsx',
  'src/components/ui/ErrorMessage.tsx',
  'src/components/ui/OutputField.tsx',
  'src/components/ui/Select.tsx',
  'src/components/ui/ToggleGroup.tsx',
  'src/components/ui/CountInput.tsx',
];

describe('#176 B 案 progressive migration tracker', () => {
  for (const file of MIGRATED_FILES) {
    it(`${file} に style={{}} が残っていない`, () => {
      const content = readFileSync(path.resolve(process.cwd(), file), 'utf-8');
      expect(content).not.toMatch(/style=\{\{/);
    });
  }
});
