import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

const SUCCESS_COLOR = 'rgb(22, 163, 74)';

async function setupJanCodeWithSample(page: import('@playwright/test').Page): Promise<void> {
  // CopyButton を表示するため /tools/jan-code でサンプル入力 → 結果を生成
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'サンプルを入力' }).click();
}

test.describe('CopyButton（production CSP 適用）', () => {
  test('コピー成功時にボタン幅が変化しない（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await setupJanCodeWithSample(page);
      const button = page.getByRole('button', { name: 'コピー' }).first();
      await button.waitFor({ state: 'visible' });

      const before = await button.boundingBox();
      await button.click();
      await button.getByRole('status').waitFor();
      const after = await button.boundingBox();

      expect(before?.width).toBe(after?.width);
    });
  });

  test('コピー成功時に緑色に切り替わる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await setupJanCodeWithSample(page);
      const button = page.getByRole('button', { name: 'コピー' }).first();
      await button.waitFor({ state: 'visible' });

      await expect(button).not.toHaveCSS('color', SUCCESS_COLOR);

      await button.click();
      await button.getByRole('status').waitFor();

      await expect(button).toHaveCSS('color', SUCCESS_COLOR);
    });
  });

  test('コピー成功時に aria-live 領域が「コピーしました」を返す（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await setupJanCodeWithSample(page);
      const button = page.getByRole('button', { name: 'コピー' }).first();
      await button.waitFor({ state: 'visible' });

      const liveRegion = button.getByRole('status');
      await expect(liveRegion).toHaveCount(0);

      await button.click();
      await expect(liveRegion).toHaveText('コピーしました');
    });
  });

  test('2 秒後に idle 状態に戻る（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await setupJanCodeWithSample(page);
      const button = page.getByRole('button', { name: 'コピー' }).first();
      await button.waitFor({ state: 'visible' });

      await button.click();
      const liveRegion = button.getByRole('status');
      await expect(liveRegion).toHaveText('コピーしました');

      await expect(liveRegion).toHaveCount(0);
      await expect(button).not.toHaveCSS('color', SUCCESS_COLOR);
    });
  });
});
