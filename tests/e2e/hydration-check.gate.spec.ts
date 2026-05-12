import { test, expect } from '@playwright/test';
import { watchHydrationWarnings } from './helpers';

/**
 * 陽性対照: `watchHydrationWarnings` 自体の検知能力を保証するメタテスト。
 *
 * `/test-fixtures/hydration-broken` は SSR で "SERVER", CSR で "CLIENT" を出力する
 * React component を `client:load` で mount した fixture page。React 18 はこの
 * text mismatch を console.error / pageerror で報告するため、guard が
 * 「warnings.length > 0」を観測することで検知能力を証明する。
 *
 * 本 spec が pass = listener や regex が機能している。**meta spec の listener
 * 登録を外したり regex を破壊するとこの陽性対照が fail に昇格する** ことが
 * test-gates skill の要件を満たす条件 (検知能力ゼロで green を防ぐ)。
 *
 * 陰性対照は `hydration-check.spec.ts` で `/tools/*` を訪問して 0 件を assert。
 */
test('watchHydrationWarnings は実際に hydration mismatch を捕捉する (陽性対照)', async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const guard = watchHydrationWarnings(page);
    await page.goto('/test-fixtures/hydration-broken');
    // SSR で "SERVER" が DOM に焼き付けられている (hydration 前の確認)
    await expect(page.getByTestId('hydration-fixture')).toContainText(/SERVER|CLIENT/);
    // React hydration は load 直後の microtask で走り、mismatch を発見し次第
    // console.error を発火する。poll で確実に捕捉する。
    await expect.poll(() => guard.warnings.length, { timeout: 5000 }).toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});
