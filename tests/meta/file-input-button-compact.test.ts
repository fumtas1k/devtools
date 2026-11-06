import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { COMPACT_BUTTON_SHAPE_CLASSES } from '../../src/components/ui/_compactButton';

/**
 * meta test: FileInputButton（`.btn-file-input`）が compact ボタンと同じ寸法であること
 *
 * `.btn-file-input` は label 要素で ActionButton の utility class を持てないため、寸法を CSS に
 * 手書きしている。`COMPACT_BUTTON_SHAPE_CLASSES`（ActionButton の既定・CopyButton と共通）とずれると、
 * 並べたときに高さ・角丸・文字が食い違う。ずれを検出する（docs/decisions.md [168]）。
 * 同じセレクタのルールが複数あっても、cascade の最後に勝つ値（後ろの宣言が勝つ）で比べる。
 * あわせて、36px なので 44×44px のタップ領域（hit-area.css）の対象に入っていることも検査する。
 */

const STYLES_DIR = resolve(__dirname, '..', '..', 'src', 'styles', 'components');

/** Tailwind の spacing（1 = 0.25rem）を rem 文字列にする */
function spacing(n: string): string {
  return `${Number(n) * 0.25}rem`;
}

/** COMPACT_BUTTON_SHAPE_CLASSES から、`.btn-file-input` が持つべき CSS 値を導く */
function expectedFromCompactClasses(classes: string) {
  const pick = (re: RegExp): string => {
    const m = re.exec(classes);
    if (m === null) throw new Error(`COMPACT_BUTTON_SHAPE_CLASSES に ${re} が見つかりません`);
    return m[1];
  };
  return {
    'min-height': spacing(pick(/(?:^|\s)min-h-([\d.]+)(?:\s|$)/)),
    'min-width': spacing(pick(/(?:^|\s)min-w-([\d.]+)(?:\s|$)/)),
    padding: `${spacing(pick(/(?:^|\s)py-([\d.]+)(?:\s|$)/))} ${spacing(pick(/(?:^|\s)px-([\d.]+)(?:\s|$)/))}`,
    'border-radius': `var(--radius-${pick(/(?:^|\s)rounded-(button-sm)(?:\s|$)/)})`,
    // 文字: text-base = 1rem / font-bold = 700 / leading-none = 1
    'font-size': pickToken(classes, 'text-base', '1rem'),
    'font-weight': pickToken(classes, 'font-bold', '700'),
    'line-height': pickToken(classes, 'leading-none', '1'),
  };
}

/** クラス列に token があれば、対応する CSS 値を返す（無ければ定数側が変わったので失敗させる） */
function pickToken(classes: string, token: string, value: string): string {
  if (!classes.split(/\s+/).includes(token)) {
    throw new Error(`COMPACT_BUTTON_SHAPE_CLASSES に ${token} が見つかりません`);
  }
  return value;
}

/** セレクタを含むルールをすべて集め、後ろの宣言が勝つ形で宣言をまとめる（specificity は同じ前提） */
function declarationsOf(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  postcss.parse(css).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((d) => {
      out[d.prop] = d.value;
    });
  });
  return out;
}

/** `.btn-file-input` の寸法の不一致を、プロパティごとのメッセージで返す（空配列なら一致） */
function findShapeMismatches(css: string, classes: string): string[] {
  const actual = declarationsOf(css, '.btn-file-input');
  const expected = expectedFromCompactClasses(classes);
  return Object.entries(expected)
    .filter(([prop, value]) => actual[prop] !== value)
    .map(([prop, value]) => `${prop}: 期待 ${value} / 実際 ${actual[prop] ?? '(なし)'}`);
}

/** hit-area.css に無い `.btn-file-input` 系のセレクタを返す（空配列なら対象に入っている） */
function findMissingHitAreaSelectors(css: string): string[] {
  const selectors: string[] = [];
  postcss.parse(css).walkRules((r) => {
    selectors.push(...r.selectors);
  });
  return ['.btn-file-input', '.btn-file-input::after'].filter((sel) => !selectors.includes(sel));
}

describe('FileInputButton の compact 寸法', () => {
  const buttonCss = readFileSync(resolve(STYLES_DIR, 'button.css'), 'utf8');
  const hitAreaCss = readFileSync(resolve(STYLES_DIR, 'hit-area.css'), 'utf8');

  it('.btn-file-input が COMPACT_BUTTON_SHAPE_CLASSES と同じ高さ・最小幅・padding・角丸を持つ', () => {
    expect(findShapeMismatches(buttonCss, COMPACT_BUTTON_SHAPE_CLASSES)).toEqual([]);
  });

  it('.btn-file-input とその ::after が hit-area.css の対象に入っている', () => {
    expect(findMissingHitAreaSelectors(hitAreaCss)).toEqual([]);
  });

  const COMPACT_CSS = `.btn-file-input {
    min-height: 2.25rem; min-width: 5rem; padding: 0.125rem 0.75rem;
    font-size: 1rem; font-weight: 700; line-height: 1; border-radius: var(--radius-button-sm);
  }`;

  // 陽性対照: 期待値どおりの CSS は一致し（検知器が常に fail ではない）、ずれた CSS は検出する
  it('[陽性対照] 期待値どおりの CSS は不一致なしと判定される', () => {
    expect(findShapeMismatches(COMPACT_CSS, COMPACT_BUTTON_SHAPE_CLASSES)).toEqual([]);
  });

  it('[陽性対照] 旧寸法（md: 48px・96px・8px）の .btn-file-input は寸法 4 件が不一致として検出される', () => {
    const legacy = `.btn-file-input { min-height: 3rem; min-width: 6rem; padding: 0.5rem 1rem; border-radius: var(--radius-md); font-size: 1rem; font-weight: 700; line-height: 1; }`;
    expect(findShapeMismatches(legacy, COMPACT_BUTTON_SHAPE_CLASSES)).toHaveLength(4);
  });

  it('[陽性対照] .btn-file-input を持たない CSS は全プロパティが不一致になる', () => {
    expect(
      findShapeMismatches('.other { color: red; }', COMPACT_BUTTON_SHAPE_CLASSES)
    ).toHaveLength(7);
  });

  it('[陽性対照] 後ろに書き足した同じセレクタの上書きルールを検出する', () => {
    const overridden = `${COMPACT_CSS}\n.btn-file-input { min-height: 3rem; }`;
    expect(findShapeMismatches(overridden, COMPACT_BUTTON_SHAPE_CLASSES)).toEqual([
      expect.stringContaining('min-height'),
    ]);
  });

  it('[陽性対照] セレクタ列の中で上書きするルールも検出する', () => {
    const overridden = `${COMPACT_CSS}\n.other, .btn-file-input { min-width: 6rem; }`;
    expect(findShapeMismatches(overridden, COMPACT_BUTTON_SHAPE_CLASSES)).toEqual([
      expect.stringContaining('min-width'),
    ]);
  });

  it('[陽性対照] 文字の指定（font-size / font-weight / line-height）の違いを検出する', () => {
    const wrongText = COMPACT_CSS.replace('font-size: 1rem', 'font-size: 0.875rem')
      .replace('font-weight: 700', 'font-weight: 400')
      .replace('line-height: 1;', 'line-height: 1.7;');
    const mismatches = findShapeMismatches(wrongText, COMPACT_BUTTON_SHAPE_CLASSES);
    expect(mismatches).toHaveLength(3);
    expect(mismatches.join('\n')).toMatch(/font-size[\s\S]*font-weight[\s\S]*line-height/);
  });

  it('[陽性対照] hit-area に .btn-file-input の行が無い CSS を検出する', () => {
    const without = `.hit-area, .btn-action { position: relative; }\n.hit-area::after, .btn-action::after { content: ''; }`;
    expect(findMissingHitAreaSelectors(without)).toEqual([
      '.btn-file-input',
      '.btn-file-input::after',
    ]);
    // ::after だけ欠けている場合も検出する
    expect(
      findMissingHitAreaSelectors(
        `.btn-file-input { position: relative; }\n.hit-area::after { content: ''; }`
      )
    ).toEqual(['.btn-file-input::after']);
  });
});
