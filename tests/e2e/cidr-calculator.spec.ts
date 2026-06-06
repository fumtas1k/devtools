import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('CIDR/サブネット計算機（production CSP 適用）', () => {
  test('計算モード: 有効な CIDR を入力するとネットワーク情報が表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      await page.getByLabel('CIDR').fill('192.168.1.0/24');
      await expect(page.getByRole('heading', { name: 'ネットワーク情報' })).toBeVisible();
    });
  });

  test('計算モード: 不正な入力でエラーメッセージを表示する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      await page.getByLabel('CIDR').fill('not-valid');
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });

  test('分割モード: 192.168.1.0/24 を /26 に分割すると 4 行表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      // 分割モードに切り替え
      await page.getByRole('button', { name: '分割' }).click();

      // CIDR と分割先 prefix を入力
      await page.getByLabel('CIDR').fill('192.168.1.0/24');
      await page.getByLabel('分割先 prefix 長').fill('26');

      // 見出しの確認
      await expect(page.getByRole('heading', { name: 'サブネット一覧' })).toBeVisible();

      // 4 件のサブネット CIDR が表示されていることを確認
      await expect(page.getByText('192.168.1.0/26')).toBeVisible();
      await expect(page.getByText('192.168.1.64/26')).toBeVisible();
      await expect(page.getByText('192.168.1.128/26')).toBeVisible();
      await expect(page.getByText('192.168.1.192/26')).toBeVisible();
    });
  });

  test('分割モード: CIDR 入力は計算モードと共有される（切替時にクリアしない）（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      // 計算モードで CIDR を入力
      await page.getByLabel('CIDR').fill('10.0.0.0/8');
      await expect(page.getByRole('heading', { name: 'ネットワーク情報' })).toBeVisible();

      // 分割モードに切り替えても CIDR は保持される
      await page.getByRole('button', { name: '分割' }).click();
      await expect(page.getByLabel('CIDR')).toHaveValue('10.0.0.0/8');
    });
  });

  test('分割モード: 上限超過でエラーメッセージを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      await page.getByRole('button', { name: '分割' }).click();
      await page.getByLabel('CIDR').fill('10.0.0.0/8');
      await page.getByLabel('分割先 prefix 長').fill('24');
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('分割数が多すぎます');
    });
  });

  // 陽性対照: 旧実装（parseInt('26abc',10) → 26 として通過）に当てると fail する
  // 修正後は /^\d+$/ バリデーションで弾かれ alert が表示される
  test('分割モード: 不正な prefix 文字列でバリデーションエラーを表示する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      await page.getByRole('button', { name: '分割' }).click();
      await page.getByLabel('CIDR').fill('192.168.1.0/24');
      await page.getByLabel('分割先 prefix 長').fill('26abc');
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('alert')).toContainText(
        '分割先 prefix は 0 以上の整数で入力してください'
      );
    });
  });
});
