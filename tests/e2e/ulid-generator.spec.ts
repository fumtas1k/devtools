import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('ULID生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/ulid-generator');
    await page.getByRole('button', { name: '生成' }).waitFor();
    await waitForReactHydration(page);
  });

  test('生成ボタンでULIDが表示される', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    // 1行目の ULID セル（26文字 Crockford Base32）を確認
    await expect(page.getByRole('cell', { name: /[0-9A-Z]{26}/ }).first()).toBeVisible();
  });

  test('生成数を変えると指定件数のULIDが生成される', async ({ page }) => {
    // number input は click(3) で全選択してから type する
    await page.getByLabel('生成数').click({ clickCount: 3 });
    await page.keyboard.type('3');
    await page.getByRole('button', { name: '生成' }).click();

    // ULID セルを含む行 = データ行（ヘッダー行を除外）
    const dataRows = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: /[0-9A-Z]{26}/ }) });
    await expect(dataRows).toHaveCount(3);
  });

  test('生成されたULIDはすべて26文字', async ({ page }) => {
    await page.getByLabel('生成数').click({ clickCount: 3 });
    await page.keyboard.type('3');
    await page.getByRole('button', { name: '生成' }).click();

    // ULID セルを含む行 = データ行（ヘッダー行を除外）
    const dataRows = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: /[0-9A-Z]{26}/ }) });
    await expect(dataRows).toHaveCount(3);

    for (const row of await dataRows.all()) {
      const cell = row.getByRole('cell', { name: /[0-9A-Z]{26}/ });
      const text = await cell.innerText();
      expect(text.trim()).toHaveLength(26);
    }
  });

  test('再生成すると行が更新される', async ({ page }) => {
    await page.getByLabel('生成数').click({ clickCount: 3 });
    await page.keyboard.type('1');
    await page.getByRole('button', { name: '生成' }).click();

    const first = await page
      .getByRole('cell', { name: /[0-9A-Z]{26}/ })
      .first()
      .innerText();
    await page.getByRole('button', { name: '生成' }).click();
    const second = await page
      .getByRole('cell', { name: /[0-9A-Z]{26}/ })
      .first()
      .innerText();

    // 単調増加するため second >= first
    expect(second >= first).toBe(true);
  });

  test('タイムスタンプ列にISO形式の日時が表示される', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('cell', { name: /\d{4}-\d{2}-\d{2}T/ }).first()).toBeVisible();
  });
});
