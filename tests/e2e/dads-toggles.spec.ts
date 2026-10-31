import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// DADS 移行 Phase 5: トグル類（docs/decisions.md [144]）。
// ToggleGroup は outline ボタン、ToggleChips は ChipLabel の寸法 + ボタンの色から派生させている。

const PRIMARY = 'rgb(0, 23, 193)'; // blue-900
const PRIMARY_HOVER = 'rgb(0, 17, 143)'; // blue-1000
const BG_HOVER = 'rgb(197, 215, 251)'; // blue-200
const DISABLED_FILL = 'rgb(179, 179, 179)'; // solid-gray-300
const WHITE = 'rgb(255, 255, 255)';

test.describe('ToggleGroup（DADS 化）', () => {
  test('土台 8px の内側のボタンは 4px で、角丸が入れ子で重ならない', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      const group = page.getByRole('group').first();
      const btn = group.getByRole('button').first();
      await expect(btn).toBeVisible();
      await expect(group).toHaveCSS('border-top-left-radius', '8px');
      await expect(btn).toHaveCSS('border-top-left-radius', '4px');
    });
  });

  test('md のボタンは高さ 36px・16px Bold、選択中は primary の 1px 枠', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      const selected = page.getByRole('button', { name: 'エンコード' });
      const other = page.getByRole('button', { name: 'デコード' });
      await expect(selected).toHaveAttribute('aria-pressed', 'true');

      const box = await selected.boundingBox();
      expect(box?.height).toBe(36);
      await expect(selected).toHaveCSS('font-size', '16px');
      await expect(selected).toHaveCSS('font-weight', '700');
      await expect(selected).toHaveCSS('border-top-color', PRIMARY);
      await expect(selected).toHaveCSS('border-top-width', '1px');
      // 未選択も枠幅 1px（透明）を持ち、選択の切り替えで大きさが変わらない
      await expect(other).toHaveCSS('border-top-width', '1px');
      await expect(other).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    });
  });

  test('未選択の hover は blue-200 の地・blue-1000 の文字・下線で、選択中は hover しても下線が出ない', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      const selected = page.getByRole('button', { name: 'エンコード' });
      const other = page.getByRole('button', { name: 'デコード' });
      await other.hover();
      await expect(other).toHaveCSS('background-color', BG_HOVER);
      await expect(other).toHaveCSS('color', PRIMARY_HOVER);
      await expect(other).toHaveCSS('text-decoration-line', 'underline');

      await selected.hover();
      await expect(selected).toHaveCSS('text-decoration-line', 'none');
      await expect(selected).toHaveCSS('background-color', WHITE);
    });
  });
});

test.describe('ToggleChips（DADS 化）', () => {
  test('チップは角丸 8px・最小高 32px・16px Bold で、ピル型ではない', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      const chip = page.getByRole('button', { name: /^g:/ });
      await expect(chip).toBeVisible();
      await expect(chip).toHaveCSS('border-top-left-radius', '8px');
      await expect(chip).toHaveCSS('font-size', '16px');
      await expect(chip).toHaveCSS('font-weight', '700');
      const box = await chip.boundingBox();
      expect(box?.height).toBe(32);
    });
  });

  test('文字トークンは DADS の最小 14px（以前は 13px）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      const token = page.locator('.toggle-chip__token').first();
      await expect(token).toBeVisible();
      await expect(token).toHaveCSS('font-size', '14px');
    });
  });

  test('ON は primary 塗り・白文字、OFF の hover は outline ボタンと同じ地・下線', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      const on = page.getByRole('button', { name: /^g:/ });
      const off = page.getByRole('button', { name: /^i:/ });
      await on.click();
      await expect(on).toHaveAttribute('aria-pressed', 'true');
      // クリック直後はポインタが乗ったままで hover の色になるため、外してから通常の色を確かめる
      await page.mouse.move(0, 0);
      await expect(on).toHaveCSS('background-color', PRIMARY);
      await expect(on).toHaveCSS('color', WHITE);

      await off.hover();
      await expect(off).toHaveCSS('background-color', BG_HOVER);
      await expect(off).toHaveCSS('color', PRIMARY_HOVER);
      await expect(off).toHaveCSS('text-decoration-line', 'underline');

      // 押下中（マウスボタンを押したまま）は blue-300 の地・blue-1200 の文字（hover に負けない）
      await page.mouse.down();
      await expect(off).toHaveCSS('background-color', 'rgb(157, 183, 249)');
      await expect(off).toHaveCSS('color', 'rgb(0, 0, 96)');
      await page.mouse.up();
    });
  });

  test('操作不能のチップは solid-gray-300 の塗りで、hover しても色が変わらない', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/dummy-personal-data', async (page) => {
      const fixed = page.getByRole('button', { name: '氏名' });
      await expect(fixed).toHaveAttribute('aria-disabled', 'true');
      await expect(fixed).toBeVisible();
      await expect(fixed).toHaveCSS('background-color', DISABLED_FILL);
      await fixed.hover();
      await expect(fixed).toHaveCSS('background-color', DISABLED_FILL);
      await expect(fixed).toHaveCSS('cursor', 'not-allowed');
      // 色は transition 中に元の値が読めてしまうため、transition しない下線でも hover が当たっていないことを確かめる
      await expect(fixed).toHaveCSS('text-decoration-line', 'none');
    });
  });
});
