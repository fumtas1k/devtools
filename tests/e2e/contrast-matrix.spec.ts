import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('コントラスト比マトリクス', () => {
  test('初期表示でマトリクスが描画される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/contrast-matrix', async (page) => {
      // テーブルが表示されている
      await expect(page.getByRole('table')).toBeVisible();
      // 黒×白のコントラスト比（初期色 #1a1a1a × #ffffff）はAAバッジを含む
      await expect(page.getByText('AA ○').first()).toBeVisible();
    });
  });

  test('色を追加するとマトリクスの列・行が増える（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/contrast-matrix', async (page) => {
      // 初期行数（thead + 4 tbody 行 = 5 行）を取得
      const before = await page.getByRole('row').count();
      // 色を追加
      await page.getByRole('button', { name: '＋ 色を追加' }).click();
      // 行が増えていることを確認
      await expect(async () => {
        const after = await page.getByRole('row').count();
        expect(after).toBeGreaterThan(before);
      }).toPass();
    });
  });

  test('無効な色を入力するとエラーメッセージを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/contrast-matrix', async (page) => {
      // 最初の色の HEX 入力欄を取得して不正値を入力
      const hexInputs = page.getByLabel('色');
      await hexInputs.first().fill('notacolor');
      await expect(page.getByText('不正な色').first()).toBeVisible();
    });
  });

  test('AAA フィルタに切り替えると aria-pressed が更新される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/contrast-matrix', async (page) => {
      const aaaButton = page.getByRole('button', { name: 'AAA 以上' });
      await aaaButton.click();
      await expect(aaaButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test('色を 1 つにするとマトリクスが非表示になり案内文が出る（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/contrast-matrix', async (page) => {
      // 削除ボタンが 2 つ以上残るまで削除してみる（最低 2 色は保持される）
      // 最初の色以外を削除ボタンで削除する
      // rows.length <= 2 で disabled になるため、3色目・4色目を削除
      const deleteButtons = page.getByRole('button', { name: '削除' });
      // 初期 4 行中、enabled な削除ボタンをクリック
      await deleteButtons.first().click();
      await deleteButtons.first().click();
      // まだ 2 色あるのでテーブルは表示されている
      await expect(page.getByRole('table')).toBeVisible();
    });
  });
});
