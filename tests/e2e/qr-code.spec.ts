import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('QRコード生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/qr-code');
    await page.getByLabel('テキスト / URL').waitFor();
    await waitForReactHydration(page);
  });

  test('テキスト入力でQRコードが生成される', async ({ page }) => {
    const input = page.getByLabel('テキスト / URL');
    await input.fill('https://example.com');

    // プレビュー領域が表示され、SVGが含まれていることを確認
    const preview = page.getByText('プレビュー');
    await expect(preview).toBeVisible();

    const qrContainer = page.getByTestId('qr-code-container');
    await expect(qrContainer).toBeVisible();
    await expect(qrContainer.locator('svg')).toBeVisible();
  });

  test('誤り訂正レベルを切り替えられる', async ({ page }) => {
    await page.getByLabel('テキスト / URL').fill('Test Text');

    // デフォルトは M
    await expect(page.getByText('復元率: 15%')).toBeVisible();

    // H に切り替え
    await page.getByRole('button', { name: 'H' }).click();
    await expect(page.getByText('復元率: 30%')).toBeVisible();

    // Q に切り替え
    await page.getByRole('button', { name: 'Q' }).click();
    await expect(page.getByText('復元率: 25%')).toBeVisible();

    // L に切り替え
    await page.getByRole('button', { name: 'L' }).click();
    await expect(page.getByText('復元率: 7%')).toBeVisible();
  });

  test('サンプルテキストを挿入できる', async ({ page }) => {
    await page.getByRole('button', { name: 'サンプル' }).click();
    await expect(page.getByLabel('テキスト / URL')).toHaveValue('https://example.com');
    await expect(page.getByTestId('qr-code-container')).toBeVisible();
  });

  test('テキストを空にするとプレビューが消える', async ({ page }) => {
    const input = page.getByLabel('テキスト / URL');
    await input.fill('Hello');
    await expect(page.getByTestId('qr-code-container')).toBeVisible();

    await input.fill('');
    await expect(page.getByTestId('qr-code-container')).not.toBeVisible();
    await expect(page.getByText('プレビュー')).not.toBeVisible();
  });

  test('ダウンロードボタンが存在する', async ({ page }) => {
    await page.getByLabel('テキスト / URL').fill('https://example.com');
    const downloadButton = page.getByRole('button', { name: 'SVG ダウンロード' });
    await expect(downloadButton).toBeVisible();
    await expect(downloadButton).toBeEnabled();
  });
});
