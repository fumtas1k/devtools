import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/tools/webauthn-decoder');
  await waitForReactHydration(page);
});

test('合成登録・認証レスポンスと RP ID を解析する', async ({ page }) => {
  const result = page.getByRole('region', { name: '解析結果' });
  await page.getByRole('button', { name: '登録の合成サンプル' }).click();
  await page.getByRole('button', { name: '解析する' }).click();
  await expect(result).toContainText('webauthn.create');
  await expect(result).toContainText('https://example.test');
  await expect(result).toContainText('UP（ユーザーの存在）: あり');
  await expect(result).toContainText('UV（ユーザー検証）: あり');
  await expect(result).toContainText('BE（バックアップ可能）: あり');
  await expect(result).toContainText('BS（バックアップ済み）: あり');
  await expect(result).toContainText('一致');
  await page.getByRole('button', { name: '認証の合成サンプル' }).click();
  await page.getByLabel('想定 RP ID（任意）').fill('other.test');
  await page.getByRole('button', { name: '解析する' }).click();
  await expect(result).toContainText('webauthn.get');
  await expect(result).toContainText('不一致');
});

test('不正入力をエラーにし、出力をテキストとして扱う', async ({ page }) => {
  await page.getByLabel('レスポンス JSON（必須）').fill('{');
  await page.getByRole('button', { name: '解析する' }).click();
  await expect(page.getByRole('alert')).toContainText('JSON が不正');
  await page.getByRole('button', { name: '認証の合成サンプル' }).click();
  const client = btoa(
    JSON.stringify({ type: 'webauthn.get', origin: '<img src=x onerror=alert(1)>' })
  )
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const sample = JSON.parse(await page.getByLabel('レスポンス JSON（必須）').inputValue());
  sample.response.clientDataJSON = client;
  await page.getByLabel('レスポンス JSON（必須）').fill(JSON.stringify(sample));
  await page.getByRole('button', { name: '解析する' }).click();
  await expect(page.getByRole('region', { name: '解析結果' })).toContainText(
    '<img src=x onerror=alert(1)>'
  );
  await expect(page.getByRole('region', { name: '解析結果' }).locator('img')).toHaveCount(0);
});
