import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

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
    await button.locator('[role="status"]').filter({ hasText: 'コピーしました' }).waitFor({ timeout: 2000 });
    const after = await button.boundingBox();

    expect(before?.width).toBe(after?.width);
  });

  test('コピー成功時に CheckIcon（polyline）に切り替わる', async ({ page }) => {
    const button = page.getByRole('button', { name: 'コピー' }).first();
    await button.waitFor({ state: 'visible' });

    await expect(button.locator('rect')).toBeVisible();

    await button.click();
    await button.locator('[role="status"]').filter({ hasText: 'コピーしました' }).waitFor({ timeout: 2000 });

    await expect(button.locator('polyline')).toBeVisible();
    await expect(button.locator('rect')).not.toBeVisible();
  });

  test('コピー成功時に aria-live 領域が「コピーしました」を返す', async ({ page }) => {
    const button = page.getByRole('button', { name: 'コピー' }).first();
    await button.waitFor({ state: 'visible' });

    const liveRegion = button.locator('[role="status"]');
    await expect(liveRegion).toHaveCount(0);

    await button.click();
    await expect(liveRegion).toHaveText('コピーしました', { timeout: 2000 });
  });

  test('2 秒後に idle 状態（ClipboardIcon）に戻る', async ({ page }) => {
    const button = page.getByRole('button', { name: 'コピー' }).first();
    await button.waitFor({ state: 'visible' });

    await button.click();
    const liveRegion = button.locator('[role="status"]');
    await expect(liveRegion).toHaveText('コピーしました', { timeout: 2000 });

    await expect(liveRegion).toHaveCount(0, { timeout: 3000 });
    await expect(button.locator('rect')).toBeVisible();
  });
});
