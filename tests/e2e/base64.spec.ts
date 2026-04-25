import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('Base64 エンコード/デコード', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/base64');
    await page.getByLabel('入力').waitFor();
    await waitForReactHydration(page);
  });

  test('標準形式でエンコードできる', async ({ page }) => {
    await page.getByLabel('入力').fill('Hello');
    await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8=');
  });

  test('標準形式でデコードできる', async ({ page }) => {
    await page.getByRole('button', { name: 'デコード' }).click();
    await page.getByLabel('入力').fill('SGVsbG8=');
    await expect(page.getByLabel('変換結果')).toHaveValue('Hello');
  });

  test('URL-safe 形式でエンコードできる（パディングなし）', async ({ page }) => {
    await page.getByRole('button', { name: 'URL-safe' }).click();
    await page.getByLabel('入力').fill('Hello');
    await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8');
  });

  test('モード切替時に入力が保持される', async ({ page }) => {
    await page.getByLabel('入力').fill('Hello');
    await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8=');

    await page.getByRole('button', { name: 'デコード' }).click();

    await expect(page.getByLabel('入力')).toHaveValue('Hello');
  });

  test('形式切替時に入力が保持され出力が再計算される', async ({ page }) => {
    await page.getByLabel('入力').fill('Hello');
    await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8=');

    await page.getByRole('button', { name: 'URL-safe' }).click();

    await expect(page.getByLabel('入力')).toHaveValue('Hello');
    await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8');
  });

  test('不正な入力でエラーメッセージを表示する', async ({ page }) => {
    await page.getByRole('button', { name: 'デコード' }).click();
    await page.getByLabel('入力').fill('!!!invalid!!!');
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('クリアボタンで入力・出力がリセットされる', async ({ page }) => {
    await page.getByLabel('入力').fill('Hello');
    await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8=');

    await page.getByRole('button', { name: 'クリア' }).click();

    await expect(page.getByLabel('入力')).toHaveValue('');
    await expect(page.getByLabel('変換結果')).toHaveValue('');
  });
});
