import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('JSON / CSV 変換', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/json-csv');
    await page.getByLabel('入力').waitFor();
    await waitForReactHydration(page);
  });

  test('JSON → CSV: サンプルデータを変換できる', async ({ page }) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.getByLabel('変換結果')).not.toHaveValue('');
    await expect(page.getByLabel('変換結果')).toHaveValue(/id/);
    await expect(page.getByLabel('変換結果')).toHaveValue(/name/);
  });

  test('JSON → CSV: フラットなJSONをCSVに変換する', async ({ page }) => {
    await page.getByLabel('入力').fill('[{"id":1,"name":"太郎"},{"id":2,"name":"花子"}]');
    await expect(page.getByLabel('変換結果')).toHaveValue(/id,name/);
    await expect(page.getByLabel('変換結果')).toHaveValue(/太郎/);
    await expect(page.getByLabel('変換結果')).toHaveValue(/花子/);
  });

  test('JSON → CSV: ネストオブジェクトをドット記法でフラット化する', async ({ page }) => {
    await page.getByLabel('入力').fill('[{"name":"太郎","address":{"city":"東京"}}]');
    await expect(page.getByLabel('変換結果')).toHaveValue(/address\.city/);
    await expect(page.getByLabel('変換結果')).toHaveValue(/東京/);
  });

  test('JSON → CSV: 不正なJSONでエラーを表示する', async ({ page }) => {
    await page.getByLabel('入力').fill('not valid json');
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('CSV → JSON: サンプルデータを変換できる', async ({ page }) => {
    await page.getByRole('button', { name: 'CSV → JSON' }).click();
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.getByLabel('変換結果')).not.toHaveValue('');
    await expect(page.getByLabel('変換結果')).toHaveValue(/\[/);
  });

  test('CSV → JSON: CSVをJSONに変換する', async ({ page }) => {
    await page.getByRole('button', { name: 'CSV → JSON' }).click();
    await page.getByLabel('入力').fill('id,name\n1,太郎\n2,花子');
    await expect(page.getByLabel('変換結果')).toHaveValue(/"id"/);
    await expect(page.getByLabel('変換結果')).toHaveValue(/太郎/);
  });

  test('モード切替で入出力がクリアされる', async ({ page }) => {
    await page.getByLabel('入力').fill('[{"id":1}]');
    await page.getByRole('button', { name: 'CSV → JSON' }).click();
    await expect(page.getByLabel('入力')).toHaveValue('');
  });

  test('JSON → CSV: フォーミュラインジェクションをエスケープする', async ({ page }) => {
    // 注: 本ツールは useCodec フックでリアルタイム変換しているため
    // 「JSON → CSV」「CSV → JSON」はモード切替トグルであり明示的な変換ボタンは存在しない。
    // 入力欄を埋めるだけで変換結果が反映される（他の JSON→CSV 系 e2e テストと同方針）。
    await page.getByLabel('入力').fill('[{"formula":"=SUM(A1:A10)","plus":"+1+1","at":"@SUM"}]');
    // 先頭にシングルクォートが付加され、Excel が数式として解釈しない
    await expect(page.getByLabel('変換結果')).toHaveValue(/'=SUM\(A1:A10\)/);
    await expect(page.getByLabel('変換結果')).toHaveValue(/'\+1\+1/);
    await expect(page.getByLabel('変換結果')).toHaveValue(/'@SUM/);
  });

  test('JSON → CSV: タイピング直後はダウンロードボタンが disabled になり、デバウンス完了後に有効化される', async ({
    page,
  }) => {
    const downloadBtn = page.getByRole('button', { name: 'CSVダウンロード' });
    const inputField = page.getByLabel('入力');

    // 有効な JSON を入力してボタンを表示させ、デバウンス完了を待つ
    await inputField.fill('[{"id":1}]');
    await expect(downloadBtn).toBeVisible({ timeout: 2000 });
    await expect(downloadBtn).toBeEnabled({ timeout: 2000 });

    // 新しい入力でデバウンス中（isPending = true）→ ボタンが disabled になる
    await inputField.fill('[{"id":2}]');
    await expect(downloadBtn).toBeDisabled();

    // デバウンス完了（useCodec の既定値）後に再び有効化される
    await expect(downloadBtn).toBeEnabled({ timeout: 3000 });
  });
});
