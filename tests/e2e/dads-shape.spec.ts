import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// DADS の角丸（docs/decisions.md [139]）: コントロールは 8px（rounded-md）、カード・パネルは 12px（rounded-lg）
const CONTROL_RADIUS = '8px';
const CARD_RADIUS = '12px';

test.describe('DADS の角丸（production CSP 適用）', () => {
  test('入力欄・トグルはコントロールの角丸、ツール説明欄はカードの角丸になる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      const input = page.getByRole('textbox').first();
      await expect(input).toHaveCSS('border-radius', CONTROL_RADIUS);

      const toggle = page.getByRole('button', { name: 'エンコード' });
      await expect(toggle).toHaveCSS('border-radius', CONTROL_RADIUS);

      const info = page.getByRole('heading', { name: 'このツールについて' }).locator('..');
      await expect(info).toHaveCSS('border-radius', CARD_RADIUS);
    });
  });
});
