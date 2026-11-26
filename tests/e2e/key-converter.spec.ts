import { expect, test } from '@playwright/test';
import { withProductionCsp } from './helpers';

test('入力欄の上で公開鍵と秘密鍵のサンプルを選べる', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/key-converter', async (page) => {
    const input = page.getByLabel('鍵を貼り付け');
    const label = page.getByText('鍵を貼り付け', { exact: true });
    const publicSample = page.getByRole('button', { name: 'RSA公開鍵のサンプル' });
    const privateSample = page.getByRole('button', { name: 'EC秘密鍵のサンプル' });
    await page.evaluate(() => document.fonts.ready);
    for (const width of [390, 320, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const field = (await input.boundingBox())!;
      const caption = (await label.boundingBox())!;
      const rsa = (await publicSample.boundingBox())!;
      const ec = (await privateSample.boundingBox())!;
      expect(Math.abs(rsa.y - ec.y), `${width}px: 2つのサンプルは同じ行`).toBeLessThanOrEqual(1);
      if (width < 768) {
        expect(rsa.y, `${width}px: サンプルはラベルの下`).toBeGreaterThanOrEqual(
          caption.y + caption.height
        );
      } else {
        expect(rsa.y).toBeLessThan(caption.y + caption.height);
        expect(rsa.x).toBeGreaterThan(caption.x + caption.width);
      }
      expect(rsa.x).toBeGreaterThanOrEqual(field.x - 1);
      expect(ec.x + ec.width).toBeLessThanOrEqual(field.x + field.width + 1);
      expect(ec.y + ec.height).toBeLessThanOrEqual(field.y);
    }
    await publicSample.click();
    await expect(input).toHaveValue(/^-----BEGIN PUBLIC KEY-----/);
    await privateSample.click();
    await expect(input).toHaveValue(/^-----BEGIN (?:EC )?PRIVATE KEY-----/);
  });
});
