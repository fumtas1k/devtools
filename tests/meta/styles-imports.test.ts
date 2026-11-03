import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * meta test: src/styles/ の CSS がすべて global.css から import されていること
 *
 * global.css はエントリで、tokens.css / components/ / tools/ 等を @import で束ねる。
 * 作ったのに @import し忘れたファイルは黙って効かず、実在しないファイルを @import すると
 * build が落ちる。どちらも気づきにくいので、import の漏れと宙ぶらりんの import を検出する。
 */

const STYLES_DIR = resolve(__dirname, '..', '..', 'src', 'styles');
const ENTRY = 'global.css';

/** src/styles/ 配下の CSS を、styles/ からの相対パス（posix 区切り）で再帰収集する */
function collectCss(dir: string, results: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectCss(full, results);
    else if (entry.name.endsWith('.css')) {
      results.push(relative(STYLES_DIR, full).split('\\').join('/'));
    }
  }
  return results.sort();
}

/** エントリの実際の `@import './x.css'`（相対パスのもの）を、styles/ からの相対パスに正規化して返す */
function relativeImports(entrySource: string): string[] {
  const imports: string[] = [];
  postcss.parse(entrySource).walkAtRules('import', (rule) => {
    const m = /^(["'])(\.{1,2}\/[^"']+)\1\s*$/.exec(rule.params.trim());
    if (m) imports.push(posix.normalize(m[2]));
  });
  return imports;
}

/** import 漏れ（unimported）と実在しない import（missing）を返す純粋関数。実ファイルと fixture で共有する */
function checkStyleImports(files: Record<string, string>) {
  const imported = new Set(relativeImports(files[ENTRY] ?? ''));
  const existing = Object.keys(files).filter((path) => path !== ENTRY);
  return {
    unimported: existing.filter((path) => !imported.has(path)),
    missing: [...imported].filter((path) => !(path in files)),
  };
}

describe('src/styles/ の import 整合性', () => {
  const files = Object.fromEntries(
    collectCss(STYLES_DIR).map((path) => [path, readFileSync(join(STYLES_DIR, path), 'utf-8')])
  );

  it('global.css 以外の CSS が見つかる（収集が空回りしていない）', () => {
    expect(Object.keys(files)).toEqual(expect.arrayContaining([ENTRY, 'tokens.css']));
    expect(Object.keys(files).length).toBeGreaterThan(5);
  });

  it('すべての CSS が global.css から import され、import 先がすべて実在する', () => {
    const { unimported, missing } = checkStyleImports(files);
    expect(
      unimported,
      `global.css から import されていない CSS があります（黙って効きません）:\n${unimported.map((p) => `  ${p}`).join('\n')}\n→ global.css に @import './${unimported[0]}'; を足してください`
    ).toEqual([]);
    expect(
      missing,
      `global.css が import しているのに存在しない CSS があります:\n${missing.map((p) => `  ${p}`).join('\n')}`
    ).toEqual([]);
  });
});

// --- 陽性対照: 検知機構が空回りしていないことを保証（test-gates skill 準拠） ---

describe('[陽性対照] import 漏れ・存在しない import の検知機構', () => {
  const entry = `@import 'tailwindcss';\n@import './tokens.css';\n@import "./components/button.css";\n`;
  const ok = { [ENTRY]: entry, 'tokens.css': '', 'components/button.css': '' };

  it('陰性対照: 過不足のない構成では何も検出しない', () => {
    expect(checkStyleImports(ok)).toEqual({ unimported: [], missing: [] });
  });

  it('import し忘れた CSS を unimported として検出する', () => {
    const r = checkStyleImports({ ...ok, 'components/form.css': '' });
    expect(r.unimported).toEqual(['components/form.css']);
    expect(r.missing).toEqual([]);
  });

  it('実在しない CSS への import を missing として検出する', () => {
    const r = checkStyleImports({
      ...ok,
      [ENTRY]: `${entry}@import './components/typo.css';\n`,
    });
    expect(r.missing).toEqual(['components/typo.css']);
    expect(r.unimported).toEqual([]);
  });

  it('コメントアウトされた import は import として数えない', () => {
    const r = checkStyleImports({
      ...ok,
      [ENTRY]: `@import './tokens.css';\n/* @import './components/button.css'; */\n`,
    });
    expect(r.unimported).toEqual(['components/button.css']);
  });

  it('./ を含む冗長なパスは正規化して照合する（陰性対照）', () => {
    const r = checkStyleImports({
      ...ok,
      [ENTRY]: `@import './components/../tokens.css';\n@import './components/./button.css';\n`,
    });
    expect(r).toEqual({ unimported: [], missing: [] });
  });

  it('ファイル名が似ているだけの import では import 済みと見なさない', () => {
    const r = checkStyleImports({
      ...ok,
      [ENTRY]: `@import './tokens.css';\n@import './components/button.css.bak';\n`,
    });
    expect(r.unimported).toEqual(['components/button.css']);
    expect(r.missing).toEqual(['components/button.css.bak']);
  });
});
