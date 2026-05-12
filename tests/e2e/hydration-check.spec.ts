import { test } from '@playwright/test';
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
 */
test.describe('Hydration mismatch 検知 (陰性対照)', () => {
  for (const path of PAGES) {
    test(`${path} で hydration warning が出ない`, async ({ browser }) => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        const guard = watchHydrationWarnings(page);
        await page.goto(path);
        if (!STATIC_PAGES.has(path)) {
          await waitForReactHydration(page);
        }
        // hydration warning は load 直後の microtask / 次 task で発火する。固定
        // timeout だと低速 CI で false negative の余地があるため、ブラウザ側で
        // 1 task 明示的に進めて React の error commit を確実に flush する。
        await page.evaluate(() => new Promise<void>((r) => setTimeout(r, 0)));
        guard.assertNoWarnings();
      } finally {
        await context.close();
      }
    });
  }
});
