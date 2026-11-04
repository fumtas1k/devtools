import { readFile } from 'node:fs/promises';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { applyProductionCsp, waitForReactHydration } from '../e2e/helpers';

const modes = ['load', 'domcontentloaded'] as const;

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

async function record(page: Page, info: TestInfo, measurements: Record<string, unknown>) {
  const timing = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return {
      domContentLoadedEventEnd: entry.domContentLoadedEventEnd,
      loadEventEnd: entry.loadEventEnd,
      readyState: document.readyState,
    };
  });
  await info.attach('navigation.json', {
    body: JSON.stringify({ ...measurements, timing }, null, 2),
    contentType: 'application/json',
  });
}

async function encode(page: Page) {
  await page.getByLabel('入力', { exact: true }).fill('Hello');
  await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8=');
}

async function download(page: Page, info: TestInfo, name: string) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const result = await event;
  const path = info.outputPath(result.suggestedFilename());
  await result.saveAs(path);
  expect(await result.failure()).toBeNull();
  return readFile(path);
}

for (const waitUntil of modes) {
  for (const path of [
    '/tools/base64',
    '/tools/json-csv',
    '/tools/qr-code',
    '/tools/jan-code',
    '/about',
  ]) {
    test(`通常 ${waitUntil} ${path}`, async ({ browser }, info) => {
      // 共通 helper と同じ fresh context + production CSP。waitUntil だけ比較する。
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        const guard = await applyProductionCsp(page);
        const start = performance.now();
        const response = await page.goto(path, { waitUntil });
        expect(response?.status()).toBe(200);
        const navigationMs = performance.now() - start;
        if (path !== '/about') await waitForReactHydration(page);
        const readyMs = performance.now() - start;

        if (path === '/tools/base64') await encode(page);
        if (path === '/tools/json-csv') {
          await page.getByLabel('入力', { exact: true }).fill('[{"id":1}]');
          await expect(page.getByLabel('変換結果')).toHaveValue('id\n1');
          expect((await download(page, info, 'CSVダウンロード')).toString('utf8')).toContain(
            'id\r\n1'
          );
        }
        if (path === '/tools/qr-code') {
          await page.getByLabel('テキスト / URL').fill('https://example.com');
          await expect(page.getByTestId('qr-code-container').locator('svg')).toBeVisible();
          expect((await download(page, info, 'SVGダウンロード')).toString('utf8')).toContain(
            '<svg'
          );
        }
        if (path === '/tools/jan-code') {
          await page.getByRole('button', { name: 'サンプルを入力' }).click();
          await expect(page.getByTestId('jan-code-result')).toBeVisible();
          const png = await download(page, info, 'PNGダウンロード');
          expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        }
        if (path === '/about') await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        await record(page, info, {
          path,
          waitUntil,
          navigationMs,
          readyMs,
          checkedMs: performance.now() - start,
        });
        guard.assertNoViolations();
      } finally {
        await context.close();
      }
    });
  }

  test(`遅延画像 ${waitUntil}: DOM 到達と画像完了を区別する`, async ({ browser }, info) => {
    const context = await browser.newContext();
    const held = barrier();
    let requestSeen = false;
    try {
      const page = await context.newPage();
      // 同一 origin の eager 画像を診断時だけ挿入。既存アセットと CSP は変更しない。
      const guard = await applyProductionCsp(page, {
        transformBody: (body) =>
          body.replace(
            '</body>',
            '<img id="diagnostic-image" src="/__diagnostics__/held.svg" alt="診断用画像"></body>'
          ),
      });
      await page.route('**/__diagnostics__/held.svg', async (route) => {
        requestSeen = true;
        await held.promise;
        await route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
        });
      });
      const dom = page.waitForEvent('domcontentloaded');
      let navigationDone = false;
      const start = performance.now();
      const navigation = page.goto('/tools/base64', { waitUntil }).then((response) => {
        navigationDone = true;
        return response;
      });
      // 後続 assertion が失敗しても cleanup まで未処理 rejection を残さない。
      void navigation.catch(() => {});
      await dom;
      await expect.poll(() => requestSeen).toBe(true);
      await waitForReactHydration(page);
      await encode(page);
      if (waitUntil === 'domcontentloaded') await navigation;
      expect(navigationDone).toBe(waitUntil === 'domcontentloaded');
      expect(
        await page.locator('#diagnostic-image').evaluate((el) => (el as HTMLImageElement).complete)
      ).toBe(false);
      await record(page, info, {
        waitUntil,
        navigationDone,
        imageHeld: true,
        checkedMs: performance.now() - start,
      });

      held.release();
      expect((await navigation)?.status()).toBe(200);
      await page.waitForLoadState('load');
      await page.locator('#diagnostic-image').evaluate((el) => (el as HTMLImageElement).decode());
      expect(
        await page
          .locator('#diagnostic-image')
          .evaluate((el) => (el as HTMLImageElement).naturalWidth)
      ).toBe(1);
      guard.assertNoViolations();
    } finally {
      held.release();
      await context.close();
    }
  });

  test(`遅延 React ${waitUntil}: navigation だけでは操作準備が完了しない`, async ({
    browser,
  }, info) => {
    const context = await browser.newContext();
    const held = barrier();
    let requestSeen = false;
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      // Astro island が動的 import する実際のコンポーネントを保留する。
      await page.route('**/_astro/Base64Codec.*.js', async (route) => {
        requestSeen = true;
        await held.promise;
        await route.continue();
      });
      expect((await page.goto('/tools/base64', { waitUntil }))?.status()).toBe(200);
      await expect.poll(() => requestSeen).toBe(true);
      const input = page.getByLabel('入力', { exact: true });
      await expect(input).toBeVisible();
      await input.fill('premature');
      await expect(input).toHaveValue('premature');
      // SSR の入力は可視・編集可能でも React に届かず、変換されない。
      await expect(page.getByLabel('変換結果')).toHaveValue('');
      let hydrated = false;
      const hydration = waitForReactHydration(page).then(() => {
        hydrated = true;
      });
      void hydration.catch(() => {});
      await record(page, info, { waitUntil, componentHeld: true, hydrated, prematureOutput: '' });
      expect(hydrated).toBe(false);

      held.release();
      await hydration;
      await input.fill('');
      await encode(page);
      guard.assertNoViolations();
    } finally {
      held.release();
      await context.close();
    }
  });
}
