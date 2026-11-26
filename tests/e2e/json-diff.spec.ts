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
    const full = page.getByRole('region', { name: 'JSON全文' });
    const leftBox = (await full.getByRole('region', { name: '変更前の全文' }).boundingBox())!;
    const rightBox = (await full.getByRole('region', { name: '変更後の全文' }).boundingBox())!;
    expect(leftBox.x + leftBox.width).toBeLessThan(rightBox.x);
    expect(Math.abs(leftBox.y - rightBox.y)).toBeLessThanOrEqual(1);
    await expect(full.getByRole('group', { name: '変更前の差分' })).toHaveCount(2);
    await expect(full.getByRole('group', { name: '変更後の差分' })).toHaveCount(2);
    for (const [name, input, token] of [
      ['変更前の全文', before, '1'],
      ['変更後の全文', after, '2'],
    ] as const) {
      const document = full.getByRole('region', { name });
      await expect(document.getByText('"name": "demo",', { exact: false })).toBeVisible();
      expect(await document.locator('code').textContent()).toBe(await input.inputValue());
      await expect(
        document.locator('mark').filter({ hasText: new RegExp('^' + token + '$') })
      ).toBeVisible();
      await expect(document.locator('mark').filter({ hasText: 'demo' })).toHaveCount(0);
    }
    await page.getByText('変更点一覧', { exact: true }).click();
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

test('狭い画面でも長いJSON全文と末尾の差分が見える', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-diff', async (page) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const before = JSON.stringify({ same: 'unchanged', x: 'a'.repeat(600) + 'OLD' });
    const after = JSON.stringify({ same: 'unchanged', x: 'a'.repeat(600) + 'NEW' });
    await page.getByLabel('変更前のJSON').fill(before);
    await page.getByLabel('変更後のJSON').fill(after);
    await page.getByRole('button', { name: '比較する' }).click();
    const full = page.getByRole('region', { name: 'JSON全文' });
    const left = full.getByRole('region', { name: '変更前の全文' });
    const right = full.getByRole('region', { name: '変更後の全文' });
    expect(await left.locator('code').textContent()).toBe(before);
    expect(await right.locator('code').textContent()).toBe(after);
    await expect(left.locator('mark')).toHaveText(/OLD"$/);
    await expect(right.locator('mark')).toHaveText(/NEW"$/);
    expect((await left.boundingBox())!.y).toBeLessThan((await right.boundingBox())!.y);
    expect(await full.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
});

test('差分が多い場合も全文を欠けなくページ移動できる', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-diff', async (page) => {
    const before = JSON.stringify(Array(550).fill(0), null, 2);
    const after = JSON.stringify(Array(550).fill(1), null, 2);
    await page.getByLabel('変更前のJSON').fill(before);
    await page.getByLabel('変更後のJSON').fill(after);
    await page.getByRole('button', { name: '比較する' }).click();
    const left = page.getByRole('region', { name: '変更前の全文' });
    const code = left.locator('code');
    await expect(left.locator('mark')).toHaveCount(512);
    const first = (await code.textContent()) ?? '';
    const pre = left.locator('pre');
    expect(
      await pre.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        return element.scrollTop;
      })
    ).toBeGreaterThan(0);
    await left.getByRole('button', { name: '次へ' }).click();
    await expect(left.locator('mark')).toHaveCount(38);
    await expect(pre).toBeFocused();
    expect(await pre.evaluate((element) => element.scrollTop)).toBe(0);
    expect(first + ((await code.textContent()) ?? '')).toBe(before);
    await expect(left.getByRole('button', { name: '次へ' })).toBeDisabled();
    await left.getByRole('button', { name: '前へ' }).click();
    await expect(code).toHaveText(first);
  });
});
