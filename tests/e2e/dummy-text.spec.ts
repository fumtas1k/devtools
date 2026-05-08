import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('ダミーテキスト生成（production CSP 適用）', () => {
  test('ページ読み込み時にデフォルトのテキストが自動生成される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/dummy-text', async (page) => {
      await expect(page.getByText(/\d+ 文字/)).toBeVisible();
    });
  });

  test('デフォルト（漢字混じり日本語）でテキストが生成される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/dummy-text', async (page) => {
      // 初期文字種は japanese（漢字混じり）
      await expect(page.getByText(/\d+ 文字/)).toBeVisible();
    });
  });

  test('文字数を変更すると指定文字数のテキストが生成される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/dummy-text', async (page) => {
      // number input は全選択してから入力
      await page.getByLabel('文字数').click({ clickCount: 3 });
      await page.keyboard.type('50');
      // Tab キーで blur を発火（handleLengthBlur → generate 再実行）
      await page.keyboard.press('Tab');
      await expect(page.getByText('50 文字')).toBeVisible();
    });
  });

  test('ひらがな文字種でテキストが生成される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/dummy-text', async (page) => {
      await page.getByRole('button', { name: 'ひらがな' }).click();
      await expect(page.getByText(/\d+ 文字/)).toBeVisible();
    });
  });

  test('英数字文字種でテキストが生成される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/dummy-text', async (page) => {
      await page.getByRole('button', { name: '英数字' }).click();
      await expect(page.getByText(/\d+ 文字/)).toBeVisible();
    });
  });

  test('文字種切替で新しいテキストが生成される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/dummy-text', async (page) => {
      await page.getByRole('button', { name: 'カタカナ' }).click();
      await expect(page.getByText(/\d+ 文字/)).toBeVisible();
    });
  });
});
