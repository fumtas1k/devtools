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
    await page.getByRole('button', { name: '両方にサンプルを入力' }).click();
    await compare.click();
    await expect(status).toHaveText('差分 3 件');
    await expect(page.getByText('/version', { exact: true })).toBeVisible();
    await expect(page.getByText('/preview', { exact: true })).toBeVisible();
    await expect(page.getByText('/region', { exact: true })).toBeVisible();

    const changes = page.getByRole('region', { name: '比較結果' }).getByRole('listitem');
    const changed = changes.filter({ hasText: '/version' });
    const removed = changes.filter({ hasText: '/preview' });
    const added = changes.filter({ hasText: '/region' });
    await expect(changed.getByText('−', { exact: true })).toBeVisible();
    await expect(changed.getByText('+', { exact: true })).toBeVisible();
    await expect(removed.getByText('−', { exact: true })).toBeVisible();
    await expect(removed.getByText('+', { exact: true })).toHaveCount(0);
    await expect(added.getByText('+', { exact: true })).toBeVisible();
    await expect(added.getByText('−', { exact: true })).toHaveCount(0);

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

for (const width of [320, 390, 1280]) {
  test(`変更前のラベルとサンプルが同じ行にある（${width}px）`, async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-diff', async (page) => {
      await page.setViewportSize({ width, height: 844 });
      const inputs = page.getByRole('group', { name: '比較するJSON' });
      const sample = inputs.getByRole('button', { name: '両方にサンプルを入力', exact: true });
      const before = inputs.getByLabel('変更前のJSON');
      const after = inputs.getByLabel('変更後のJSON');
      const label = inputs.getByText('変更前のJSON', { exact: true });
      await page.evaluate(() => document.fonts.ready);
      await expect(sample).toBeVisible();
      const button = (await sample.boundingBox())!;
      const first = (await before.boundingBox())!;
      const caption = (await label.boundingBox())!;
      expect(
        Math.abs(button.y + button.height / 2 - (caption.y + caption.height / 2))
      ).toBeLessThanOrEqual(1);
      expect(button.y + button.height).toBeLessThanOrEqual(first.y);
      expect(Math.abs(button.x + button.width - (first.x + first.width))).toBeLessThanOrEqual(1);
      await sample.click();
      await expect(before).toHaveValue(/"version": 1/);
      await expect(after).toHaveValue(/"version": 2/);
    });
  });
}

test('狭い画面でも省略後の変更値を上下に並べて表示する', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-diff', async (page) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const prefix = 'a'.repeat(600);
    await page.getByLabel('変更前のJSON').fill(JSON.stringify({ x: prefix + 'OLD' }));
    await page.getByLabel('変更後のJSON').fill(JSON.stringify({ x: prefix + 'NEW' }));
    await page.getByRole('button', { name: '比較する' }).click();
    const result = page.getByRole('region', { name: '比較結果' });
    const before = result.getByText(/…a+OLD"$/);
    const after = result.getByText(/…a+NEW"$/);
    await expect(before).toBeVisible();
    await expect(after).toBeVisible();
    expect((await before.boundingBox())!.y).toBeLessThan((await after.boundingBox())!.y);
    expect(await result.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );
  });
});
