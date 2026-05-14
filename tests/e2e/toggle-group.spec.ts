import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

const BG_ACTIVE = 'rgb(239, 246, 255)'; // --color-bg-active (blue-50)
const BG_TRANSPARENT = 'rgba(0, 0, 0, 0)';
const BG_PRESSED = 'rgb(255, 255, 255)'; // --color-bg (white)
const COLOR_TEXT = 'rgb(17, 24, 39)'; // --color-text (neutral-900)
const COLOR_MUTED = 'rgb(107, 114, 128)'; // --color-muted (neutral-500)

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
      // global :where(button, ...):focus-visible で適用される outline ring
      await expect(decodeBtn).toHaveCSS('outline-color', 'rgb(37, 99, 235)');
      await expect(decodeBtn).toHaveCSS('outline-style', 'solid');
    });
  });
});
