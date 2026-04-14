import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('URLエンコード/デコード', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/url-encode');
    await page.getByLabel('入力').waitFor();
    await waitForReactHydration(page);
  });

  test('日本語テキストをエンコードできる', async ({ page }) => {
    await page.getByLabel('入力').click();
    await page.keyboard.type('テスト');
    await expect(page.locator('textarea[aria-label="変換結果"]')).toHaveValue(/%E3%83%86%E3%82%B9%E3%83%88/);
  });

  test('URLをエンコードできる', async ({ page }) => {
    await page.getByLabel('入力').pressSequentially('https://example.com/?q=テスト');
    await expect(page.locator('textarea[aria-label="変換結果"]')).toHaveValue(/https%3A%2F%2Fexample\.com/);
  });

  test('デコードモードでデコードできる', async ({ page }) => {
    await page.getByRole('button', { name: 'デコード' }).click();
    await page.getByLabel('入力').fill('%E3%83%86%E3%82%B9%E3%83%88');
    await expect(page.locator('textarea[aria-label="変換結果"]')).toHaveValue('テスト');
  });

  test('不正なエンコード文字列でエラーメッセージを表示する', async ({ page }) => {
    await page.getByRole('button', { name: 'デコード' }).click();
    await page.getByLabel('入力').fill('%GG');
    await expect(page.getByRole('alert')).toContainText('不正なURLエンコード文字列です');
  });

  test('サンプルボタンで入力が埋まり出力が表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.getByLabel('入力')).not.toHaveValue('');
    await expect(page.locator('textarea[aria-label="変換結果"]')).not.toHaveValue('');
  });

  test('クリアボタンで入力・出力がリセットされる', async ({ page }) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.locator('textarea[aria-label="変換結果"]')).not.toHaveValue('');
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(page.getByLabel('入力')).toHaveValue('');
  });
});
