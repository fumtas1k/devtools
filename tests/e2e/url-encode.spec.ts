import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('URLエンコード/デコード（production CSP 適用）', () => {
  test('日本語テキストをエンコードできる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.getByLabel('入力').fill('テスト');
      await expect(page.getByLabel('変換結果')).toHaveValue(/%E3%83%86%E3%82%B9%E3%83%88/);
    });
  });

  test('URLをエンコードできる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.getByLabel('入力').pressSequentially('https://example.com/?q=テスト');
      await expect(page.getByLabel('変換結果')).toHaveValue(/https%3A%2F%2Fexample\.com/);
    });
  });

  test('デコードモードでデコードできる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.getByRole('button', { name: 'デコード' }).click();
      await page.getByLabel('入力').fill('%E3%83%86%E3%82%B9%E3%83%88');
      await expect(page.getByLabel('変換結果')).toHaveValue('テスト');
    });
  });

  test('不正なエンコード文字列でエラーメッセージを表示する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.getByRole('button', { name: 'デコード' }).click();
      await page.getByLabel('入力').fill('%GG');
      await expect(page.getByRole('alert')).toContainText('不正なURLエンコード文字列です');
    });
  });

  test('サンプルボタンで入力が埋まり出力が表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await expect(page.getByLabel('入力')).not.toHaveValue('');
      await expect(page.getByLabel('変換結果')).not.toHaveValue('');
    });
  });

  test('クリアボタンで入力・出力がリセットされる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await expect(page.getByLabel('変換結果')).not.toHaveValue('');
      await page.getByRole('button', { name: 'クリア' }).click();
      await expect(page.getByLabel('入力')).toHaveValue('');
    });
  });
});

test.describe('URLエンコード/デコード レイアウト（production CSP 適用）', () => {
  // PC 幅で入力列と出力列が横並びになることを確認
  test('入力欄と出力欄がデスクトップ幅で横並びになる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      // コンテンツを表示させるためサンプルを入力
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      const inputColumn = page.getByTestId('url-input-column');
      const outputColumn = page.getByTestId('url-output-column');

      await expect(inputColumn).toBeVisible();
      await expect(outputColumn).toBeVisible();

      const inputColumnBox = await inputColumn.boundingBox();
      const outputColumnBox = await outputColumn.boundingBox();

      expect(inputColumnBox).not.toBeNull();
      expect(outputColumnBox).not.toBeNull();

      // 出力列の左端が入力列の右端より右にある（横並び）
      expect(outputColumnBox!.x).toBeGreaterThan(inputColumnBox!.x + inputColumnBox!.width - 2);
      // 両列の y 座標がほぼ揃う（誤差 ±2px 許容）
      expect(Math.abs(inputColumnBox!.y - outputColumnBox!.y)).toBeLessThanOrEqual(2);
    });
  });

  // モバイル幅で入力列と出力列が縦並びになることを確認
  test('入力欄と出力欄がモバイル幅で縦並びになる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      // コンテンツを表示させるためサンプルを入力
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      const inputColumn = page.getByTestId('url-input-column');
      const outputColumn = page.getByTestId('url-output-column');

      await expect(inputColumn).toBeVisible();
      await expect(outputColumn).toBeVisible();

      const inputColumnBox = await inputColumn.boundingBox();
      const outputColumnBox = await outputColumn.boundingBox();

      expect(inputColumnBox).not.toBeNull();
      expect(outputColumnBox).not.toBeNull();

      // 出力列の y 座標が入力列の下端より下にある（縦並び）
      expect(outputColumnBox!.y).toBeGreaterThan(inputColumnBox!.y + inputColumnBox!.height - 2);
    });
  });
});
