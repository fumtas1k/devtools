import { test, expect } from '@playwright/test';

test.describe('Link Styles', () => {
  test('privacy page link has correct color and hover color', async ({ page }) => {
    await page.goto('/privacy');
    const link = page.getByRole('link', { name: 'Cloudflare のプライバシーポリシー' });
    await expect(link).toBeVisible();

    // Normal state: --color-link is #2563eb (rgb(37, 99, 235))
    await expect(link).toHaveCSS('color', 'rgb(37, 99, 235)');

    // Hover state: --color-primary is #1a56db (rgb(26, 86, 219))
    await link.hover();
    // 遷移時間を考慮して少し待機
    await page.waitForTimeout(300);
    await expect(link).toHaveCSS('color', 'rgb(26, 86, 219)');
  });

  test('about page tool links have correct color', async ({ page }) => {
    await page.goto('/about');
    const link = page.locator('#main-content section ul li a').first();
    await expect(link).toBeVisible();

    await expect(link).toHaveCSS('color', 'rgb(37, 99, 235)');

    await link.hover();
    await page.waitForTimeout(300);
    await expect(link).toHaveCSS('color', 'rgb(26, 86, 219)');
  });

  test('tool layout breadcrumb link has correct color', async ({ page }) => {
    await page.goto('/tools/base64');
    const link = page.getByRole('link', { name: 'ホーム' });
    await expect(link).toBeVisible();

    await expect(link).toHaveCSS('color', 'rgb(37, 99, 235)');

    await link.hover();
    await page.waitForTimeout(300);
    await expect(link).toHaveCSS('color', 'rgb(26, 86, 219)');
  });

  test('index page tool card title and link have correct hover color', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.tool-card').first();
    const title = card.locator('h2');
    const link = card.locator('.text-link');

    await expect(card).toBeVisible();

    // Normal state
    await expect(title).toHaveCSS('color', 'rgb(17, 24, 39)');
    await expect(link).toHaveCSS('color', 'rgb(37, 99, 235)');

    // Hover state
    await card.hover();
    await page.waitForTimeout(300);
    await expect(title).toHaveCSS('color', 'rgb(26, 86, 219)');

    // リンク自体をホバー
    await link.hover();
    await page.waitForTimeout(300);
    await expect(link).toHaveCSS('color', 'rgb(26, 86, 219)');
  });
});
