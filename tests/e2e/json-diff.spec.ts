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

for (const width of [390, 1280]) {
  test(`サンプルは両方の入力欄の右上にある（${width}px）`, async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-diff', async (page) => {
      await page.setViewportSize({ width, height: 844 });
      const inputs = page.getByRole('group', { name: '比較するJSON' });
      const sample = inputs.getByRole('button', { name: 'サンプルを入力', exact: true });
      const before = inputs.getByLabel('変更前のJSON');
      const after = inputs.getByLabel('変更後のJSON');
      await expect(sample).toBeVisible();
      const button = (await sample.boundingBox())!;
      const first = (await before.boundingBox())!;
      const second = (await after.boundingBox())!;
      expect(button.y + button.height).toBeLessThanOrEqual(Math.min(first.y, second.y));
      const right = Math.max(first.x + first.width, second.x + second.width);
      expect(Math.abs(button.x + button.width - right)).toBeLessThanOrEqual(1);
      await sample.click();
      await expect(before).toHaveValue(/"version": 1/);
      await expect(after).toHaveValue(/"version": 2/);
    });
  });
}
