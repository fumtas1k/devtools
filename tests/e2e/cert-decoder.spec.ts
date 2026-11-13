import { expect, test } from '@playwright/test';
import { withProductionCsp } from './helpers';

test('後に選んだファイルの入力は先の読み込みが遅れても維持される', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/cert-decoder', async (page) => {
    await page.evaluate(() => {
      const releases: Record<string, () => void> = {};
      const completed: Record<string, boolean> = {};
      Object.assign(window, { certFileReleases: releases, certFileCompleted: completed });
      const readText = File.prototype.text;
      File.prototype.text = async function () {
        await new Promise<void>((resolve) => {
          releases[this.name] = resolve;
        });
        const content = await readText.call(this);
        completed[this.name] = true;
        return content;
      };
    });
    const file = page.locator('input[type="file"]');
    const text = page.getByLabel('証明書を貼り付け');
    await file.setInputFiles({
      name: 'first.pem',
      mimeType: 'text/plain',
      buffer: Buffer.from('older'),
    });
    await expect
      .poll(() =>
        page.evaluate(
          () => 'first.pem' in (window as unknown as { certFileReleases: object }).certFileReleases
        )
      )
      .toBe(true);
    await file.setInputFiles({
      name: 'second.pem',
      mimeType: 'text/plain',
      buffer: Buffer.from('newer'),
    });
    await expect
      .poll(() =>
        page.evaluate(
          () => 'second.pem' in (window as unknown as { certFileReleases: object }).certFileReleases
        )
      )
      .toBe(true);
    await page.evaluate(() =>
      (window as unknown as { certFileReleases: Record<string, () => void> }).certFileReleases[
        'second.pem'
      ]()
    );
    await expect(text).toHaveValue('newer');
    await page.evaluate(() => {
      (window as unknown as { certFileReleases: Record<string, () => void> }).certFileReleases[
        'first.pem'
      ]();
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { certFileCompleted: Record<string, boolean> }).certFileCompleted[
              'first.pem'
            ]
        )
      )
      .toBe(true);
    await expect(text).toHaveValue('newer');
  });
});
