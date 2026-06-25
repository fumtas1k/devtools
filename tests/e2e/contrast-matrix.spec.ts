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

  test('エラー表示時も HEX 欄とラベル欄の上端が揃う（段差防止）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/contrast-matrix', async (page) => {
      // 先頭行の HEX を不正値にしてエラー文言を表示させる
      await page.getByLabel('色').first().fill('notacolor');
      await expect(page.getByText('不正な色').first()).toBeVisible();
      // items-start により、エラーで HEX 列が縦に伸びても入力ボックスの上端は揃う。
      // 同一行の HEX 欄とラベル欄の top 座標が一致することを検証（段差の回帰ガード）。
      const hexBox = await page.getByLabel('色').first().boundingBox();
      const labelBox = await page.getByLabel('ラベル').first().boundingBox();
      expect(hexBox).not.toBeNull();
      expect(labelBox).not.toBeNull();
      expect(Math.abs((hexBox?.y ?? 0) - (labelBox?.y ?? 0))).toBeLessThanOrEqual(1);
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

  test('有効な色が 2 つ未満になると案内文を表示しマトリクスを隠す（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/contrast-matrix', async (page) => {
      // 削除では最低 2 行が保持され UI 上 1 色には到達できないため、
      // 全行の HEX 欄に無効値を入力して validColors.length < 2 の分岐へ到達させる
      const hexInputs = page.getByLabel('色');
      const count = await hexInputs.count();
      for (let i = 0; i < count; i++) {
        await hexInputs.nth(i).fill('notacolor');
      }
      // 案内文が表示され、マトリクスのテーブルは消える
      await expect(page.getByText('有効な色を 2 つ以上')).toBeVisible();
      await expect(page.getByRole('table')).toHaveCount(0);
    });
  });

  test('最低 2 色は保持され 2 色時の削除ボタンが無効化される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/contrast-matrix', async (page) => {
      // 初期 4 行から enabled な削除ボタンを押して 2 行まで減らす
      const deleteButtons = page.getByRole('button', { name: '削除' });
      await deleteButtons.first().click();
      await deleteButtons.first().click();
      // 2 色残るのでテーブルは表示され、残る削除ボタンは全て無効
      await expect(page.getByRole('table')).toBeVisible();
      const remaining = page.getByRole('button', { name: '削除' });
      await expect(remaining).toHaveCount(2);
      await expect(remaining.first()).toBeDisabled();
      await expect(remaining.last()).toBeDisabled();
    });
  });
});
