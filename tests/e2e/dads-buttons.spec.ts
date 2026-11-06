import { test, expect, type Locator, type Page } from '@playwright/test';
import { waitForReactHydration } from './helpers';

/**
 * DADS Button の見た目（docs/decisions.md [140]）。
 * solid-fill / outline / danger（カメラ停止）/ text と、FileInputButton・CopyButton・
 * RemoveButton（削除の ×）の通常・hover・:focus-visible・disabled の computed style を検証する。
 *
 * 陽性対照: Phase 5 以前の実装（primary の枠が 1px solid、outline が灰色地、hover に下線なし、
 * disabled が bg-subtle + muted 文字、compact が 32px）では、ラベル行の高さのテストを除く各テストが
 * fail することを確認済み。ラベル行の高さのテストは、ボタンを sm（36px）にしたままラベル行を
 * min-h-8 に戻すと fail する（4px ずれる）ことを確認済み。
 */

const PRIMARY = 'rgb(0, 23, 193)'; // blue-900
const PRIMARY_HOVER = 'rgb(0, 17, 143)'; // blue-1000
const WHITE = 'rgb(255, 255, 255)';
const BG_PRIMARY_HOVER = 'rgb(197, 215, 251)'; // blue-200
const BG_ACTIVE = 'rgb(232, 241, 254)'; // blue-50
const DISABLED = 'rgb(179, 179, 179)'; // solid-gray-300
const TEXT_ON_DISABLED = 'rgb(242, 242, 242)'; // solid-gray-50
const ERROR_BG = 'rgb(253, 238, 238)'; // red-50
const ERROR_TEXT = 'rgb(206, 0, 0)'; // error-2
const MUTED = 'rgb(77, 77, 77)'; // solid-gray-700
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/** キーボード操作でフォーカスを当てる（:focus-visible を確実に成立させる） */
async function focusByKeyboard(page: Page, target: Locator): Promise<void> {
  await target.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(target).toBeFocused();
}

async function expectHeight(target: Locator, px: number): Promise<void> {
  const box = await target.boundingBox();
  expect(box?.height).toBeCloseTo(px, 0);
}

test.describe('DADS Button の見た目', () => {
  test.describe('qr-ticket（solid-fill / outline / disabled。いずれも既定の compact）', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/tools/qr-ticket');
      await waitForReactHydration(page);
    });

    test('solid-fill は blue-900 の塗り・4px double の枠・compact の 36px', async ({ page }) => {
      const btn = page.getByRole('button', { name: '鍵ペアを新規生成' });
      await expect(btn).toHaveCSS('background-color', PRIMARY);
      await expect(btn).toHaveCSS('color', WHITE);
      await expect(btn).toHaveCSS('border-top-style', 'double');
      await expect(btn).toHaveCSS('border-top-width', '4px');
      await expect(btn).toHaveCSS('border-top-left-radius', '6px');
      await expect(btn).toHaveCSS('font-size', '16px');
      await expect(btn).toHaveCSS('text-decoration-line', 'none');
      await expectHeight(btn, 36);
    });

    test('solid-fill は hover で blue-1000 + 下線', async ({ page }) => {
      const btn = page.getByRole('button', { name: '鍵ペアを新規生成' });
      await btn.hover();
      await expect(btn).toHaveCSS('background-color', PRIMARY_HOVER);
      await expect(btn).toHaveCSS('text-decoration-line', 'underline');
    });

    test('solid-fill は :focus-visible でも hover と同じ見た目', async ({ page }) => {
      const btn = page.getByRole('button', { name: '鍵ペアを新規生成' });
      await focusByKeyboard(page, btn);
      await expect(btn).toHaveCSS('background-color', PRIMARY_HOVER);
      await expect(btn).toHaveCSS('text-decoration-line', 'underline');
    });

    test('solid-fill の disabled は solid-gray-300 の塗り + solid-gray-50 の文字で、hover しても下線を出さない', async ({
      page,
    }) => {
      const btn = page.getByRole('button', { name: '一括生成' });
      await expect(btn).toBeDisabled();
      await expect(btn).toHaveCSS('background-color', DISABLED);
      await expect(btn).toHaveCSS('color', TEXT_ON_DISABLED);
      await btn.hover({ force: true });
      await expect(btn).toHaveCSS('text-decoration-line', 'none');
      await expect(btn).toHaveCSS('background-color', DISABLED);
    });

    // レイヤー外の `:where(button) { cursor: pointer }` が @layer components の
    // `.btn-action:disabled { cursor: not-allowed }` を上書きしていた不具合の回帰ガード
    test('disabled のボタンは cursor が not-allowed、有効なボタンは pointer', async ({ page }) => {
      await expect(page.getByRole('button', { name: '一括生成' })).toHaveCSS(
        'cursor',
        'not-allowed'
      );
      await expect(page.getByRole('button', { name: '鍵ペアを新規生成' })).toHaveCSS(
        'cursor',
        'pointer'
      );
    });

    test('variant="default" は outline（白地・blue-900 の文字と 1px 枠）', async ({ page }) => {
      const btn = page.getByRole('button', { name: '行を追加' });
      await expect(btn).toHaveCSS('background-color', WHITE);
      await expect(btn).toHaveCSS('color', PRIMARY);
      await expect(btn).toHaveCSS('border-top-color', PRIMARY);
      await expect(btn).toHaveCSS('border-top-width', '1px');
      await expectHeight(btn, 36);
    });
  });

  test.describe('dsn-builder（outline の sm）', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/tools/dsn-builder');
      await waitForReactHydration(page);
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
    });

    test('compact は DADS の sm（高さ 36px・角丸 6px・16px Bold）', async ({ page }) => {
      const btn = page.getByRole('button', { name: 'ホストを追加' });
      await expect(btn).toHaveCSS('border-top-left-radius', '6px');
      await expect(btn).toHaveCSS('font-size', '16px');
      await expect(btn).toHaveCSS('font-weight', '700');
      await expectHeight(btn, 36);
    });

    test('outline は hover で blue-200 の地・blue-1000 の文字 + 下線', async ({ page }) => {
      const btn = page.getByRole('button', { name: 'ホストを追加' });
      await btn.hover();
      await expect(btn).toHaveCSS('background-color', BG_PRIMARY_HOVER);
      await expect(btn).toHaveCSS('color', PRIMARY_HOVER);
      await expect(btn).toHaveCSS('text-decoration-line', 'underline');
    });

    test('outline は :focus-visible でも hover と同じ見た目', async ({ page }) => {
      const btn = page.getByRole('button', { name: 'ホストを追加' });
      await focusByKeyboard(page, btn);
      await expect(btn).toHaveCSS('background-color', BG_PRIMARY_HOVER);
      await expect(btn).toHaveCSS('text-decoration-line', 'underline');
    });

    test('CopyButton は outline の sm で、hover で blue-200 の地 + 下線', async ({ page }) => {
      const btn = page.getByRole('button', { name: /コピー/ }).first();
      await expect(btn).toHaveCSS('background-color', WHITE);
      await expect(btn).toHaveCSS('border-top-color', PRIMARY);
      await expectHeight(btn, 36);
      await btn.hover();
      await expect(btn).toHaveCSS('background-color', BG_PRIMARY_HOVER);
      await expect(btn).toHaveCSS('text-decoration-line', 'underline');
    });
  });

  test.describe('qr-reader（danger: カメラ停止）', () => {
    // danger の対象は、カメラ停止だけになった（行の削除は RemoveButton、[162]）。
    // 本物の MediaStream（canvas.captureStream）を返す getUserMedia に差し替えて、停止ボタンを出す。
    // 陽性対照: .btn-action--danger:hover の rule を壊す（地・文字色を外す）と hover のテストが fail する
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: {
            getUserMedia: () => {
              const canvas = document.createElement('canvas');
              canvas.width = 64;
              canvas.height = 48;
              canvas.getContext('2d')?.fillRect(0, 0, 64, 48);
              return Promise.resolve(canvas.captureStream(10));
            },
          },
        });
      });
      await page.goto('/tools/qr-reader');
      await waitForReactHydration(page);
      await page.getByRole('button', { name: 'カメラを起動' }).click();
      await expect(page.getByRole('button', { name: 'カメラを停止' })).toBeVisible();
    });

    test('danger は白地で、hover で red-50 の地・error-2 の文字 + 下線', async ({ page }) => {
      const btn = page.getByRole('button', { name: 'カメラを停止' });
      await expect(btn).toHaveCSS('background-color', WHITE);
      await btn.hover();
      await expect(btn).toHaveCSS('background-color', ERROR_BG);
      await expect(btn).toHaveCSS('color', ERROR_TEXT);
      await expect(btn).toHaveCSS('text-decoration-line', 'underline');
    });
  });

  test.describe('RemoveButton（削除の ×。text variant から派生、[162]）', () => {
    // 陽性対照: .btn-remove の hover / :focus-visible の rule を外す、または通常時を赤・枠付きにすると fail する
    test.describe('dsn-builder', () => {
      test.beforeEach(async ({ page }) => {
        await page.goto('/tools/dsn-builder');
        await waitForReactHydration(page);
        await page.getByRole('button', { name: 'サンプルを入力' }).click();
      });

      test('通常時は 32×32px・背景透明・muted の色・角丸 6px・枠なし', async ({ page }) => {
        const btn = page.getByRole('button', { name: 'パラメータ 1 を削除' });
        const box = await btn.boundingBox();
        expect(box?.width).toBeCloseTo(32, 0);
        expect(box?.height).toBeCloseTo(32, 0);
        await expect(btn).toHaveCSS('background-color', TRANSPARENT);
        await expect(btn).toHaveCSS('color', MUTED);
        await expect(btn).toHaveCSS('border-top-width', '0px');
        await expect(btn).toHaveCSS('border-top-left-radius', '6px');
        await expect(btn).toHaveCSS('cursor', 'pointer');
      });

      test('hover で blue-50 の地・blue-1000 の文字', async ({ page }) => {
        const btn = page.getByRole('button', { name: 'パラメータ 1 を削除' });
        await btn.hover();
        await expect(btn).toHaveCSS('background-color', BG_ACTIVE);
        await expect(btn).toHaveCSS('color', PRIMARY_HOVER);
      });

      test(':focus-visible でも hover と同じ見た目', async ({ page }) => {
        const btn = page.getByRole('button', { name: 'パラメータ 1 を削除' });
        await focusByKeyboard(page, btn);
        await expect(btn).toHaveCSS('background-color', BG_ACTIVE);
        await expect(btn).toHaveCSS('color', PRIMARY_HOVER);
      });
    });

    test('qr-ticket: disabled は solid-gray-300 の文字・背景透明・not-allowed で、hover しても変わらない', async ({
      page,
    }) => {
      await page.goto('/tools/qr-ticket');
      await waitForReactHydration(page);
      // 初期は 1 行なので「行 1 を削除」は disabled
      const btn = page.getByRole('button', { name: '行 1 を削除' });
      await expect(btn).toBeDisabled();
      await expect(btn).toHaveCSS('color', DISABLED);
      await expect(btn).toHaveCSS('background-color', TRANSPARENT);
      await expect(btn).toHaveCSS('cursor', 'not-allowed');
      await btn.hover({ force: true });
      await expect(btn).toHaveCSS('background-color', TRANSPARENT);
      await expect(btn).toHaveCSS('color', DISABLED);
    });
  });

  test.describe('json-formatter（text: ClearButton）', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/tools/json-formatter');
      await waitForReactHydration(page);
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
    });

    test('text は常に下線（offset 3px）で、hover で blue-50 の地 + 3px の下線', async ({
      page,
    }) => {
      const btn = page.getByRole('button', { name: 'クリア' });
      await expect(btn).toHaveCSS('color', PRIMARY);
      await expect(btn).toHaveCSS('text-decoration-line', 'underline');
      await expect(btn).toHaveCSS('text-underline-offset', '3px');
      await btn.hover();
      await expect(btn).toHaveCSS('background-color', BG_ACTIVE);
      await expect(btn).toHaveCSS('text-decoration-thickness', '3px');
    });
  });

  test.describe('json-formatter（ラベル行の高さ）', () => {
    // compact ボタン（sm 36px）を置いた結果ヘッダと、ボタンの無い入力ヘッダの高さが同じ（min-h-9）で、
    // PC の横並びで入力欄と結果欄の上端が揃う。ラベル行が min-h-8（32px）のままだと 4px ずれる
    test('PC で入力欄と結果欄の上端が揃う', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/tools/json-formatter');
      await waitForReactHydration(page);
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await expect(page.getByRole('button', { name: /ダウンロード/ })).toBeVisible();

      const inputBox = await page.getByLabel('入力').boundingBox();
      const resultBox = await page.getByRole('textbox', { name: '結果' }).boundingBox();
      expect(inputBox).not.toBeNull();
      expect(resultBox).not.toBeNull();
      expect(Math.abs(inputBox!.y - resultBox!.y)).toBeLessThan(2);
    });
  });

  test.describe('uuid-v7（表の行のアイコンだけの CopyButton）', () => {
    // 表の選択行は blue-100、行 hover は blue-50（[142]）。アイコンだけの CopyButton の hover 地が
    // それらと同じ色だと見えなくなるため、outline と同じ blue-200 にしている
    test('選択行の上でも hover の地が行の地と区別できる', async ({ page }) => {
      await page.goto('/tools/uuid-v7');
      await waitForReactHydration(page);
      await page.getByRole('button', { name: '生成' }).click();
      const row = page.locator('table tbody tr').first();
      await expect(row).toHaveAttribute('data-selected', 'true');
      const copy = row.getByRole('button', { name: 'コピー' });
      await copy.hover();
      await expect(copy).toHaveCSS('background-color', BG_PRIMARY_HOVER);
      const rowBg = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(rowBg).not.toBe(BG_PRIMARY_HOVER);
    });
  });

  test.describe('har-viewer（FileInputButton）', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/tools/har-viewer');
      await waitForReactHydration(page);
    });

    test('outline の compact（36px）で、hover とキーボードフォーカスで blue-200 の地 + 下線', async ({
      page,
    }) => {
      const label = page.locator('label').filter({ hasText: 'ファイルを選択' });
      await expect(label).toHaveCSS('background-color', WHITE);
      await expect(label).toHaveCSS('border-top-color', PRIMARY);
      await expect(label).toHaveCSS('border-top-left-radius', '6px');
      await expectHeight(label, 36);

      await label.hover();
      await expect(label).toHaveCSS('background-color', BG_PRIMARY_HOVER);
      await expect(label).toHaveCSS('text-decoration-line', 'underline');

      await page.mouse.move(0, 0);
      await expect(label).toHaveCSS('background-color', WHITE);
      await focusByKeyboard(page, label.locator('input[type="file"]'));
      await expect(label).toHaveCSS('background-color', BG_PRIMARY_HOVER);
      await expect(label).toHaveCSS('text-decoration-line', 'underline');
    });

    // :focus-within だとクリックでファイル選択を開いた後も input にフォーカスが残り、
    // hover の見た目とフォーカスリングが残り続ける。:has(input:focus-visible) にした回帰ガード
    test('マウスでクリックした後はポインタを外すと通常の見た目に戻る', async ({ page }) => {
      const label = page.locator('label').filter({ hasText: 'ファイルを選択' });
      const input = label.locator('input[type="file"]');
      const chooser = page.waitForEvent('filechooser');
      await label.click();
      await chooser;
      await page.mouse.move(0, 0);
      await expect(input).toBeFocused();
      await expect(label).toHaveCSS('background-color', WHITE);
      await expect(label).toHaveCSS('outline-style', 'none');
    });
  });
});
