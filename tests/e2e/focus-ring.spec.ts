import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// DADS のフォーカスインジケータ（docs/decisions.md [136]）: 黒 4px の outline + yellow-300 の 2px リング
const FOCUS_OUTLINE = 'rgb(0, 0, 0)';
const FOCUS_RING = 'rgb(255, 212, 61)';

test.describe('DADS フォーカスリング（production CSP 適用）', () => {
  test('<summary> にキーボード focus すると DADS のフォーカスリングが出る（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      const summary = page.getByText('計算過程を見る', { exact: true });
      await expect(summary).toBeVisible();

      // 直前の要素から Tab で移動し :focus-visible を発火させる
      await summary.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(summary).toBeFocused();

      await expect(summary).toHaveCSS('outline-color', FOCUS_OUTLINE);
      await expect(summary).toHaveCSS('outline-width', '4px');
      await expect(summary).toHaveCSS('box-shadow', `${FOCUS_RING} 0px 0px 0px 2px`);
    });
  });

  test('横スクロール領域のカテゴリタブはフォーカス表示を内側に描く（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        const tab = page.getByRole('tab', { name: 'すべて' });
        // 陰性対照: focus 前は outline なし
        await expect(tab).toHaveCSS('outline-style', 'none');

        await tab.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(tab).toBeFocused();

        // 親の overflow-x-auto で切れないよう、outline は内側（offset -4px）、黄リングは inset
        await expect(tab).toHaveCSS('outline-width', '4px');
        await expect(tab).toHaveCSS('outline-offset', '-4px');
        await expect(tab).toHaveCSS('box-shadow', `${FOCUS_RING} 0px 0px 0px 6px inset`);
      },
      { skipHydration: true }
    );
  });
});
