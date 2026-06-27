import { test, expect } from '@playwright/test';

test.describe('日本語ダミー個人データ生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/dummy-personal-data');
  });

  test('生成するとプレビュー表が表示される', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('status')).toContainText('生成しました');
    // ヘッダに氏名列
    await expect(page.getByRole('columnheader', { name: '氏名' })).toBeVisible();
    // 先頭行が存在
    const rows = page.getByRole('row');
    expect(await rows.count()).toBeGreaterThan(1);
  });

  test('項目 OFF でプレビュー列が消える', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('columnheader', { name: 'メールアドレス' })).toBeVisible();
    await page.getByRole('button', { name: 'メールアドレス' }).click(); // ToggleChips OFF
    await expect(page.getByRole('columnheader', { name: 'メールアドレス' })).toHaveCount(0);
  });

  test('生成前はダウンロードが無効', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'ダウンロード' })).toBeDisabled();
  });
});
