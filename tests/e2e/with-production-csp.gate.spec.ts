import { test, expect, type Browser, type Page } from '@playwright/test';
import { withProductionCsp, type CspGuard, type WithProductionCspOptions } from './helpers';

const touchOptions = { viewport: { width: 390, height: 844 }, hasTouch: true };

// 未対応キーの object literal は型検査で拒否される。
const invalidOptions: WithProductionCspOptions = {
  contextOptions: {
    // @ts-expect-error bypassCSP は公開しない
    bypassCSP: true,
  },
};
void invalidOptions;

/**
 * 陽性対照: `withProductionCsp` ラッパ固有挙動を検証するメタテスト (issue #281)。
 *
 * `applyProductionCsp` 単体の検知能力は `tests/e2e/uuid-v7.spec.ts` /
 * `tests/e2e/config-converter.spec.ts` の inline pattern メタテストが担保するが、
 * ラッパが追加する以下の挙動はどの利用テストも明示的に検証していなかった:
 *
 * 1. `fn` が throw しても `context.close()` が確実に呼ばれる (`finally` の検証)
 * 2. `fn` 正常終了後に `guard.assertNoViolations()` が呼ばれ、違反が test failure
 *    に昇格する (集約の本丸)
 * 3. `fn` の throw が `assertNoViolations` の失敗に隠蔽されず元例外が伝播する
 *
 * いずれも「ラッパの該当行を壊すとこの spec が fail に昇格する」設計
 * (test-gates skill の陽性対照要件)。陰性対照は withProductionCsp を利用する
 * 通常テスト群 (`uuid-v7.spec.ts` 等) が兼ねる。
 */

/** fn 内で意図的に CSP 違反 (外部 origin script 注入) を発生させ、guard に記録されるまで待つ */
async function injectCspViolation(page: Page, guard: CspGuard) {
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.src = 'https://example.com/violates-csp.js';
    document.head.appendChild(script);
  });
  // console error の到達は非同期のため、fn を抜ける前に記録を確実化して
  // 「終端 assertNoViolations より違反到達が遅れて素通り」する race を排除する
  await expect.poll(() => guard.violations.length, { timeout: 5000 }).toBeGreaterThan(0);
}

test('withProductionCsp: fn が throw しても context.close が呼ばれる', async ({ browser }) => {
  let capturedPage: Page | undefined;
  await expect(
    withProductionCsp(browser, '/tools/uuid-v7', async (page) => {
      capturedPage = page;
      throw new Error('intentional-throw');
    })
  ).rejects.toThrow('intentional-throw');
  // context.close() 済みなら配下の page も closed になる (観測可能な振る舞い)
  expect(capturedPage).toBeDefined();
  expect(capturedPage!.isClosed()).toBe(true);
});

test('withProductionCsp: fn 内の CSP 違反は終端 assertNoViolations で fail に昇格する (陽性対照)', async ({
  browser,
}) => {
  await expect(
    withProductionCsp(browser, '/tools/uuid-v7', async (page, guard) => {
      // fn 内では assertNoViolations を呼ばず、ラッパの終端呼び出しに任せる
      await injectCspViolation(page, guard);
    })
  ).rejects.toThrow(/CSP 違反/);
});

test('withProductionCsp: fn の throw は assertNoViolations の失敗に隠蔽されず元例外が伝播する', async ({
  browser,
}) => {
  await expect(
    withProductionCsp(browser, '/tools/uuid-v7', async (page, guard) => {
      // 違反を発生させた上で throw する: 仮にラッパが throw 後も
      // assertNoViolations を呼ぶ実装 (finally 内呼び出し等) に変わると
      // /CSP 違反/ が伝播してこの assert が fail する
      await injectCspViolation(page, guard);
      throw new Error('intentional-original');
    })
  ).rejects.toThrow('intentional-original');
});

test('withProductionCsp: contextOptions 未指定では既定の context を作る', async ({ browser }) => {
  const calls: Parameters<Browser['newContext']>[] = [];
  const observedBrowser = new Proxy(browser, {
    get(target, property) {
      if (property === 'newContext') {
        return async (...args: Parameters<Browser['newContext']>) => {
          calls.push(args);
          return target.newContext(...args);
        };
      }
      return Reflect.get(target, property);
    },
  });
  await withProductionCsp(observedBrowser, '/tools/uuid-v7', async (page) => {
    expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBe(0);
  });
  expect(calls).toEqual([[]]);
});

test('withProductionCsp: viewport と hasTouch は初回ナビゲーションから有効', async ({
  browser,
}) => {
  // 実 context に初期化スクリプトを追加し、callback より前の最初の文書で観測する。
  const observedBrowser = new Proxy(browser, {
    get(target, property) {
      if (property === 'newContext') {
        return async (...args: Parameters<Browser['newContext']>) => {
          const context = await target.newContext(...args);
          await context.addInitScript(() => {
            Object.assign(window, {
              initialContextState: {
                width: window.innerWidth,
                height: window.innerHeight,
                touch: navigator.maxTouchPoints,
              },
            });
          });
          return context;
        };
      }
      return Reflect.get(target, property);
    },
  });
  await withProductionCsp(
    observedBrowser,
    '/tools/uuid-v7',
    async (page, guard) => {
      const initialState = await page.evaluate(
        () => (window as unknown as { initialContextState: unknown }).initialContextState
      );
      expect(initialState).toEqual({ width: 390, height: 844, touch: 1 });
      expect(guard.violations).toHaveLength(0);
    },
    { contextOptions: touchOptions }
  );
});

test('withProductionCsp: contextOptions 指定時も終端で CSP 違反を検知する', async ({ browser }) => {
  await expect(
    withProductionCsp(
      browser,
      '/tools/uuid-v7',
      async (page, guard) => injectCspViolation(page, guard),
      { contextOptions: touchOptions }
    )
  ).rejects.toThrow(/CSP 違反/);
});

test('withProductionCsp: 未対応 bypassCSP は実行時にも無視する', async ({ browser }) => {
  const unsupportedOptions = { ...touchOptions, bypassCSP: true };
  await expect(
    withProductionCsp(
      browser,
      '/tools/uuid-v7',
      async (page, guard) => injectCspViolation(page, guard),
      { contextOptions: unsupportedOptions }
    )
  ).rejects.toThrow(/CSP 違反/);
});

test('withProductionCsp: contextOptions 指定時も元例外を伝播し context を閉じる', async ({
  browser,
}) => {
  let capturedPage: Page | undefined;
  await expect(
    withProductionCsp(
      browser,
      '/tools/uuid-v7',
      async (page, guard) => {
        capturedPage = page;
        await injectCspViolation(page, guard);
        throw new Error('intentional-options-original');
      },
      { contextOptions: touchOptions }
    )
  ).rejects.toThrow('intentional-options-original');
  expect(capturedPage).toBeDefined();
  expect(capturedPage!.isClosed()).toBe(true);
});
