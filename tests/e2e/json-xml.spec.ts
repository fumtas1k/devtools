import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('JSON / XML 変換（production CSP 適用）', () => {
  test('JSON → XML: サンプルデータを変換できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-xml', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await expect(page.getByLabel('変換結果')).not.toHaveValue('');
      await expect(page.getByLabel('変換結果')).toHaveValue(/\<\?xml/);
      await expect(page.getByLabel('変換結果')).toHaveValue(/\<root\>/);
    });
  });

  test('JSON → XML: シンプルなJSONをXMLに変換する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-xml', async (page) => {
      await page.getByLabel('入力').fill('{"name":"太郎","age":30}');
      await expect(page.getByLabel('変換結果')).toHaveValue(/<name>太郎<\/name>/);
      await expect(page.getByLabel('変換結果')).toHaveValue(/<age>30<\/age>/);
    });
  });

  test('JSON → XML: 不正なJSONでエラーを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-xml', async (page) => {
      await page.getByLabel('入力').fill('not valid json');
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });

  test('XML → JSON: サンプルデータを変換できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-xml', async (page) => {
      await page.getByRole('button', { name: 'XML → JSON' }).click();
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await expect(page.getByLabel('変換結果')).not.toHaveValue('');
      await expect(page.getByLabel('変換結果')).toHaveValue(/\{/);
    });
  });

  test('XML → JSON: シンプルなXMLをJSONに変換する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-xml', async (page) => {
      await page.getByRole('button', { name: 'XML → JSON' }).click();
      await page.getByLabel('入力').fill('<root><name>太郎</name></root>');
      await expect(page.getByLabel('変換結果')).toHaveValue(/太郎/);
    });
  });

  test('XML → JSON: 不正なXMLでエラーを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-xml', async (page) => {
      await page.getByRole('button', { name: 'XML → JSON' }).click();
      await page.getByLabel('入力').fill('<<not xml');
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });

  test('クリアボタンで出力が消える（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-xml', async (page) => {
      await page.getByLabel('入力').fill('{"key":"value"}');
      await expect(page.getByLabel('変換結果')).not.toHaveValue('');
      await page.getByRole('button', { name: 'クリア' }).click();
      await expect(page.getByLabel('変換結果')).toHaveValue('');
    });
  });
});
