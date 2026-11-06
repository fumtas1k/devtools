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
 * 並べたときに高さや角丸が食い違う。ずれを検出する（docs/decisions.md [168]）。
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
  };
}

/** セレクタが完全一致する最初のルールの宣言を取り出す */
function declarationsOf(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector !== selector || Object.keys(out).length > 0) return;
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

describe('FileInputButton の compact 寸法', () => {
  const buttonCss = readFileSync(resolve(STYLES_DIR, 'button.css'), 'utf8');
  const hitAreaCss = readFileSync(resolve(STYLES_DIR, 'hit-area.css'), 'utf8');

  it('.btn-file-input が COMPACT_BUTTON_SHAPE_CLASSES と同じ高さ・最小幅・padding・角丸を持つ', () => {
    expect(findShapeMismatches(buttonCss, COMPACT_BUTTON_SHAPE_CLASSES)).toEqual([]);
  });

  it('.btn-file-input とその ::after が hit-area.css の対象に入っている', () => {
    const selectors: string[] = [];
    postcss.parse(hitAreaCss).walkRules((r) => {
      selectors.push(...r.selectors);
    });
    expect(selectors).toContain('.btn-file-input');
    expect(selectors).toContain('.btn-file-input::after');
  });

  // 陽性対照: 旧寸法（md: 48px・96px・8px）の CSS を渡すと不一致を検出する
  it('[陽性対照] 旧寸法（md）の .btn-file-input は不一致として検出される', () => {
    const legacy = `.btn-file-input { min-height: 3rem; min-width: 6rem; padding: 0.5rem 1rem; border-radius: var(--radius-md); }`;
    const mismatches = findShapeMismatches(legacy, COMPACT_BUTTON_SHAPE_CLASSES);
    expect(mismatches).toHaveLength(4);
  });

  it('[陽性対照] .btn-file-input を持たない CSS は全プロパティが不一致になる', () => {
    expect(
      findShapeMismatches('.other { color: red; }', COMPACT_BUTTON_SHAPE_CLASSES)
    ).toHaveLength(4);
  });
});
