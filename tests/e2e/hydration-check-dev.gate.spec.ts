import { test, expect } from '@playwright/test';
import { watchHydrationWarnings } from './helpers';

/**
 * 陽性対照 (dev mode): attribute mismatch を意図的に発生させ
 * `watchHydrationWarnings` が dev console の警告経路でも検知能力を保つことを保証する。
 *
 * `/test-fixtures/attr-hydration-broken` は SSR で `data-rendered="server"`、CSR で
 * `data-rendered="client"` を出す `<div>` を `client:load` で mount した fixture page。
 * React 18 はこの attribute mismatch を **dev mode のみ** で console.error
 * (`A tree hydrated but some attributes of the server rendered HTML didn't match
 * the client properties.`) として発火する (production build では silent recovery)。
 *
 * 本 spec が pass = listener が dev message を正しく拾えている。**meta spec の
 * listener 登録を外したり regex を破壊するとこの陽性対照が fail に昇格する** ことが
 * test-gates skill の要件を満たす条件 (検知能力ゼロで green を防ぐ)。
 *
 * 陰性対照は `hydration-check-dev.spec.ts` で `/tools/*` を訪問して 0 件を assert。
 */
test('watchHydrationWarnings は attribute mismatch を dev mode で捕捉する (陽性対照)', async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const guard = watchHydrationWarnings(page);
    await page.goto('/test-fixtures/attr-hydration-broken');
    // SSR の attribute 値が DOM に焼き付いている (hydration 前の確認)
    await expect(page.getByTestId('attr-hydration-fixture')).toHaveAttribute(
      'data-rendered',
      /server|client/
    );
    // React hydration は load 直後の microtask で走り attribute mismatch を検出する。
    // dev mode 経路では `A tree hydrated but some attributes...` が console.error として出る。
    await expect.poll(() => guard.warnings.length, { timeout: 5000 }).toBeGreaterThan(0);
    // 将来 React upgrade で dev message が変わったとき早期検知できるよう、
    // どの経路 (`A tree hydrated...` / `did not match the client` 等) に hit したかを log
    // eslint-disable-next-line no-console
    console.log('[hydration-dev-gate] captured:', guard.warnings[0]);
  } finally {
    await context.close();
  }
});
