import { expect, test } from '@playwright/test';
import { withProductionCsp } from './helpers';

test('比較・編集・エラー修正・クリアを本番CSP下で使える', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-diff', async (page) => {
    const before = page.getByLabel('変更前のJSON');
    const after = page.getByLabel('変更後のJSON');
    const compare = page.getByRole('button', { name: '比較する' });
    const status = page.getByRole('region', { name: '比較結果' }).getByRole('status');

    await expect(before).toHaveAttribute('spellcheck', 'false');
    await expect(after).toHaveAttribute('spellcheck', 'false');
    await expect(compare).toBeDisabled();
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await compare.click();
    await expect(status).toHaveText('差分 3 件');
    await expect(page.getByText('/version', { exact: true })).toBeVisible();
    await expect(page.getByText('/preview', { exact: true })).toBeVisible();
    await expect(page.getByText('/region', { exact: true })).toBeVisible();

    await after.fill('[1,]');
    await expect(page.getByText('/version', { exact: true })).toHaveCount(0);
    await compare.click();
    await expect(after).toHaveAttribute('aria-invalid', 'true');
    await expect(before).toHaveAttribute('aria-invalid', 'false');

    await before.fill('{"a":1,"b":2}');
    await after.fill('{"b":2,"a":1}');
    await compare.click();
    await expect(status).toHaveText('差分はありません。');
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(before).toHaveValue('');
    await expect(after).toHaveValue('');
    await expect(compare).toBeDisabled();
  });
});
