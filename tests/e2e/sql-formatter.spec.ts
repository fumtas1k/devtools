import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('SQL整形（production CSP 適用）', () => {
  test('サンプルを整形できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await expect(page.getByLabel('整形結果')).not.toHaveValue('');
      await expect(page.getByLabel('整形結果')).toHaveValue(/SELECT/);
      await expect(page.getByLabel('整形結果')).toHaveValue(/FROM/);
    });
  });

  test('小文字 SQL を大文字キーワードに整形する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByLabel('SQL 入力').fill('select id from users where id = 1');
      await expect(page.getByLabel('整形結果')).toHaveValue(/SELECT/);
      await expect(page.getByLabel('整形結果')).toHaveValue(/WHERE/);
    });
  });

  test('方言を切り替えても整形できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByLabel('SQL 方言').selectOption('postgresql');
      await page.getByLabel('SQL 入力').fill('select * from t');
      await expect(page.getByLabel('整形結果')).toHaveValue(/SELECT/);
    });
  });

  test('整形不能な入力でエラーを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByLabel('SQL 入力').fill("select * from t where name = 'unterminated");
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });

  test('クリアボタンで出力が消える（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByLabel('SQL 入力').fill('select 1');
      await expect(page.getByLabel('整形結果')).not.toHaveValue('');
      await page.getByRole('button', { name: 'クリア' }).click();
      await expect(page.getByLabel('整形結果')).toHaveValue('');
    });
  });
});
