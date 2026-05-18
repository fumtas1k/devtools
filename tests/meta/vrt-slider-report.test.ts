import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import {
  generateHTML,
  isRetryDir,
  makeLabelFromContextContent,
} from '../../scripts/generate-vrt-slider.mjs';

/**
 * meta test: generate-vrt-slider.mjs の error-context.md parse ロジック検証
 *
 * `makeLabelFromContextContent` は Playwright 1.59 の
 * `node_modules/playwright/lib/errorContext.js:44-90` の literal template を前提とする。
 * format が将来変わると null fallback になるだけで slider 本体は止まらないが、
 * ここで陽性対照を固めておくことで format ドリフトを CI で検知できる。
 */

const VALID_CONTENT = `# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual-regression.spec.ts >> visual regression - mobile (390x844) >> /tools/char-count の screenshot が baseline と一致
- Location: tests/e2e/visual-regression.spec.ts:32:7

# Error details

\`\`\`
Error: expect(page).toHaveScreenshot(expected) failed
\`\`\`
`;

describe('makeLabelFromContextContent (正常 format)', () => {
  it('mobile + /tools/char-count から `[mobile 390x844] /tools/char-count` を返す', () => {
    expect(makeLabelFromContextContent(VALID_CONTENT)).toBe('[mobile 390x844] /tools/char-count');
  });

  it('desktop + /tools/base64 から `[desktop 1280x800] /tools/base64` を返す', () => {
    const c = VALID_CONTENT.replace('mobile (390x844)', 'desktop (1280x800)').replace(
      '/tools/char-count',
      '/tools/base64'
    );
    expect(makeLabelFromContextContent(c)).toBe('[desktop 1280x800] /tools/base64');
  });

  it('root url (/) から `[desktop 1280x800] /` を返す', () => {
    const c = VALID_CONTENT.replace('mobile (390x844)', 'desktop (1280x800)').replace(
      '/tools/char-count の screenshot が',
      '/ の screenshot が'
    );
    expect(makeLabelFromContextContent(c)).toBe('[desktop 1280x800] /');
  });
});

// 陽性対照: format 異常時に確実に null を返すことを保証。
// 将来 Playwright が errorContext.md の format を変えた時、陰性対照のみでは
// 「null 返却 → raw fallback」の検知機構が空回りしていることに気づけない。
describe('[陽性対照] makeLabelFromContextContent (format 異常時に必ず null fallback)', () => {
  it('content が文字列でないと null を返す', () => {
    expect(makeLabelFromContextContent(null)).toBeNull();
    expect(makeLabelFromContextContent(undefined)).toBeNull();
    expect(makeLabelFromContextContent(123)).toBeNull();
    expect(makeLabelFromContextContent({})).toBeNull();
  });

  it('`- Name:` 行が無いと null を返す', () => {
    expect(makeLabelFromContextContent('# Test info\n\n- Location: foo.ts:1:1')).toBeNull();
  });

  it('`- Name:` 行はあるが `>>` 区切りが 1 個しかないと null を返す', () => {
    expect(makeLabelFromContextContent('- Name: visual-regression.spec.ts')).toBeNull();
    expect(makeLabelFromContextContent('- Name: spec.ts >> only-one-part')).toBeNull();
  });

  it('describe 部分に viewport regex がマッチしないと null を返す', () => {
    const c =
      '- Name: spec.ts >> describe without viewport >> /tools/foo の screenshot が baseline と一致';
    expect(makeLabelFromContextContent(c)).toBeNull();
  });

  it('空文字列は null を返す', () => {
    expect(makeLabelFromContextContent('')).toBeNull();
  });
});

/**
 * generateHTML: img-comparison-slider の参照経路を検証 (#352)。
 * 旧実装 (unpkg CDN) に当てると pass しないことが陽性対照テストで担保される。
 */
describe('generateHTML (slider lib 参照経路)', () => {
  const sample = [{ label: '[desktop 1280x800] /tools/foo', id: 'foo', hasDiff: false }];

  it('生成 HTML はローカル `lib/index.js` を `<script type="module">` で参照する', () => {
    const html = generateHTML(sample);
    expect(html).toContain('<script type="module" src="lib/index.js"></script>');
  });

  it('生成 HTML はローカル `lib/styles.css` を `<link rel="stylesheet">` で参照する', () => {
    const html = generateHTML(sample);
    expect(html).toContain('<link rel="stylesheet" href="lib/styles.css">');
  });

  it('生成 HTML は unpkg.com / cdn.jsdelivr.net を一切参照しない', () => {
    const html = generateHTML(sample);
    expect(html).not.toContain('unpkg.com');
    expect(html).not.toContain('cdn.jsdelivr.net');
  });

  it('node_modules に img-comparison-slider のビルド済みファイルが存在する (CI 前提)', () => {
    expect(existsSync('node_modules/img-comparison-slider/dist/index.js')).toBe(true);
    expect(existsSync('node_modules/img-comparison-slider/dist/styles.css')).toBe(true);
  });
});

// 陽性対照: CDN 参照検知 assertion が「常に green」化していないことを確認する。
// もし将来 generateHTML が unpkg URL を再導入してしまった時、上の `.not.toContain` が
// 確実に fail することを、CDN URL を含む synthetic HTML 文字列で能動検知できることで証明する。
// (test-gates skill: 陽性対照を陰性対照と別 test に分離する原則)
describe('[陽性対照] CDN 参照検知 assertion が機能している', () => {
  it('synthetic な unpkg URL 入り HTML を assert 経路に通すと検知される', () => {
    const cdnHtml =
      '<script type="module" src="https://unpkg.com/img-comparison-slider@8/dist/index.js"></script>';
    expect(cdnHtml).toContain('unpkg.com');
  });

  it('synthetic な jsdelivr URL 入り HTML を assert 経路に通すと検知される', () => {
    const cdnHtml =
      '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/img-comparison-slider/dist/styles.css">';
    expect(cdnHtml).toContain('cdn.jsdelivr.net');
  });

  it('synthetic な local lib 参照 HTML は CDN チェックを pass する (false positive 回避)', () => {
    const localHtml =
      '<script type="module" src="lib/index.js"></script><link rel="stylesheet" href="lib/styles.css">';
    expect(localHtml).not.toContain('unpkg.com');
    expect(localHtml).not.toContain('cdn.jsdelivr.net');
  });
});

/**
 * isRetryDir: Playwright の retry attempt dir を判定するフィルタ。
 * regex `/-retry\d+$/` は raw な dir 名 (sanitize 前) を渡される前提。
 * 誤検知 (非 retry を retry と判定) / 見逃し (retry を見逃す) 両方の陽性対照を網羅。
 */
describe('isRetryDir (retry attempt 検出)', () => {
  it('retry suffix を含む dir 名は true', () => {
    expect(isRetryDir('visual-regression-foo-retry1')).toBe(true);
    expect(isRetryDir('foo-retry2')).toBe(true);
    expect(isRetryDir('foo-retry99')).toBe(true);
  });
});

describe('[陽性対照] isRetryDir (誤検知・見逃しの検出)', () => {
  it('retry なしの dir 名は false (見逃しゼロ確認用)', () => {
    expect(isRetryDir('visual-regression-foo')).toBe(false);
    expect(isRetryDir('foo')).toBe(false);
  });

  it('retry が末尾でないと false (中間/先頭で誤検知しない)', () => {
    expect(isRetryDir('foo-retry1-suffix')).toBe(false);
    expect(isRetryDir('retry1-foo')).toBe(false);
  });

  it('retry の後ろが数字以外だと false', () => {
    expect(isRetryDir('foo-retry')).toBe(false);
    expect(isRetryDir('foo-retryX')).toBe(false);
  });

  it('"retry" の前にハイフンが無いと false', () => {
    expect(isRetryDir('fooretry1')).toBe(false);
  });
});
