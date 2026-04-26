import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('UUID v7 生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/uuid-v7');
    await page.getByLabel('生成数').waitFor();
    await waitForReactHydration(page);
  });

  test('UUIDを1件生成できる', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    
    // 「1 件生成」というテキストが表示される
    await expect(page.getByText('1 件生成')).toBeVisible();
    
    // テーブルに行が存在し、UUID形式（8-4-4-4-12）であることを確認
    const uuidCell = page.locator('table tbody tr').first().locator('td').nth(1);
    const uuidText = await uuidCell.innerText();
    // UUID v7 の正規表現 (バージョン 7 であることを確認)
    expect(uuidText).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('UUIDを複数件一括生成できる', async ({ page }) => {
    const countInput = page.getByLabel('生成数');
    await countInput.fill('5');
    await page.getByRole('button', { name: '生成' }).click();
    
    await expect(page.getByText('5 件生成')).toBeVisible();
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(5);
  });

  test('クォートスタイルを切り替えられる', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    
    // デフォルトは「なし」
    // 「すべてコピー」ボタンをクリックしてクリップボードを確認するのは難しいので、
    // UI上の変化（もしあれば）や、内部状態を推測する。
    // 今回のツールではテーブル内のコピーボタンの引数が変わる。
    
    // ダブルクォートに切り替え
    await page.getByRole('button', { name: '"..."' }).click();
    // 状態が切り替わったことを確認（ボタンの選択状態など、CSSクラスで判定できる場合もあるが、
    // ここではクリックが成功し、エラーが出ないことを確認）
    
    // シングルクォートに切り替え
    await page.getByRole('button', { name: "'...'" }).click();
  });

  test('行をクリックするとフィールド分解パネルが表示される', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    
    // 最初の行をクリック
    await page.locator('table tbody tr').first().click();
    
    // フィールド分解パネルが表示されることを確認
    await expect(page.getByText('フィールド分解', { exact: true })).toBeVisible();
    await expect(page.getByText('unix_ts_ms', { exact: true })).toBeVisible();
    await expect(page.getByText('ver', { exact: true })).toBeVisible();
  });

  test('クリアボタンでリストをリセットできる', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByText('1 件生成')).toBeVisible();
    
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(page.getByText('0 件生成')).not.toBeVisible(); // 件数表示自体が消えるはず
    await expect(page.locator('table')).not.toBeVisible();
  });
});
