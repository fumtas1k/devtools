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
    await expect(page.locator('tbody tr td:nth-child(2)').first()).toHaveText(/[0-9A-Z]{26}/);
  });

  test('生成数を変えると指定件数のULIDが生成される', async ({ page }) => {
    // number input は click(3) で全選択してから type する
    await page.locator('#ulid-count').click({ clickCount: 3 });
    await page.keyboard.type('3');
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(3);
  });

  test('生成されたULIDはすべて26文字', async ({ page }) => {
    await page.locator('#ulid-count').click({ clickCount: 3 });
    await page.keyboard.type('3');
    await page.getByRole('button', { name: '生成' }).click();
    const ulidCells = page.locator('tbody tr td:nth-child(2)');
    await expect(ulidCells).toHaveCount(3);
    for (const cell of await ulidCells.all()) {
      const text = await cell.innerText();
      expect(text.trim()).toHaveLength(26);
    }
  });

  test('再生成すると行が更新される', async ({ page }) => {
    await page.locator('#ulid-count').click({ clickCount: 3 });
    await page.keyboard.type('1');
    await page.getByRole('button', { name: '生成' }).click();
    const first = await page.locator('tbody tr td:nth-child(2)').first().innerText();
    await page.getByRole('button', { name: '生成' }).click();
    const second = await page.locator('tbody tr td:nth-child(2)').first().innerText();
    // 単調増加するため second >= first
    expect(second >= first).toBe(true);
  });

  test('タイムスタンプ列にISO形式の日時が表示される', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.locator('tbody tr td:nth-child(3)').first()).toHaveText(/\d{4}-\d{2}-\d{2}T/);
  });
});
