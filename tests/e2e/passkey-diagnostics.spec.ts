import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { passkeyCredentialCalls: 0 });
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: async () => false,
        isConditionalMediationAvailable: async () => true,
      },
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        create: () => {
          Object.assign(window, { passkeyCredentialCalls: 1 });
          throw new Error('登録は禁止');
        },
        get: () => {
          Object.assign(window, { passkeyCredentialCalls: 1 });
          throw new Error('認証は禁止');
        },
      },
    });
  });
  await page.goto('/tools/passkey-diagnostics');
  await waitForReactHydration(page);
});

test('対応状況の違いと制限を示し、再確認できる', async ({ page }) => {
  expect(await page.evaluate(() => Reflect.get(window, 'passkeyCredentialCalls'))).toBe(0);
  await expect(page.getByRole('region', { name: '端末内の認証器' })).toContainText('非対応');
  await expect(
    page.getByRole('region', { name: 'パスキーの自動入力' }).getByText('対応', { exact: true })
  ).toBeVisible();
  await expect(page.getByText('保存・外部送信しません。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '再確認する' }).click();
  await expect(page.getByRole('button', { name: '再確認する' })).toBeEnabled();
  expect(await page.evaluate(() => Reflect.get(window, 'passkeyCredentialCalls'))).toBe(0);
});

test('タイムアウトした旧問い合わせが再試行を上書きしない', async ({ page }) => {
  await page.evaluate(() => {
    window.PublicKeyCredential.isConditionalMediationAvailable = () =>
      new Promise((resolve) => {
        Object.assign(window, { finishOldPasskeyQuery: resolve });
      });
  });
  await page.getByRole('button', { name: '再確認する' }).click();
  await expect(page.getByRole('region', { name: 'パスキーの自動入力' })).toContainText(
    '3 秒以内に応答がありません'
  );
  await page.evaluate(() => {
    window.PublicKeyCredential.isConditionalMediationAvailable = async () => false;
  });
  await page.getByRole('button', { name: '再確認する' }).click();
  const section = page.getByRole('region', { name: 'パスキーの自動入力' });
  await expect(section.getByText('非対応', { exact: true })).toBeVisible();
  await page.evaluate(() => Reflect.get(window, 'finishOldPasskeyQuery')(true));
  await expect(section.getByText('非対応', { exact: true })).toBeVisible();
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`診断の表示と再確認 ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('button', { name: '再確認する' })).toBeEnabled();
    await expect(page.getByRole('region', { name: '端末内の認証器' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`diagnostics-${viewport.width}.png`),
      fullPage: true,
    });
  });
}

test('失敗・API 不在を判定不可として再試行する（陽性対照）', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: async () => {
          throw new Error('test failure');
        },
      },
    });
  });
  await page.getByRole('button', { name: '再確認する' }).click();
  await expect(page.getByRole('region', { name: '端末内の認証器' })).toContainText(
    '問い合わせに失敗'
  );
  await expect(page.getByRole('region', { name: 'パスキーの自動入力' })).toContainText(
    '問い合わせ API がありません'
  );
  await page.reload();
  await waitForReactHydration(page);
  await expect(page.getByRole('region', { name: '端末内の認証器' })).toContainText('非対応');
});
