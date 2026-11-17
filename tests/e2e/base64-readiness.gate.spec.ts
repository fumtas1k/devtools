import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';
import { waitForBase64Interaction } from './base64-readiness';

for (const mode of ['エンコード', 'デコード'] as const) {
  test(`Base64 の操作が遮断されている間は準備完了せず、解除後に${mode}できる`, async ({
    browser,
  }) => {
    await withProductionCsp(
      browser,
      '/tools/base64',
      async (page) => {
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-test-block-click', 'true');
          document.addEventListener(
            'click',
            (event) => {
              if (
                (event.target as Element).closest('button')?.textContent === 'URL-safe' &&
                document.documentElement.getAttribute('data-test-block-click') === 'true'
              ) {
                const root = document.documentElement;
                const count = Number(root.getAttribute('data-test-click-count') ?? '0');
                root.setAttribute('data-test-click-count', String(count + 1));
                event.stopImmediatePropagation();
              }
            },
            true
          );
        });

        let completed = false;
        const readiness = waitForBase64Interaction(page).then(() => {
          completed = true;
        });
        void readiness.catch(() => {});
        // 2 回目の click で最初の操作が返り、再試行されたことを確認する。
        await expect
          .poll(async () =>
            Number(await page.locator('html').getAttribute('data-test-click-count'))
          )
          .toBeGreaterThanOrEqual(2);
        expect(completed).toBe(false);
        await expect(page.getByRole('button', { name: 'URL-safe' })).toHaveAttribute(
          'aria-pressed',
          'false'
        );

        await page
          .locator('html')
          .evaluate((root) => root.setAttribute('data-test-block-click', 'false'));
        await readiness;
        await expect(page.getByRole('button', { name: '標準', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true'
        );
        if (mode === 'デコード') {
          await page.getByRole('button', { name: 'デコード' }).click();
        }
        await page.getByLabel('入力').fill(mode === 'エンコード' ? 'Hello' : 'SGVsbG8=');
        await expect(page.getByLabel('変換結果')).toHaveValue(
          mode === 'エンコード' ? 'SGVsbG8=' : 'Hello'
        );
      },
      { skipHydration: true }
    );
  });
}
