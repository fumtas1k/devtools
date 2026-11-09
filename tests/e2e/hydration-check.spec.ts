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
        // hydration warning は load 直後の microtask / 次 task で発火する。
        // ブラウザ側で 1 task 明示的に進めて React の error commit を確実に flush する。
        await recorder.run(path, 'task flush', () =>
          page.evaluate(() => new Promise<void>((r) => setTimeout(r, 0)))
        );
        await recorder.run(path, 'assert', () =>
          expect(guard.warnings, `hydration warning at ${path}`).toEqual([])
        );
      }, [
        () => recorder.run(path, 'guard.dispose', () => guard.dispose()),
        () => recorder.run(path, 'page.close', () => page.close()),
      ]);
    }
  }, [() => recorder.run(null, 'context.close', () => context.close())]);
});
