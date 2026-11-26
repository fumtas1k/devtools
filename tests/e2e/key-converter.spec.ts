import { expect, test } from '@playwright/test';
import { withProductionCsp } from './helpers';

test('入力欄の上で公開鍵と秘密鍵のサンプルを選べる', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/key-converter', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const input = page.getByLabel('鍵を貼り付け');
    const publicSample = page.getByRole('button', { name: 'RSA公開鍵のサンプル' });
    const privateSample = page.getByRole('button', { name: 'EC秘密鍵のサンプル' });
    await expect(publicSample).toBeVisible();
    await expect(privateSample).toBeVisible();
    const label = page.getByText('鍵を貼り付け', { exact: true });
    expect(
      await label.evaluate(
        (element) =>
          element.getBoundingClientRect().height <=
          parseFloat(getComputedStyle(element).lineHeight) + 1
      )
    ).toBe(true);
    const field = (await input.boundingBox())!;
    for (const sample of [publicSample, privateSample]) {
      const button = (await sample.boundingBox())!;
      expect(button.y + button.height).toBeLessThanOrEqual(field.y);
      expect(button.x + button.width).toBeLessThanOrEqual(field.x + field.width + 1);
    }
    await publicSample.click();
    await expect(input).toHaveValue(/^-----BEGIN PUBLIC KEY-----/);
    await privateSample.click();
    await expect(input).toHaveValue(/^-----BEGIN (?:EC )?PRIVATE KEY-----/);
  });
});
