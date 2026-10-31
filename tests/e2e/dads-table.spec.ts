import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// DADS の Table（docs/decisions.md [142]）。色は global.css のトークン値を rgb で書く
const GRAY_50 = 'rgb(242, 242, 242)'; // --color-bg-surface（thead の地）
const WHITE = 'rgb(255, 255, 255)'; // --color-bg（縞なし）
const BLUE_50 = 'rgb(232, 241, 254)'; // --color-bg-active（行 hover）
const BLUE_100 = 'rgb(217, 230, 255)'; // --color-bg-selected（選択行）
const DIVIDER = 'rgb(148, 148, 148)'; // --color-border-divider（solid-gray-420）
const HEAD_RULE = 'rgb(153, 153, 153)'; // --color-border-table-head（solid-gray-400）

test.describe('DADS の Table（production CSP 適用）', () => {
  test('ResultTable: 見出し行・セル・罫線・縞なしが DADS の値になる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/uuid-v7', async (page) => {
      await page.getByRole('button', { name: '生成' }).click();

      const header = page.getByRole('columnheader', { name: 'UUID', exact: true });
      await expect(header).toHaveCSS('background-color', GRAY_50);
      // ResultTable の文字は .caption（14px）のまま（docs/decisions.md [142]）
      await expect(header).toHaveCSS('font-size', '14px');
      await expect(header).toHaveCSS('font-weight', '700');
      await expect(header).toHaveCSS('color', 'rgb(51, 51, 51)');
      await expect(header).toHaveCSS('box-shadow', `${HEAD_RULE} 0px -2px 0px 0px inset`);

      const rows = page.locator('table tbody tr');
      await expect(rows).toHaveCount(10);
      // 先頭行は生成直後に選択されるため、選択されていない 2 行目（偶数行）で見る
      const cell = rows.nth(1).getByRole('cell').nth(1);
      await expect(cell).toHaveCSS('padding', '12px 16px');
      await expect(cell).toHaveCSS('box-shadow', `${DIVIDER} 0px -1px 0px 0px inset`);

      // 縞を付けない（偶数行も白）
      await expect(rows.nth(1)).toHaveCSS('background-color', WHITE);
    });
  });

  test('ResultTable: 行 hover は blue-50、選択行は blue-100 と上下 2px の primary になる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/uuid-v7', async (page) => {
      await page.getByRole('button', { name: '生成' }).click();
      const rows = page.locator('table tbody tr');
      await expect(rows).toHaveCount(10);

      // 時刻列のセルにポインタを置く（コピーボタンの上は避ける）
      await rows.nth(2).getByRole('cell').nth(2).hover();
      await expect(rows.nth(2)).toHaveCSS('background-color', BLUE_50);

      await rows.nth(3).getByRole('cell').nth(2).click();
      await expect(rows.nth(3)).toHaveAttribute('aria-current', 'true');
      // 選択行の上にポインタがあっても hover 色より選択色が勝つ
      await expect(rows.nth(3)).toHaveCSS('background-color', BLUE_100);
      await expect(rows.nth(3).getByRole('cell').nth(1)).toHaveCSS(
        'box-shadow',
        'rgb(0, 23, 193) 0px 2px 0px 0px inset, rgb(0, 23, 193) 0px -2px 0px 0px inset'
      );
    });
  });

  test('Markdown プレビューの表も DADS の値になり、縞と縦罫線を付けない（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await page.getByLabel('markdown入力').fill('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');
      const preview = page.locator('.markdown-preview');

      const header = preview.getByRole('columnheader', { name: 'A' });
      await expect(header).toHaveCSS('background-color', GRAY_50);
      await expect(header).toHaveCSS('border-bottom', `2px solid ${HEAD_RULE}`);
      await expect(header).toHaveCSS('padding', '12px 16px');

      await expect(header).toHaveCSS('white-space', 'nowrap');

      const evenCell = preview.getByRole('cell', { name: '3' });
      await expect(evenCell).toHaveCSS('font-size', '16px');
      await expect(evenCell).toHaveCSS('line-height', '24px');
      await expect(evenCell).toHaveCSS('border-bottom', `1px solid ${DIVIDER}`);
      await expect(evenCell).toHaveCSS('border-left-width', '0px');
      await expect(evenCell).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    });
  });
});
