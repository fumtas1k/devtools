import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('JSON / CSV 変換', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/json-csv');
    await page.getByLabel('入力').waitFor();
    await waitForReactHydration(page);
  });

  test('JSON → CSV: サンプルデータを変換できる', async ({ page }) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.getByLabel('変換結果')).not.toHaveValue('');
    await expect(page.getByLabel('変換結果')).toHaveValue(/id/);
    await expect(page.getByLabel('変換結果')).toHaveValue(/name/);
  });

  test('JSON → CSV: フラットなJSONをCSVに変換する', async ({ page }) => {
    await page.getByLabel('入力').fill('[{"id":1,"name":"太郎"},{"id":2,"name":"花子"}]');
    await expect(page.getByLabel('変換結果')).toHaveValue(/id,name/);
    await expect(page.getByLabel('変換結果')).toHaveValue(/太郎/);
    await expect(page.getByLabel('変換結果')).toHaveValue(/花子/);
  });

  test('JSON → CSV: ネストオブジェクトをドット記法でフラット化する', async ({ page }) => {
    await page.getByLabel('入力').fill('[{"name":"太郎","address":{"city":"東京"}}]');
    await expect(page.getByLabel('変換結果')).toHaveValue(/address\.city/);
    await expect(page.getByLabel('変換結果')).toHaveValue(/東京/);
  });

  test('JSON → CSV: 不正なJSONでエラーを表示する', async ({ page }) => {
    await page.getByLabel('入力').fill('not valid json');
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('CSV → JSON: サンプルデータを変換できる', async ({ page }) => {
    await page.getByRole('button', { name: 'CSV → JSON' }).click();
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.getByLabel('変換結果')).not.toHaveValue('');
    await expect(page.getByLabel('変換結果')).toHaveValue(/\[/);
  });

  test('CSV → JSON: CSVをJSONに変換する', async ({ page }) => {
    await page.getByRole('button', { name: 'CSV → JSON' }).click();
    await page.getByLabel('入力').fill('id,name\n1,太郎\n2,花子');
    await expect(page.getByLabel('変換結果')).toHaveValue(/"id"/);
    await expect(page.getByLabel('変換結果')).toHaveValue(/太郎/);
  });

  test('モード切替で入出力がクリアされる', async ({ page }) => {
    await page.getByLabel('入力').fill('[{"id":1}]');
    await page.getByRole('button', { name: 'CSV → JSON' }).click();
    await expect(page.getByLabel('入力')).toHaveValue('');
  });
});
