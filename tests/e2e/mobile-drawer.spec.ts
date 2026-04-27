import { test, expect } from '@playwright/test';

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

test.describe('モバイルドロワー', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/tools/url-encode');
  });

  test('モバイルでハンバーガーボタンが表示される', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'メニューを開く' })).toBeVisible();
  });

  test('デスクトップではハンバーガーボタンが非表示', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await expect(page.getByRole('button', { name: 'メニューを開く' })).not.toBeVisible();
  });

  test('ハンバーガーボタンでドロワーが開く', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'ナビゲーション' });
    await expect(dialog).not.toBeVisible();

    await page.getByRole('button', { name: 'メニューを開く' }).click();

    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'メニューを閉じる' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'メニューを開く' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  test('閉じるボタンでドロワーが閉じる', async ({ page }) => {
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).toBeVisible();

    await page.getByRole('button', { name: 'メニューを閉じる' }).click();

    await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'メニューを開く' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  test('Escape キーでドロワーが閉じる', async ({ page }) => {
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).not.toBeVisible();
  });

  test('現在のツールがドロワー内でハイライトされる', async ({ page }) => {
    await page.getByRole('button', { name: 'メニューを開く' }).click();

    const currentLink = page
      .getByRole('dialog', { name: 'ナビゲーション' })
      .getByRole('link', { name: 'URLエンコード/デコード' });
    await expect(currentLink).toHaveAttribute('aria-current', 'page');
  });

  test('ドロワーのツールリンクで遷移できる', async ({ page }) => {
    await page.getByRole('button', { name: 'メニューを開く' }).click();

    await page
      .getByRole('dialog', { name: 'ナビゲーション' })
      .getByRole('link', { name: 'JWTデコーダー' })
      .click();

    await expect(page).toHaveURL('/tools/jwt-decoder');
  });

  test('背景クリックでドロワーが閉じる', async ({ page }) => {
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).toBeVisible();

    // ドロワーパネル (右 256px) より左側の背景部分をクリック
    await page.mouse.click(40, 400);

    await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).not.toBeVisible();
  });
});
