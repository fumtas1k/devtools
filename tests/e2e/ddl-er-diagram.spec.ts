import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('DDL→ER図ジェネレータ（production CSP 適用）', () => {
  test('サンプル入力でER図・Mermaidコード・ダウンロードボタンが表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/ddl-er-diagram', async (page) => {
      // サンプルを入力
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      // ER図 img が visible になるのを待つ
      await expect(page.getByTestId('er-diagram').locator('img')).toBeVisible();

      // Mermaid コードが erDiagram を含む
      await expect(page.getByTestId('mermaid-code')).toContainText('erDiagram');

      // ダウンロードボタンが visible
      await expect(page.getByRole('button', { name: 'SVGダウンロード' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'PNGダウンロード' })).toBeVisible();
    });
  });

  test('構文エラー入力でエラーメッセージを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/ddl-er-diagram', async (page) => {
      // 不完全な CREATE TABLE 文を入力してエラーを発生させる
      await page.getByLabel('CREATE TABLE 文').fill('CREATE TABLE');

      // エラーメッセージが表示される
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });
});
