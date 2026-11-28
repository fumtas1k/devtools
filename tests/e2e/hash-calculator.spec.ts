import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { withProductionCsp } from './helpers';

test('日本語テキストとバイナリファイルをブラウザ内で計算する', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/hash-calculator', async (page) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (['xhr', 'fetch'].includes(request.resourceType()) || request.method() !== 'GET') {
        requests.push(request.url());
      }
    });
    const output = page.getByRole('textbox', { name: 'SHA-256（16進数）' });
    const run = page.getByRole('button', { name: 'ハッシュを生成' });
    const text = ' 日本語🌱\n';
    await page.getByRole('textbox', { name: 'テキスト' }).fill(text);
    await run.click();
    await expect(output).toHaveValue(createHash('sha256').update(text).digest('hex'));
    await page.getByRole('button', { name: 'ファイル', exact: true }).click();
    await expect(output).toHaveValue('');
    await expect(run).toBeDisabled();
    const buffer = Buffer.from([255, 0, 13, 10]);
    await page.getByLabel('ファイルを選択').setInputFiles({
      name: 'test.bin',
      mimeType: 'application/octet-stream',
      buffer,
    });
    await run.click();
    await expect(output).toHaveValue(createHash('sha256').update(buffer).digest('hex'));
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(output).toHaveValue('');
    await expect(run).toBeDisabled();
    expect(requests).toEqual([]);
  });
});
