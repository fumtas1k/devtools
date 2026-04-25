import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('GS1 DataBar 生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/gs1-databar');
    await waitForReactHydration(page);
  });

  test('ページが正しく表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'GS1 DataBar 生成' })).toBeVisible();
    await expect(page.getByLabel('AI コード 1')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ フィールド追加' })).toBeVisible();
  });

  test('AI コード Select のデフォルト値が正しい', async ({ page }) => {
    // 初期フィールドは賞味/消費期限(17) と ロット番号(10)
    await expect(page.getByLabel('AI コード 1')).toHaveValue('17');
    await expect(page.getByLabel('AI コード 2')).toHaveValue('10');
  });

  test('別フィールドで選択済みの AI は disabled になる', async ({ page }) => {
    // 1 行目は '17'（賞味/消費期限）、2 行目は '10'（ロット番号）
    // 2 行目 Select で '17' の option は disabled のはず
    const opt17InSelect2 = page.getByLabel('AI コード 2').getByRole('option', { name: '賞味/消費期限 (17)' });
    await expect(opt17InSelect2).toBeDisabled();

    // 2 行目 Select で '10' の option は disabled でない
    const opt10InSelect2 = page.getByLabel('AI コード 2').getByRole('option', { name: 'ロット番号 (10)' });
    await expect(opt10InSelect2).toBeEnabled();
  });

  test('1 行目の AI を変更すると 2 行目の disabled が連動する', async ({ page }) => {
    // 初期状態: Select1='17', Select2='10'。未使用の '11'（製造日）を 1 行目に選択
    await page.locator('select[aria-label="AI コード 1"]').selectOption('11');
    await expect(page.locator('select[aria-label="AI コード 1"]')).toHaveValue('11');

    // React 再レンダリング後に '11' が Select 2 で disabled になるのを待つ
    await page.waitForFunction(() => {
      const opt = document.querySelector('select[aria-label="AI コード 2"] option[value="11"]') as HTMLOptionElement | null;
      return opt?.disabled === true;
    });

    // '17' は 2 行目で enabled になる（current の '10' は現在の field.ai なので enabled）
    const opt17Disabled = await page
      .locator('select[aria-label="AI コード 2"] option[value="17"]')
      .evaluate((el) => (el as HTMLOptionElement).disabled);
    expect(opt17Disabled).toBe(false);
  });

  test('削除ボタンでフィールドが減る', async ({ page }) => {
    // 初期状態: 2 フィールド
    await expect(page.locator('select[aria-label="AI コード 1"]')).toBeVisible();
    await expect(page.locator('select[aria-label="AI コード 2"]')).toBeVisible();

    // 1 行目の削除（evaluate 経由で確実にクリック）
    await page.evaluate(() => {
      (document.querySelector('button[aria-label="フィールドを削除"]') as HTMLElement)?.click();
    });

    // React 再レンダリング後に Select 2 が消えるのを待つ
    await page.waitForFunction(
      () => !document.querySelector('select[aria-label="AI コード 2"]'),
      undefined,
      { timeout: 5000 }
    );

    await expect(page.locator('select[aria-label="AI コード 1"]')).toBeVisible();
  });

  test('+ フィールド追加でフィールドが増える', async ({ page }) => {
    // 初期状態: 2 フィールド。1 行削除してから追加
    await page.getByRole('button', { name: 'フィールドを削除' }).first().click();
    await expect(page.getByLabel('AI コード 1')).toBeVisible();

    await page.getByRole('button', { name: '+ フィールド追加' }).click();
    await expect(page.getByLabel('AI コード 2')).toBeVisible();
  });
});
