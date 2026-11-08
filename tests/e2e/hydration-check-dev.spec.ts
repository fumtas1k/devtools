import { test, expect } from '@playwright/test';
import { watchHydrationWarnings, waitForReactHydration } from './helpers';
import { PAGES, STATIC_PAGES } from './visual-regression-pages';
import {
  HydrationRecorder,
  reportHydrationFailure,
  withCleanup,
} from '../diagnostics/hydration-recorder';

let recorder: HydrationRecorder;

test.beforeEach(() => {
  recorder = new HydrationRecorder();
});

test.afterEach(async ({}, testInfo) => {
  await reportHydrationFailure(recorder, testInfo);
});

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
  const context = await recorder.run(null, 'context.newContext', () => browser.newContext());
  await withCleanup(async () => {
    for (const path of PAGES) {
      const page = await recorder.run(path, 'context.newPage', () => context.newPage());
      const guard = watchHydrationWarnings(page);
      await withCleanup(async () => {
        await recorder.run(path, 'page.goto', () => page.goto(path));
        if (!STATIC_PAGES.has(path)) {
          await recorder.run(path, 'hydration', () => waitForReactHydration(page));
        }
        // hydration warning は load 直後の microtask / 次 task で発火するため
        // ブラウザ側で 1 task 進めて React の error commit を確実に flush する
        await recorder.run(path, 'task flush', () =>
          page.evaluate(() => new Promise<void>((r) => setTimeout(r, 0)))
        );
        await recorder.run(path, 'assert', () =>
          expect(guard.warnings, `hydration warning at ${path} (dev mode)`).toEqual([])
        );
      }, [
        () => recorder.run(path, 'guard.dispose', () => guard.dispose()),
        () => recorder.run(path, 'page.close', () => page.close()),
      ]);
    }
  }, [() => recorder.run(null, 'context.close', () => context.close())]);
});
