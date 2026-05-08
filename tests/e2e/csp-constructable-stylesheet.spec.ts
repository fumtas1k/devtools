/**
 * Phase 0 minimal repro — Constructable Stylesheets × CSP `style-src 'self'` 検証
 *
 * **永続 spec**: PR 9 (#304) の技術前提 (Constructable Stylesheets が CSP3 の
 * `style-src 'self'` 下で動作する) を実機で保証する regression 検出網。
 * PR 10 で `PRODUCTION_CSP` 自体が strict 化された後も、継続的な回帰検知として
 * このファイルを削除しないこと。
 *
 * **`feedback_positive_control_for_gates.md` 準拠**:
 * ガード/バリデータには「意図的に違反を起こして捕捉できる」陽性対照を必ず併設する。
 * 本 spec は陽性対照 (インライン `<style>` 要素は違反する) と陰性対照 (Constructable
 * Stylesheets は違反しない) をセットで提供し、ゲートが空回りしていないことを保証する。
 *
 * **陽性対照の probe 選定**:
 * `el.style.setProperty()` を `page.evaluate()` 経由で呼ぶと Playwright CDP
 * Runtime.evaluate の実行は CSP inline style 制約を受けないことを実機確認した
 * (config-converter.spec.ts の陽性対照コメント参照、同じ CDP bypass 現象)。
 * 代わりに `<style>` 要素挿入を probe とする — これは CSP `style-src 'unsafe-inline'`
 * なしに Chromium がブロックし console error で捕捉できる。
 *
 * **inline pattern 使用理由**:
 * `withProductionCsp` ラッパは終端で `assertNoViolations()` を呼ぶ設計のため、
 * 陽性対照テスト (違反を期待するテスト) に整合しない。
 * `browser.newContext()` + `try/finally context.close()` の inline pattern を使う
 * (`tests/e2e/helpers.ts` の JSDoc 既述の方針に従う)。
 */

import { test, expect } from '@playwright/test';
import { applyProductionCsp } from './helpers';

test.describe('CSP style-src strict 下の Constructable Stylesheets 検証', () => {
  test('陽性対照: インライン <style> 要素は CSP 違反を起こす', async ({ browser }) => {
    // 設計メモ:
    // page.evaluate() 内で el.style.setProperty() を呼んでも Playwright の
    // CDP Runtime.evaluate 経由の実行は CSP inline style 制約を受けない事象を確認
    // (config-converter.spec.ts の陽性対照コメントと同じ理由)。
    // 代わりに <style> 要素挿入を probe とする。<style> 要素のインライン CSS は
    // `style-src 'unsafe-inline'` なしには block され、Chromium が
    // "Refused to apply inline style ... Content Security Policy directive ..."
    // を console error に出すため guard が確実に捕捉できる。
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      const response = await page.goto('/');
      // 前提検証: route 注入が効いており strict CSP がヘッダに乗っていること
      expect(response?.headers()['content-security-policy']).toContain("style-src 'self'");
      expect(response?.headers()['content-security-policy']).not.toContain(
        "style-src 'self' 'unsafe-inline'"
      );
      await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent = '.csp-positive-probe { color: red; }';
        document.head.appendChild(style);
      });
      await expect.poll(() => guard.violations.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test('陰性対照: Constructable Stylesheet は違反を起こさず適用される', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      const response = await page.goto('/');
      // 前提検証: route 注入が効いており strict CSP がヘッダに乗っていること
      expect(response?.headers()['content-security-policy']).toContain("style-src 'self'");
      expect(response?.headers()['content-security-policy']).not.toContain(
        "style-src 'self' 'unsafe-inline'"
      );

      const bg = await page.evaluate(() => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync('.csp-probe { background: rgb(255, 0, 0); }');
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

        const probe = document.createElement('div');
        probe.className = 'csp-probe';
        document.body.appendChild(probe);

        return getComputedStyle(probe).backgroundColor;
      });

      expect(bg).toBe('rgb(255, 0, 0)');
      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });

  test('陰性対照: CSS 変数注入経路でも違反を起こさない (ResultTable / ToggleGroup の本物形態)', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      const response = await page.goto('/');
      // 前提検証: route 注入が効いており strict CSP がヘッダに乗っていること
      expect(response?.headers()['content-security-policy']).toContain("style-src 'self'");
      expect(response?.headers()['content-security-policy']).not.toContain(
        "style-src 'self' 'unsafe-inline'"
      );

      const result = await page.evaluate(() => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(
          '.dyn-test-instance { --col-width: 3.5rem; } ' +
            '.child-dyn-test-instance { width: var(--col-width, auto); }'
        );
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

        const parent = document.createElement('div');
        parent.className = 'dyn-test-instance';
        const child = document.createElement('div');
        child.className = 'child-dyn-test-instance';
        parent.appendChild(child);
        document.body.appendChild(parent);

        return getComputedStyle(child).width;
      });

      // 3.5rem = 56px @ 16px base
      expect(result).toBe('56px');
      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });
});
