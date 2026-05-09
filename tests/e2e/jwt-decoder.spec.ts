import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// jwt.io のサンプル JWT（HS256）
const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

test.describe('JWTデコーダー（production CSP 適用）', () => {
  test('有効なJWTをデコードしてHeader・Payloadセクションを表示する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.getByLabel('JWTトークンを貼り付け').fill(SAMPLE_JWT);
      await expect(page.getByRole('heading', { name: 'Header (JOSE)' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Payload (Claims)' })).toBeVisible();
    });
  });

  test('Headerに alg と typ が含まれる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.getByLabel('JWTトークンを貼り付け').fill(SAMPLE_JWT);
      await expect(page.getByRole('heading', { name: 'Header (JOSE)' })).toBeVisible();
      await expect(page.getByTestId('jwt-header')).toContainText('"HS256"');
      await expect(page.getByTestId('jwt-header')).toContainText('"JWT"');
    });
  });

  test('Payloadに sub と name が含まれる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.getByLabel('JWTトークンを貼り付け').fill(SAMPLE_JWT);
      await expect(page.getByRole('heading', { name: 'Payload (Claims)' })).toBeVisible();
      await expect(page.getByTestId('jwt-payload')).toContainText('"1234567890"');
      await expect(page.getByTestId('jwt-payload')).toContainText('"John Doe"');
    });
  });

  test('不正なJWTでエラーメッセージを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.getByLabel('JWTトークンを貼り付け').fill('not-a-valid-jwt');
      await expect(page.getByRole('alert')).toContainText('有効なJWTトークンではありません');
    });
  });

  test('サンプルボタンでJWTが生成・デコードされる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await expect(page.getByRole('heading', { name: 'Header (JOSE)' })).toBeVisible();
      await expect(page.getByLabel('JWTトークンを貼り付け')).not.toHaveValue('');
    });
  });

  test('入力クリアでデコード結果が消える（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.getByLabel('JWTトークンを貼り付け').fill(SAMPLE_JWT);
      await expect(page.getByRole('heading', { name: 'Header (JOSE)' })).toBeVisible();
      await page.getByLabel('JWTトークンを貼り付け').fill('');
      await expect(page.getByRole('heading', { name: 'Header (JOSE)' })).not.toBeVisible();
    });
  });
});
