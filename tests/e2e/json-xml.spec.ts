import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('JSON / XML 変換', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/json-xml');
    await page.getByLabel('入力').waitFor();
    await waitForReactHydration(page);
  });

  test('JSON → XML: サンプルデータを変換できる', async ({ page }) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.locator('#json-xml-output')).not.toHaveValue('');
    await expect(page.locator('#json-xml-output')).toHaveValue(/\<\?xml/);
    await expect(page.locator('#json-xml-output')).toHaveValue(/\<root\>/);
  });

  test('JSON → XML: シンプルなJSONをXMLに変換する', async ({ page }) => {
    await page.getByLabel('入力').fill('{"name":"太郎","age":30}');
    await expect(page.locator('#json-xml-output')).toHaveValue(/<name>太郎<\/name>/);
    await expect(page.locator('#json-xml-output')).toHaveValue(/<age>30<\/age>/);
  });

  test('JSON → XML: 不正なJSONでエラーを表示する', async ({ page }) => {
    await page.getByLabel('入力').click();
    await page.keyboard.type('not valid json');
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('XML → JSON: サンプルデータを変換できる', async ({ page }) => {
    await page.getByRole('button', { name: 'XML → JSON' }).click();
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.locator('#json-xml-output')).not.toHaveValue('');
    await expect(page.locator('#json-xml-output')).toHaveValue(/\{/);
  });

  test('XML → JSON: シンプルなXMLをJSONに変換する', async ({ page }) => {
    await page.getByRole('button', { name: 'XML → JSON' }).click();
    await page.getByLabel('入力').fill('<root><name>太郎</name></root>');
    await expect(page.locator('#json-xml-output')).toHaveValue(/太郎/);
  });

  test('XML → JSON: 不正なXMLでエラーを表示する', async ({ page }) => {
    await page.getByRole('button', { name: 'XML → JSON' }).click();
    await page.getByLabel('入力').click();
    await page.keyboard.type('<<not xml');
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('クリアボタンで出力が消える', async ({ page }) => {
    await page.getByLabel('入力').fill('{"key":"value"}');
    await expect(page.locator('#json-xml-output')).not.toHaveValue('');
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(page.locator('#json-xml-output')).toHaveValue('');
  });
});
