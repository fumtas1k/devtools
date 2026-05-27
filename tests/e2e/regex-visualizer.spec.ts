import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('正規表現ビジュアライザ', () => {
  test('有効な正規表現で構造ツリーが表示される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(ab)+');
      await expect(page.getByText(/1 回以上の繰り返し/)).toBeVisible();
    });
  });

  test('脆弱な正規表現で危険判定と攻撃文字列が出る（CSP 下で checkSync 動作）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(a+)+$');
      // ReDoS 判定セクション内の「脆弱：ReDoS のリスク」テキスト（ページ説明文の「脆弱性」と区別）
      await expect(
        page.getByRole('region', { name: 'ReDoS 判定' }).getByText(/脆弱：ReDoS/)
      ).toBeVisible();
      await expect(page.getByRole('button', { name: '攻撃文字列をコピー' })).toBeVisible();
    });
  });

  test('安全な正規表現で安全判定が出る', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('^[a-z]+$');
      // ReDoS 判定セクション内の「安全：」テキスト
      await expect(
        page.getByRole('region', { name: 'ReDoS 判定' }).getByText(/安全：/)
      ).toBeVisible();
    });
  });

  test('不正な正規表現でエラーが出る', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(');
      // ErrorMessage コンポーネントは role="alert" で描画される
      await expect(page.getByRole('alert').first()).toBeVisible();
    });
  });
});
