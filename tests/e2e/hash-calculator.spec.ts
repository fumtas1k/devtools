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

test('方式変更で入力を保持し、計算途中の古い結果を表示しない', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/hash-calculator', async (page) => {
    const input = page.getByRole('textbox', { name: 'テキスト' });
    const algorithm = page.getByRole('combobox', { name: 'ハッシュ方式' });
    const run = page.getByRole('button', { name: 'ハッシュを生成' });
    await expect(algorithm).toHaveValue('SHA-256');
    await input.fill('abc');
    await run.click();
    await expect(page.getByRole('textbox', { name: 'SHA-256（16進数）' })).toHaveValue(
      createHash('sha256').update('abc').digest('hex')
    );
    await algorithm.selectOption('SHA-384');
    await expect(input).toHaveValue('abc');
    await expect(page.getByRole('textbox', { name: 'SHA-384（16進数）' })).toHaveValue('');

    await page.evaluate(() => {
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = (...args) =>
        new Promise((resolve, reject) => {
          document.addEventListener(
            'test-release-digest',
            () => void digest(...args).then(resolve, reject),
            {
              once: true,
            }
          );
          crypto.subtle.digest = digest;
        });
    });
    await run.click();
    await expect(page.getByRole('button', { name: '計算中…' })).toBeDisabled();
    await algorithm.selectOption('SHA-512');
    const output = page.getByRole('textbox', { name: 'SHA-512（16進数）' });
    await page.evaluate(() => document.dispatchEvent(new Event('test-release-digest')));
    await expect(run).toBeEnabled();
    await expect(output).toHaveValue('');
    await run.click();
    await expect(output).toHaveValue(createHash('sha512').update('abc').digest('hex'));
    await algorithm.selectOption('SHA-384');
    await run.click();
    await expect(page.getByRole('textbox', { name: 'SHA-384（16進数）' })).toHaveValue(
      createHash('sha384').update('abc').digest('hex')
    );
  });
});
