import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import path from 'node:path';

/**
 * #176 B 案 完了後の `style={{` / CSSOM 直接 mutation 撲滅の永続的回帰防止網。
 *
 * PR 1〜5b で漸進的に MIGRATED_FILES array を拡張してきたが、PR 6 で B 案完了に
 * 伴い array 管理を撤廃し、`src/components/**\/*.tsx` 全件を glob で自動カバー化。
 * これにより新規追加された .tsx も自動で検出網に含まれ、array 更新忘れによる
 * 偽陰性を撲滅する。
 *
 * 例外 (許容):
 * - `ref.current.style.setProperty('--var', value)` — CSSOM API 経由は許容
 *   regex は `\.style\.X = Y` のみ検出、`.style.setProperty(` は検出しない
 *
 * 参照: docs/decisions.md [067] (B 案完了の記録)
 */

// top-level await: vitest は vite-node 経由で ESM として実行されるため利用可能。
const TARGET_FILES: string[] = [];
for await (const f of glob('src/components/**/*.tsx', { cwd: process.cwd() })) {
  TARGET_FILES.push(f);
}
TARGET_FILES.sort();

describe.skipIf(TARGET_FILES.length === 0)('#176 B 案 inline style 完全撲滅 (回帰防止)', () => {
  it(`src/components/**/*.tsx を ${TARGET_FILES.length} 件カバー`, () => {
    expect(TARGET_FILES.length).toBeGreaterThan(0);
  });

  describe.each(TARGET_FILES)('%s', (file) => {
    const content = readFileSync(path.resolve(process.cwd(), file), 'utf-8');

    it('JSX inline style object (style={{) が残っていない', () => {
      expect(content).not.toMatch(/style=\{\{/);
    });

    it('DOM style 属性代入 (element.style.X = ...) が残っていない', () => {
      const matches = content.match(/\.style\.[a-zA-Z]+\s*=(?!=)/g);
      const violations = (matches ?? []).filter((m) => !m.includes('setProperty'));
      expect(violations).toEqual([]);
    });
  });
});

describe('migration detector の陽性対照', () => {
  it('意図的に style={{ を含む文字列が違反として検出される', () => {
    const malicious = `<div style={{color: 'red'}} />`;
    expect(malicious).toMatch(/style=\{\{/);
  });

  it('意図的に style.X = を含む文字列が違反として検出される', () => {
    const malicious = `el.style.background = 'red';`;
    const matches = malicious.match(/\.style\.[a-zA-Z]+\s*=(?!=)/g);
    const violations = (matches ?? []).filter((m) => !m.includes('setProperty'));
    expect(violations.length).toBeGreaterThan(0);
  });

  it('setProperty は許容パターンとしてスルーされる', () => {
    const allowed = `ref.current.style.setProperty('--var', '1');`;
    const matches = allowed.match(/\.style\.[a-zA-Z]+\s*=(?!=)/g);
    const violations = (matches ?? []).filter((m) => !m.includes('setProperty'));
    expect(violations).toEqual([]);
  });
});
