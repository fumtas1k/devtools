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
 * あわせて、cascade が依存する import 順（tokens → base → components → tools → print → motion）と、
 * Tailwind がインライン展開しない import（url() 形式や ./ ../ で始まらないパス）も検出する。
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

/** `@import` の params から文字列リテラルのパスと、その後ろの修飾子（layer() / supports() / media）を取り出す */
const STRING_IMPORT_RE = /^(["'])([^"']+)\1\s*(.*)$/s;

/**
 * エントリの `@import` を種別ごとに分類する。
 * - relative: `./x.css` / `../x.css` の文字列 import（styles/ からの相対パスに正規化。layer() 等の後置は許す）
 * - notInlined: `url()` 形式と、`./` `../` で始まらないパス。Tailwind がインライン展開せず、そのまま出力 CSS に残る
 *   （`tailwindcss` と `@fontsource/` は意図的な外部 import なので対象外）
 */
function parseImports(entrySource: string) {
  const relative: string[] = [];
  const notInlined: string[] = [];
  postcss.parse(entrySource).walkAtRules('import', (rule) => {
    const params = rule.params.trim();
    const m = STRING_IMPORT_RE.exec(params);
    if (!m) {
      // url(...) 形式など、文字列リテラルで始まらない import
      notInlined.push(params);
      return;
    }
    const path = m[2];
    if (/^\.{1,2}\//.test(path)) relative.push(posix.normalize(path));
    else if (path !== 'tailwindcss' && !path.startsWith('@fontsource/')) notInlined.push(params);
  });
  return { relative, notInlined };
}

/** エントリの `@import` の相対パスを、書かれた順のまま返す */
function relativeImports(entrySource: string): string[] {
  return parseImports(entrySource).relative;
}

/** import 漏れ（unimported）・実在しない import（missing）・インライン展開されない import（notInlined）を返す純粋関数。実ファイルと fixture で共有する */
function checkStyleImports(files: Record<string, string>) {
  const { relative: relatives, notInlined } = parseImports(files[ENTRY] ?? '');
  const imported = new Set(relatives);
  const existing = Object.keys(files).filter((path) => path !== ENTRY);
  return {
    unimported: existing.filter((path) => !imported.has(path)),
    missing: [...imported].filter((path) => !(path in files)),
    notInlined,
  };
}

/**
 * import 順の違反を返す純粋関数。cascade は次の順に依存する:
 * tokens.css → base.css → components/*（hit-area.css が最後）→ tools/* → print.css → motion.css
 * （@layer components 内は後ろが勝ち、レイヤー外のルールは base → print → motion の順を保つ。global.css 冒頭と decisions.md [163]）
 */
function checkImportOrder(entrySource: string): string[] {
  const order = relativeImports(entrySource);
  const rank = (path: string): number => {
    if (path === 'tokens.css') return 0;
    if (path === 'base.css') return 1;
    if (path === 'components/hit-area.css') return 3;
    if (path.startsWith('components/')) return 2;
    if (path.startsWith('tools/')) return 4;
    if (path === 'print.css') return 5;
    if (path === 'motion.css') return 6;
    return -1;
  };
  const violations: string[] = [];
  const known = order.filter((path) => rank(path) >= 0);
  for (let i = 1; i < known.length; i++) {
    if (rank(known[i]) < rank(known[i - 1])) {
      violations.push(`${known[i]} は ${known[i - 1]} より前に import してください`);
    }
  }
  return violations;
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

  it('global.css の import がすべて Tailwind にインライン展開される（url() や相対パス以外を使っていない）', () => {
    const { notInlined } = checkStyleImports(files);
    expect(
      notInlined,
      `Tailwind がインライン展開しない @import があります（出力 CSS にそのまま残り、ブラウザが解決できません）:\n${notInlined.map((p) => `  ${p}`).join('\n')}\n→ './x.css' のような ./ か ../ で始まる文字列パスにしてください`
    ).toEqual([]);
  });

  it('import 順が tokens → base → components（hit-area が最後）→ tools → print → motion になっている', () => {
    const violations = checkImportOrder(files[ENTRY]);
    expect(
      violations,
      `global.css の import 順が cascade の前提と食い違っています:\n${violations.map((v) => `  ${v}`).join('\n')}\n→ 理由は global.css 冒頭のコメントと docs/decisions.md [163]`
    ).toEqual([]);
  });
});

// --- 陽性対照: 検知機構が空回りしていないことを保証（test-gates skill 準拠） ---

describe('[陽性対照] import 漏れ・存在しない import の検知機構', () => {
  const entry = `@import 'tailwindcss';\n@import './tokens.css';\n@import "./components/button.css";\n`;
  const ok = { [ENTRY]: entry, 'tokens.css': '', 'components/button.css': '' };

  it('陰性対照: 過不足のない構成では何も検出しない', () => {
    expect(checkStyleImports(ok)).toEqual({ unimported: [], missing: [], notInlined: [] });
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
    expect(r).toEqual({ unimported: [], missing: [], notInlined: [] });
  });

  it('ファイル名が似ているだけの import では import 済みと見なさない', () => {
    const r = checkStyleImports({
      ...ok,
      [ENTRY]: `@import './tokens.css';\n@import './components/button.css.bak';\n`,
    });
    expect(r.unimported).toEqual(['components/button.css']);
    expect(r.missing).toEqual(['components/button.css.bak']);
  });

  it('layer() / supports() / media 付きの import も import 済みと見なす（誤報しない）', () => {
    const r = checkStyleImports({
      ...ok,
      [ENTRY]: [
        `@import './tokens.css' layer(base);`,
        `@import "./components/button.css" supports(display: grid);`,
        `@import './components/form.css' screen and (min-width: 40em);`,
        `@import './components/table.css' layer(components) supports(display: grid) print;`,
      ].join('\n'),
      'components/form.css': '',
      'components/table.css': '',
    });
    expect(r).toEqual({ unimported: [], missing: [], notInlined: [] });
  });

  it('layer() 付きでも実在しない CSS は missing として検出する', () => {
    const r = checkStyleImports({
      ...ok,
      [ENTRY]: `${entry}@import './nope.css' layer(components);\n`,
    });
    expect(r.missing).toEqual(['nope.css']);
  });

  it('url() 形式の import は notInlined として検出し、相対 import とは数えない', () => {
    const r = checkStyleImports({
      ...ok,
      [ENTRY]: `${entry}@import url('./components/form.css');\n`,
      'components/form.css': '',
    });
    expect(r.notInlined).toEqual([`url('./components/form.css')`]);
    expect(r.unimported).toEqual(['components/form.css']);
  });

  it('./ ../ で始まらないパスの import は notInlined として検出する', () => {
    const r = checkStyleImports({
      ...ok,
      [ENTRY]: `${entry}@import 'components/form.css';\n@import "/abs/x.css";\n@import 'https://example.com/a.css';\n`,
      'components/form.css': '',
    });
    expect(r.notInlined).toEqual([
      `'components/form.css'`,
      `"/abs/x.css"`,
      `'https://example.com/a.css'`,
    ]);
    expect(r.unimported).toEqual(['components/form.css']);
  });

  it('tailwindcss と @fontsource/ の import は notInlined に数えない（陰性対照）', () => {
    const r = checkStyleImports({
      ...ok,
      [ENTRY]: `@import 'tailwindcss';\n@import '@fontsource/noto-sans-jp/400.css';\n@import './tokens.css';\n@import './components/button.css';\n`,
    });
    expect(r.notInlined).toEqual([]);
  });
});

describe('[陽性対照] import 順の検知機構', () => {
  const imp = (...paths: string[]) => paths.map((p) => `@import './${p}';`).join('\n');
  const correct = imp(
    'tokens.css',
    'base.css',
    'components/color.css',
    'components/form.css',
    'components/hit-area.css',
    'tools/qr.css',
    'tools/uuid-v7.css',
    'print.css',
    'motion.css'
  );

  it('陰性対照: 正しい順では何も検出しない（layer() 付きでも同じ）', () => {
    expect(checkImportOrder(`@import 'tailwindcss';\n${correct}`)).toEqual([]);
    expect(
      checkImportOrder(correct.replace("'./tokens.css'", "'./tokens.css' layer(base)"))
    ).toEqual([]);
  });

  it('components/ 内で import 順に制約はない（hit-area 以外は入れ替え可）', () => {
    expect(
      checkImportOrder(
        imp(
          'tokens.css',
          'base.css',
          'components/form.css',
          'components/color.css',
          'components/hit-area.css'
        )
      )
    ).toEqual([]);
  });

  it.each([
    ['tokens.css と base.css の入れ替え', ['base.css', 'tokens.css']],
    ['base.css が components より後', ['tokens.css', 'components/color.css', 'base.css']],
    ['hit-area.css が components の最後でない', ['components/hit-area.css', 'components/form.css']],
    ['tools が components より前', ['tools/qr.css', 'components/hit-area.css']],
    ['print.css が tools より前', ['print.css', 'tools/qr.css']],
    ['motion.css が print.css より前', ['motion.css', 'print.css']],
  ])('%s を検出する', (_name, paths) => {
    expect(checkImportOrder(imp(...paths)).length).toBeGreaterThan(0);
  });

  it('正しい並びから 1 組だけ入れ替えた fixture を検出する', () => {
    const swapped = correct.replace(
      "@import './print.css';\n@import './motion.css';",
      "@import './motion.css';\n@import './print.css';"
    );
    expect(swapped).not.toBe(correct);
    expect(checkImportOrder(swapped)).toEqual([expect.stringContaining('print.css')]);
  });
});
