import { test, expect } from '@playwright/test';
import { watchHydrationWarnings, waitForReactHydration } from './helpers';
import { PAGES, STATIC_PAGES } from './visual-regression-pages';

/**
 * 陰性対照: 各 page を訪問して React の hydration warning が出ないことを assert する meta spec。
 *
 * 過去に Gs1Databar.tsx で `useState(() => crypto.randomUUID())` の lazy initializer が
 * SSR/CSR で異なる UUID を返し hydration mismatch を起こしていたが、既存 e2e は CSP
 * violation gate のみで hydration warning を見ていなかったため 1 ヶ月以上潜在した
 * (commit `4c21a58` 〜)。本 spec が今後の同種 regression を catch する。
 *
 * 検知能力の陽性対照は `hydration-check.gate.spec.ts` で保証する (test-gates skill)。
 *
 * **設計**: 1 context を再利用して全 PAGES を順次訪問する。各 page につき
 * `browser.newContext()` を立てる構造に比べて CI 実行時間を短縮する trade-off:
 * - Playwright reporter の粒度が page 単位 → spec 単位に下がる
 * - 代わりに `expect(..., { message: path })` で failure 時にどの page で
 *   壊れたかを明示する
 */
test('PAGES 全件で hydration warning が出ない (陰性対照)', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    for (const path of PAGES) {
      const page = await context.newPage();
      const guard = watchHydrationWarnings(page);
      try {
        await page.goto(path);
        if (!STATIC_PAGES.has(path)) {
          await waitForReactHydration(page);
        }
        // hydration warning は load 直後の microtask / 次 task で発火する。
        // ブラウザ側で 1 task 明示的に進めて React の error commit を確実に flush する。
        await page.evaluate(() => new Promise<void>((r) => setTimeout(r, 0)));
        expect(guard.warnings, `hydration warning at ${path}`).toEqual([]);
      } finally {
        guard.dispose();
        await page.close();
      }
    }
  } finally {
    await context.close();
  }
});
