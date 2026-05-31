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

test.describe('SQLパラメータ埋め込み（production CSP 適用）', () => {
  test('入力欄と結果欄の表示領域がデスクトップ幅で揃う（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.getByRole('button', { name: 'パラメータ埋め込み' }).click();
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      const inputColumn = page.getByTestId('embed-input-column');
      const outputColumn = page.getByTestId('embed-output-column');
      const sqlInput = page.getByLabel('プレースホルダ付き SQL');
      const paramsInput = page.getByLabel('パラメータ（JSON）');
      const output = page.getByRole('textbox', { name: '埋め込み結果' });

      await expect(inputColumn).toBeVisible();
      await expect(outputColumn).toBeVisible();
      await expect(output).toBeVisible();

      const inputColumnBox = await inputColumn.boundingBox();
      const outputColumnBox = await outputColumn.boundingBox();
      const sqlInputBox = await sqlInput.boundingBox();
      const paramsInputBox = await paramsInput.boundingBox();
      const outputBox = await output.boundingBox();

      expect(inputColumnBox).not.toBeNull();
      expect(outputColumnBox).not.toBeNull();
      expect(sqlInputBox).not.toBeNull();
      expect(paramsInputBox).not.toBeNull();
      expect(outputBox).not.toBeNull();

      expect(outputColumnBox!.x).toBeGreaterThan(inputColumnBox!.x + inputColumnBox!.width - 2);
      expect(Math.abs(inputColumnBox!.y - outputColumnBox!.y)).toBeLessThanOrEqual(2);
      expect(Math.abs(sqlInputBox!.y - outputBox!.y)).toBeLessThanOrEqual(2);

      const paramsBottom = paramsInputBox!.y + paramsInputBox!.height;
      const outputBottom = outputBox!.y + outputBox!.height;
      expect(Math.abs(paramsBottom - outputBottom)).toBeLessThanOrEqual(6);
    });
  });

  test('埋め込み結果欄はモバイル幅でも複数行の高さを保つ（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'パラメータ埋め込み' }).click();

      const outputBox = await page.getByRole('textbox', { name: '埋め込み結果' }).boundingBox();

      expect(outputBox).not.toBeNull();
      expect(outputBox!.height).toBeGreaterThan(300);
    });
  });

  test('? 位置指定パラメータを埋め込める（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByRole('button', { name: 'パラメータ埋め込み' }).click();
      await page.getByLabel('プレースホルダ付き SQL').fill('SELECT * FROM users WHERE id = ?');
      await page.getByLabel('パラメータ（JSON）').fill('[123]');
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/123/);
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/SELECT/);
    });
  });

  test('文字列値はクォートしエスケープして埋め込む（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByRole('button', { name: 'パラメータ埋め込み' }).click();
      await page.getByLabel('プレースホルダ付き SQL').fill('WHERE name = ?');
      await page.getByLabel('パラメータ（JSON）').fill('["O\'Brien"]');
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/'O''Brien'/);
    });
  });

  test('真偽値は方言で表現が変わる（MySQL=1 / PostgreSQL=TRUE）（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByRole('button', { name: 'パラメータ埋め込み' }).click();
      await page.getByLabel('プレースホルダ付き SQL').fill('WHERE active = ?');
      await page.getByLabel('パラメータ（JSON）').fill('[true]');
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/=\s*1/);
      await page.getByLabel('SQL 方言').selectOption('postgresql');
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/TRUE/);
    });
  });

  test('文字列リテラル内の ? は埋め込み対象にならない（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByRole('button', { name: 'パラメータ埋め込み' }).click();
      await page.getByLabel('プレースホルダ付き SQL').fill("WHERE note = 'why?' AND id = ?");
      await page.getByLabel('パラメータ（JSON）').fill('[7]');
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/'why\?'/);
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/=\s*7/);
    });
  });

  test('件数不一致でエラーを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByRole('button', { name: 'パラメータ埋め込み' }).click();
      await page.getByLabel('プレースホルダ付き SQL').fill('WHERE a = ?');
      await page.getByLabel('パラメータ（JSON）').fill('[1, 2]');
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });
});
