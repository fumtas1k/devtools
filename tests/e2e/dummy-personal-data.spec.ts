import { test, expect } from '@playwright/test';

test.describe('日本語ダミー個人データ生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/dummy-personal-data');
  });

  test('生成するとプレビュー表が表示される', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('status')).toContainText('生成しました');
    // ヘッダに氏名列
    await expect(page.getByRole('columnheader', { name: '氏名' })).toBeVisible();
    // 先頭行が存在
    const rows = page.getByRole('row');
    expect(await rows.count()).toBeGreaterThan(1);
  });

  test('項目 OFF でプレビュー列が消える', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('columnheader', { name: 'メールアドレス' })).toBeVisible();
    await page.getByRole('button', { name: 'メールアドレス' }).click(); // ToggleChips OFF
    await expect(page.getByRole('columnheader', { name: 'メールアドレス' })).toHaveCount(0);
  });

  test('生成前はダウンロードが無効', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'ダウンロード' })).toBeDisabled();
  });

  test('連番ID列トグルでプレビューに No. 列が出る', async ({ page }) => {
    await page.getByRole('button', { name: '連番ID列 (No.)' }).click();
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('columnheader', { name: 'No.' })).toBeVisible();
  });

  test('一意化トグルでメールが重複しない', async ({ page }) => {
    await page.getByRole('button', { name: 'メール・電話番号を一意化' }).click();
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('status')).toContainText('生成しました');
    // プレビュー（先頭 20 件）のメール列セルを集めて重複がないことを確認
    const cells = await page.getByRole('cell').filter({ hasText: '@example.' }).allInnerTexts();
    expect(cells.length).toBeGreaterThan(1);
    expect(new Set(cells).size).toBe(cells.length);
  });

  test('セクション見出し「生成条件」「出力の見せ方」が表示される', async ({ page }) => {
    await expect(page.getByText('生成条件', { exact: true })).toBeVisible();
    await expect(page.getByText('出力の見せ方', { exact: true })).toBeVisible();
  });

  test('生成条件を変更すると未反映インジケータが出て、再生成で消える', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('status')).toContainText('生成しました');
    // 陰性対照: 生成直後は出ていない
    await expect(page.getByText('生成条件が変更されました。再生成してください')).toHaveCount(0);

    // 陽性対照: 生成条件（人数）を変更すると出る
    const count = page.getByLabel('出力する人数');
    await count.fill('200');
    await count.blur();
    await expect(page.getByText('生成条件が変更されました。再生成してください')).toBeVisible();

    // 陰性対照: 再生成すると消える
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByText('生成条件が変更されました。再生成してください')).toHaveCount(0);
  });

  test('即時反映トグル（連番ID列）では未反映インジケータが出ない', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('status')).toContainText('生成しました');
    // 出力の見せ方トグルは即時反映なので stale にならない
    await page.getByRole('button', { name: '連番ID列 (No.)' }).click();
    await expect(page.getByRole('columnheader', { name: 'No.' })).toBeVisible();
    await expect(page.getByText('生成条件が変更されました。再生成してください')).toHaveCount(0);
  });
});
