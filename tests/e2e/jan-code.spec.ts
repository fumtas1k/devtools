import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('JANコード生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/jan-code');
    await page.getByRole('button', { name: 'サンプルを入力' }).waitFor();
    await waitForReactHydration(page);
  });

  test('JAN-13: サンプルボタンで結果が表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    // exact: true で説明文との誤マッチを防ぐ
    await expect(page.getByText('チェックディジット', { exact: true })).toBeVisible();
    await expect(page.getByText('完成コード', { exact: true })).toBeVisible();
  });

  test('JAN-13: 12桁入力でチェックディジットと完成コードが表示される', async ({ page }) => {
    // pressSequentially で React の onChange を確実に発火させる
    await page.locator('#jan-input').pressSequentially('490123456789');
    await expect(page.getByText('チェックディジット', { exact: true })).toBeVisible();
    await expect(page.getByText('完成コード', { exact: true })).toBeVisible();
  });

  test('JAN-13: 完成コードは13桁', async ({ page }) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.getByText('完成コード', { exact: true })).toBeVisible();
    // 結果エリア全体に13桁数字が含まれることを確認
    await expect(page.locator('span').filter({ hasText: /^\d{13}$/ }).first()).toBeVisible();
  });

  test('JAN-13: 数字以外の入力でエラーを表示する', async ({ page }) => {
    await page.locator('#jan-input').pressSequentially('abc');
    await expect(page.getByRole('alert')).toContainText('数字のみ入力してください');
  });

  test('JAN-13: 入力が不完全な場合は結果を表示しない', async ({ page }) => {
    await page.locator('#jan-input').pressSequentially('490');
    await expect(page.getByText('チェックディジット', { exact: true })).not.toBeVisible();
  });

  test('JAN-8: モード切替後にサンプルで結果が表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'JAN-8' }).click();
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.getByText('チェックディジット', { exact: true })).toBeVisible();
    // 完成コードは8桁
    await expect(page.locator('span').filter({ hasText: /^\d{8}$/ }).first()).toBeVisible();
  });
});
