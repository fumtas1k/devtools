import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

const SUCCESS_COLOR = 'rgb(22, 163, 74)';

test.describe('CopyButton', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/tools/jan-code');
    await page.getByRole('button', { name: 'サンプルを入力' }).waitFor();
    await waitForReactHydration(page);
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
  });

  test('コピー成功時にボタン幅が変化しない', async ({ page }) => {
    const button = page.getByRole('button', { name: 'コピー' }).first();
    await button.waitFor({ state: 'visible' });

    const before = await button.boundingBox();
    await button.click();
    await button.locator('[aria-live="polite"]').waitFor();
    const after = await button.boundingBox();

    expect(before?.width).toBe(after?.width);
  });

  test('コピー成功時に緑色に切り替わる', async ({ page }) => {
    const button = page.getByRole('button', { name: 'コピー' }).first();
    await button.waitFor({ state: 'visible' });

    await expect(button).not.toHaveCSS('color', SUCCESS_COLOR);

    await button.click();
    await button.locator('[aria-live="polite"]').waitFor();

    await expect(button).toHaveCSS('color', SUCCESS_COLOR);
  });

  test('コピー成功時に aria-live 領域が「コピーしました」を返す', async ({ page }) => {
    const button = page.getByRole('button', { name: 'コピー' }).first();
    await button.waitFor({ state: 'visible' });

    const liveRegion = button.locator('[aria-live="polite"]');
    await expect(liveRegion).toHaveCount(0);

    await button.click();
    await expect(liveRegion).toHaveText('コピーしました');
  });

  test('2 秒後に idle 状態に戻る', async ({ page }) => {
    const button = page.getByRole('button', { name: 'コピー' }).first();
    await button.waitFor({ state: 'visible' });

    await button.click();
    const liveRegion = button.locator('[aria-live="polite"]');
    await expect(liveRegion).toHaveText('コピーしました');

    await expect(liveRegion).toHaveCount(0);
    await expect(button).not.toHaveCSS('color', SUCCESS_COLOR);
  });
});
