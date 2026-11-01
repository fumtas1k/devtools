import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// DADS の角丸（docs/decisions.md [139]）: コントロールは 8px（rounded-md）、カード・パネルは 12px（rounded-lg）
const CONTROL_RADIUS = '8px';
const CARD_RADIUS = '12px';

test.describe('DADS の角丸（production CSP 適用）', () => {
  test('入力欄・トグルの土台はコントロールの角丸、ツール説明欄はカードの角丸になる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      const input = page.getByRole('textbox').first();
      await expect(input).toHaveCSS('border-radius', CONTROL_RADIUS);

      // トグルは土台がコントロールの角丸、内側のボタンは入れ子で重ならない 4px（[144]）
      const toggle = page.getByRole('button', { name: 'エンコード' });
      await expect(toggle.locator('..')).toHaveCSS('border-radius', CONTROL_RADIUS);
      await expect(toggle).toHaveCSS('border-radius', '4px');

      const info = page.getByRole('heading', { name: 'このツールについて' }).locator('..');
      await expect(info).toHaveCSS('border-radius', CARD_RADIUS);
    });
  });

  test('TOTP/HOTP のセクション枠はカードの角丸 12px（rounded-lg）になる（[148]）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      // 見出し行の親が、border + overflow-hidden のセクション枠
      const section = page.getByText('シークレット鍵と設定', { exact: true }).locator('..');
      await expect(section).toHaveCSS('border-radius', CARD_RADIUS);
    });
  });
});
