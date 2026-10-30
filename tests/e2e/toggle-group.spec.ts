import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

const BG_ACTIVE = 'rgb(232, 241, 254)'; // --color-bg-active (blue-50)
const BG_TRANSPARENT = 'rgba(0, 0, 0, 0)';
const BG_PRESSED = 'rgb(255, 255, 255)'; // --color-bg (white)
const COLOR_TEXT = 'rgb(51, 51, 51)'; // --color-text (solid-gray-800)
const COLOR_MUTED = 'rgb(77, 77, 77)'; // --color-muted (solid-gray-700)
const FOCUS_OUTLINE = 'rgb(0, 0, 0)'; // --color-focus-outline (black)
const FOCUS_RING_SHADOW = 'rgb(255, 212, 61) 0px 0px 0px 2px'; // --focus-ring-shadow (yellow-300)

test.describe('ToggleGroup hover / focus-visible フィードバック（issue #385）', () => {
  test('未選択ボタンを hover すると背景が --color-bg-active になる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      const decodeBtn = page.getByRole('button', { name: 'デコード' });
      await expect(decodeBtn).toBeVisible();
      await expect(decodeBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(decodeBtn).toHaveCSS('background-color', BG_TRANSPARENT);
      await expect(decodeBtn).toHaveCSS('color', COLOR_MUTED);

      await decodeBtn.hover();
      await expect(decodeBtn).toHaveCSS('background-color', BG_ACTIVE);
      await expect(decodeBtn).toHaveCSS('color', COLOR_TEXT);
    });
  });

  test('選択中ボタン（aria-pressed=true）は hover しても背景が変わらない（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      const encodeBtn = page.getByRole('button', { name: 'エンコード' });
      await expect(encodeBtn).toBeVisible();
      await expect(encodeBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(encodeBtn).toHaveCSS('background-color', BG_PRESSED);
      await expect(encodeBtn).toHaveCSS('color', COLOR_TEXT);

      await encodeBtn.hover();
      await expect(encodeBtn).toHaveCSS('background-color', BG_PRESSED);
      await expect(encodeBtn).toHaveCSS('color', COLOR_TEXT);
    });
  });

  test('未選択ボタンを Tab focus すると背景が --color-bg-active になり outline ring が出る（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      const encodeBtn = page.getByRole('button', { name: 'エンコード' });
      const decodeBtn = page.getByRole('button', { name: 'デコード' });
      await expect(encodeBtn).toBeVisible();

      // エンコード（pressed）に focus → Tab で隣の未選択ボタン（デコード）へ移動
      await encodeBtn.focus();
      await page.keyboard.press('Tab');
      await expect(decodeBtn).toBeFocused();

      // 背景・文字色が hover と同じ blue-50 / --color-text になる
      await expect(decodeBtn).toHaveCSS('background-color', BG_ACTIVE);
      await expect(decodeBtn).toHaveCSS('color', COLOR_TEXT);
      // global :where(button, ...):focus-visible で適用される DADS のフォーカスリング
      // （黒 4px の outline + yellow-300 の 2px リング）
      await expect(decodeBtn).toHaveCSS('outline-color', FOCUS_OUTLINE);
      await expect(decodeBtn).toHaveCSS('outline-style', 'solid');
      await expect(decodeBtn).toHaveCSS('outline-width', '4px');
      await expect(decodeBtn).toHaveCSS('box-shadow', FOCUS_RING_SHADOW);
    });
  });

  test('選択中ボタンに focus すると黄リングと elevation の影が重なる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      const encodeBtn = page.getByRole('button', { name: 'エンコード' });
      const decodeBtn = page.getByRole('button', { name: 'デコード' });
      await expect(encodeBtn).toHaveAttribute('aria-pressed', 'true');

      // 未選択ボタンから Shift+Tab で選択中ボタンへキーボード移動（:focus-visible を発火させる）
      await decodeBtn.focus();
      await page.keyboard.press('Shift+Tab');
      await expect(encodeBtn).toBeFocused();

      // 黄リングの後ろに elevation-2 の影が続く。box-shadow は 0.15s の transition があるため、
      // 両方がそろうまで待つ（global の focus ルールだけだと影が消えて黄リングのみになる）
      const boxShadow = () => encodeBtn.evaluate((el) => getComputedStyle(el).boxShadow);
      await expect
        .poll(boxShadow)
        .toMatch(/^rgb\(255, 212, 61\) 0px 0px 0px 2px, rgba\(0, 0, 0, 0\.1\)/);
    });
  });
});
