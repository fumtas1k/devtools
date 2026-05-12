import { test, expect } from '@playwright/test';
import { watchHydrationWarnings, waitForReactHydration } from './helpers';
import { PAGES, STATIC_PAGES } from './visual-regression-pages';

/**
 * 陰性対照 (dev mode): astro dev server + React dev build で hydration warning を全種類 catch。
 *
 * React 18 は hydration mismatch を 2 種類に分けて扱う:
 * - **attribute mismatch** (例: `<input id="...">` 値違い): dev で console.error
 *   (`A tree hydrated but some attributes of the server rendered HTML didn't match the
 *   client properties.`)、production build では silent recovery (warning なし)
 * - **text content / structure mismatch**: dev でも production でも warning を発火
 *
 * `hydration-check.spec.ts` (production build 経路) は後者のみ catch するため
 * attribute mismatch が検知漏れする。本 spec は dev server (port 4322) 経由で
 * 訪問することで attribute mismatch も含む全種類の hydration warning を chr catch する。
 *
 * 検知能力の陽性対照は `hydration-check-dev.gate.spec.ts` で保証 (test-gates skill)。
 */
test('PAGES 全件で hydration warning が出ない (陰性対照・dev mode)', async ({ browser }) => {
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
        // hydration warning は load 直後の microtask / 次 task で発火するため
        // ブラウザ側で 1 task 進めて React の error commit を確実に flush する
        await page.evaluate(() => new Promise<void>((r) => setTimeout(r, 0)));
        expect(guard.warnings, `hydration warning at ${path} (dev mode)`).toEqual([]);
      } finally {
        guard.dispose();
        await page.close();
      }
    }
  } finally {
    await context.close();
  }
});
