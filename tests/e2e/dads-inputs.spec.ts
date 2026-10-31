import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

/**
 * DADS の Input / Select / Textarea の見た目（docs/decisions.md [143]）。
 * 高さ md 48px・padding 16px・角丸 8px・文字 16px と、hover / エラー / read-only / disabled /
 * placeholder の computed style、md ボタンとの高さ揃えを検証する。
 *
 * 陽性対照: 変更前の実装（InputField / Select / CountInput が .caption（14px）+ px-3 py-2、
 * 枠色が border-input / border-error の固定値、read-only が実線）では、各テストが fail することを確認済み。
 */

const BORDER = 'rgb(102, 102, 102)'; // solid-gray-600
const BLACK = 'rgb(0, 0, 0)';
const ERROR = 'rgb(236, 0, 0)'; // error-1 (red-800)
const ERROR_HOVER = 'rgb(169, 0, 0)'; // red-1000
const PLACEHOLDER = 'rgb(118, 118, 118)'; // solid-gray-536
const DISABLED_BORDER = 'rgb(179, 179, 179)'; // solid-gray-300
const DISABLED_TEXT = 'rgb(148, 148, 148)'; // solid-gray-420
const GRAY_50 = 'rgb(242, 242, 242)';

test.describe('DADS の入力欄', () => {
  test.describe('base64（InputField の textarea / OutputField）', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/tools/base64');
      await waitForReactHydration(page);
    });

    test('textarea: padding 12px 16px・角丸 8px・文字 16px・行高 1.7・枠 gray-600', async ({
      page,
    }) => {
      const input = page.getByRole('textbox', { name: '入力' });
      await expect(input).toHaveCSS('padding', '12px 16px');
      await expect(input).toHaveCSS('border-radius', '8px');
      await expect(input).toHaveCSS('font-size', '16px');
      await expect(input).toHaveCSS('line-height', '27.2px');
      await expect(input).toHaveCSS('border-top-color', BORDER);
      await expect(input).toHaveCSS('border-top-style', 'solid');
    });

    test('hover で枠が黒になる', async ({ page }) => {
      const input = page.getByRole('textbox', { name: '入力' });
      await input.hover();
      await expect(input).toHaveCSS('border-top-color', BLACK);
    });

    test('placeholder は solid-gray-536', async ({ page }) => {
      const input = page.getByRole('textbox', { name: '入力' });
      const color = await input.evaluate((el) => getComputedStyle(el, '::placeholder').color);
      expect(color).toBe(PLACEHOLDER);
    });

    test('エラー（aria-invalid）は枠が error-1、hover で red-1000 になる', async ({ page }) => {
      await page.getByRole('button', { name: 'デコード' }).click();
      const input = page.getByRole('textbox', { name: '入力' });
      await input.fill('これはBase64ではない!!');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await page.mouse.move(0, 0);
      await expect(input).toHaveCSS('border-top-color', ERROR);
      await input.hover();
      await expect(input).toHaveCSS('border-top-color', ERROR_HOVER);
    });

    test('read-only の出力欄は破線の枠で、hover しても枠色が変わらない', async ({ page }) => {
      const output = page.getByRole('textbox', { name: '変換結果' });
      await expect(output).toHaveCSS('border-top-style', 'dashed');
      await expect(output).toHaveCSS('border-top-color', BORDER);
      await expect(output).toHaveCSS('background-color', GRAY_50);
      await expect(output).toHaveCSS('border-radius', '8px');
      await output.hover();
      await expect(output).toHaveCSS('border-top-color', BORDER);
    });
  });

  test('disabled は枠 gray-300・地 gray-50・文字 gray-420 で、hover しても枠色が変わらない', async ({
    page,
  }) => {
    await page.goto('/tools/uuid-v7');
    await waitForReactHydration(page);
    const count = page.getByRole('spinbutton', { name: '生成数' });
    // 画面上に disabled の入力欄が無いため、状態だけ属性で再現する
    await count.evaluate((el) => el.setAttribute('disabled', ''));
    await expect(count).toHaveCSS('border-top-color', DISABLED_BORDER);
    await expect(count).toHaveCSS('background-color', GRAY_50);
    await expect(count).toHaveCSS('color', DISABLED_TEXT);
    await count.hover({ force: true });
    await expect(count).toHaveCSS('border-top-color', DISABLED_BORDER);
  });

  test('CountInput: 高さ 48px・padding 16px・文字 16px で、md の「生成」ボタンと高さ・上端がそろう', async ({
    page,
  }) => {
    await page.goto('/tools/uuid-v7');
    await waitForReactHydration(page);
    const count = page.getByRole('spinbutton', { name: '生成数' });
    await expect(count).toHaveCSS('padding', '0px 16px');
    await expect(count).toHaveCSS('font-size', '16px');
    const input = await count.boundingBox();
    const button = await page.getByRole('button', { name: '生成', exact: true }).boundingBox();
    expect(input?.height).toBeCloseTo(48, 0);
    expect(button?.height).toBeCloseTo(48, 0);
    expect(input?.y).toBeCloseTo(button?.y ?? -1, 0);
  });

  test('Select: 高さ 48px・appearance none・右 padding で chevron を避ける', async ({ page }) => {
    await page.goto('/tools/sql-formatter');
    await waitForReactHydration(page);
    const select = page.getByRole('combobox', { name: 'SQL 方言' });
    await expect(select).toHaveCSS('appearance', 'none');
    await expect(select).toHaveCSS('padding-left', '16px');
    await expect(select).toHaveCSS('padding-right', '44px');
    await expect(select).toHaveCSS('font-size', '16px');
    await expect(select).toHaveCSS('border-radius', '8px');
    expect((await select.boundingBox())?.height).toBeCloseTo(48, 0);
    await select.hover();
    await expect(select).toHaveCSS('border-top-color', BLACK);
  });

  test('InputField（1 行）: 高さ 48px・padding 0 16px', async ({ page }) => {
    await page.goto('/tools/jan-code');
    await waitForReactHydration(page);
    const single = page.locator('#jan-input');
    await expect(single).toHaveCSS('padding', '0px 16px');
    await expect(single).toHaveCSS('font-size', '16px');
    expect((await single.boundingBox())?.height).toBeCloseTo(48, 0);
  });

  test('トップの検索欄: 左右 padding 40px が utility で上書きされ、高さ 48px', async ({ page }) => {
    await page.goto('/');
    const search = page.getByRole('searchbox', { name: 'ツールを検索' });
    await expect(search).toHaveCSS('padding-left', '40px');
    await expect(search).toHaveCSS('padding-right', '40px');
    expect((await search.boundingBox())?.height).toBeCloseTo(48, 0);
  });
});
