import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('Base64 エンコード/デコード（production CSP 適用）', () => {
  test('標準形式でエンコードできる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      await page.getByLabel('入力').fill('Hello');
      await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8=');
    });
  });

  test('標準形式でデコードできる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      await page.getByRole('button', { name: 'デコード' }).click();
      await page.getByLabel('入力').fill('SGVsbG8=');
      await expect(page.getByLabel('変換結果')).toHaveValue('Hello');
    });
  });

  test('URL-safe 形式でエンコードできる（パディングなし、CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      await page.getByRole('button', { name: 'URL-safe' }).click();
      await page.getByLabel('入力').fill('Hello');
      await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8');
    });
  });

  test('モード切替時に入力・出力がリセットされる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      await page.getByLabel('入力').fill('Hello');
      await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8=');

      await page.getByRole('button', { name: 'デコード' }).click();

      await expect(page.getByLabel('入力')).toHaveValue('');
      await expect(page.getByLabel('変換結果')).toHaveValue('');
    });
  });

  test('形式切替時に入力が保持され出力が再計算される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      await page.getByLabel('入力').fill('Hello');
      await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8=');

      await page.getByRole('button', { name: 'URL-safe' }).click();

      await expect(page.getByLabel('入力')).toHaveValue('Hello');
      await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8');
    });
  });

  test('不正な入力でエラーメッセージを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      await page.getByRole('button', { name: 'デコード' }).click();
      await page.getByLabel('入力').fill('!!!invalid!!!');
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });

  test('クリアボタンで入力・出力がリセットされる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      await page.getByLabel('入力').fill('Hello');
      await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8=');

      await page.getByRole('button', { name: 'クリア' }).click();

      await expect(page.getByLabel('入力')).toHaveValue('');
      await expect(page.getByLabel('変換結果')).toHaveValue('');
    });
  });
});
