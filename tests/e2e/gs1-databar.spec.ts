import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('GS1 DataBar 生成（production CSP 適用）', () => {
  test('ページが正しく表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      await expect(page.getByRole('heading', { name: 'GS1 DataBar 生成' })).toBeVisible();
      await expect(page.getByLabel('AI コード 1')).toBeVisible();
      await expect(page.getByRole('button', { name: '+ フィールド追加' })).toBeVisible();
    });
  });

  test('AI コード Select のデフォルト値が正しい（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 初期フィールドは賞味/消費期限(17) と ロット番号(10)
      await expect(page.getByLabel('AI コード 1')).toHaveValue('17');
      await expect(page.getByLabel('AI コード 2')).toHaveValue('10');
    });
  });

  test('別フィールドで選択済みの AI は disabled になる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 1 行目は '17'（賞味/消費期限）、2 行目は '10'（ロット番号）
      // 2 行目 Select で '17' の option は disabled のはず
      const opt17InSelect2 = page
        .getByLabel('AI コード 2')
        .getByRole('option', { name: '賞味/消費期限 (17)' });
      await expect(opt17InSelect2).toBeDisabled();

      // 2 行目 Select で '10' の option は disabled でない
      const opt10InSelect2 = page
        .getByLabel('AI コード 2')
        .getByRole('option', { name: 'ロット番号 (10)' });
      await expect(opt10InSelect2).toBeEnabled();
    });
  });

  test('1 行目の AI を変更すると 2 行目の disabled が連動する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 初期状態: Select1='17', Select2='10'。未使用の '11'（製造日）を 1 行目に選択
      await page.getByLabel('AI コード 1').selectOption('11');
      await expect(page.getByLabel('AI コード 1')).toHaveValue('11');

      // React 再レンダリング後に '11' が Select 2 で disabled になるのを expect のオートリトライで待つ
      await expect(
        page.getByLabel('AI コード 2').getByRole('option', { name: '製造日 (11)' })
      ).toBeDisabled();

      // '17' は 2 行目で enabled になる
      await expect(
        page.getByLabel('AI コード 2').getByRole('option', { name: '賞味/消費期限 (17)' })
      ).toBeEnabled();
    });
  });

  test('削除ボタンでフィールドが減る（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 初期状態: 2 フィールド
      await expect(page.getByLabel('AI コード 1')).toBeVisible();
      await expect(page.getByLabel('AI コード 2')).toBeVisible();

      await page.getByRole('button', { name: 'フィールドを削除' }).first().click();

      await expect(page.getByLabel('AI コード 2')).toBeHidden();
      await expect(page.getByLabel('AI コード 1')).toBeVisible();
    });
  });

  test('+ フィールド追加でフィールドが増える（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 初期状態: 2 フィールド。1 行削除してから追加
      await page.getByRole('button', { name: 'フィールドを削除' }).first().click();
      await expect(page.getByLabel('AI コード 1')).toBeVisible();

      await page.getByRole('button', { name: '+ フィールド追加' }).click();
      await expect(page.getByLabel('AI コード 2')).toBeVisible();
    });
  });
});
