import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

test.describe('モバイルドロワー（production CSP 適用）', () => {
  test('モバイルでハンバーガーボタンが表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await expect(page.getByRole('button', { name: 'メニューを開く' })).toBeVisible();
    });
  });

  test('デスクトップではハンバーガーボタンが非表示（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await expect(page.getByRole('button', { name: 'メニューを開く' })).not.toBeVisible();
    });
  });

  test('ハンバーガーボタンでドロワーが開く（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      const dialog = page.getByRole('dialog', { name: 'ナビゲーション' });
      await expect(dialog).not.toBeVisible();

      await page.getByRole('button', { name: 'メニューを開く' }).click();

      await expect(dialog).toBeVisible();
      await expect(page.getByRole('button', { name: 'メニューを閉じる' })).toBeFocused();
      await expect(page.getByRole('button', { name: 'メニューを開く' })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
    });
  });

  test('bfcache 復元時は開いたドロワーを閉じて再操作できる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      const toggle = page.getByRole('button', { name: 'メニューを開く' });
      const dialog = page.getByRole('dialog', { name: 'ナビゲーション' });
      const body = page.locator('body');
      await toggle.click();
      await expect(dialog).toBeVisible();
      await expect(body).toHaveCSS('overflow', 'hidden');

      // Playwright の Chromium は通常 bfcache を無効にするため、復元イベントを明示する
      await page.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      );

      await expect(dialog).not.toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
      await expect(body).not.toHaveCSS('overflow', 'hidden');
      await toggle.click();
      await expect(dialog).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });
  });

  test('通常の pageshow では開いたドロワーを維持する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      const toggle = page.getByRole('button', { name: 'メニューを開く' });
      await toggle.click();

      await page.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }))
      );

      await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('button', { name: 'メニューを閉じる' })).toBeFocused();
      await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    });
  });

  test('閉じた状態の bfcache 復元ではフォーカスを移さない（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      const input = page.getByLabel('入力', { exact: true });
      await input.focus();
      await expect(input).toBeFocused();

      await page.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      );

      await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).not.toBeVisible();
      await expect(page.getByRole('button', { name: 'メニューを開く' })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
      await expect(input).toBeFocused();
      await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    });
  });

  test('閉じるボタンでドロワーが閉じる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).toBeVisible();

      await page.getByRole('button', { name: 'メニューを閉じる' }).click();

      await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).not.toBeVisible();
      const toggle = page.getByRole('button', { name: 'メニューを開く' });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
    });
  });

  test('Escape キーでドロワーが閉じる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).not.toBeVisible();
      const toggle = page.getByRole('button', { name: 'メニューを開く' });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
    });
  });

  test('現在のツールがドロワー内でハイライトされる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.getByRole('button', { name: 'メニューを開く' }).click();

      const currentLink = page
        .getByRole('dialog', { name: 'ナビゲーション' })
        .getByRole('link', { name: 'URLエンコード/デコード' });
      await expect(currentLink).toHaveAttribute('aria-current', 'page');
    });
  });

  test('ドロワーのツールリンクで遷移できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.getByRole('button', { name: 'メニューを開く' }).click();

      await page
        .getByRole('dialog', { name: 'ナビゲーション' })
        .getByRole('link', { name: 'JWTデコーダー' })
        .click();

      await expect(page).toHaveURL('/tools/jwt-decoder');
    });
  });

  test('背景クリックでドロワーが閉じる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).toBeVisible();

      // ドロワーパネル (右 256px) より左側の背景部分をクリック
      await page.mouse.click(40, 400);

      await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).not.toBeVisible();
      const toggle = page.getByRole('button', { name: 'メニューを開く' });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
    });
  });

  test('パネル内の余白をクリックしても閉じない（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      const dialog = page.getByRole('dialog', { name: 'ナビゲーション' });
      await expect(dialog).toBeVisible();

      // パネルは右端 256px（x: 134〜390）。左端の padding（16px）内は dialog 要素自身へのクリックになる
      await page.mouse.click(140, 400);

      await expect(dialog).toBeVisible();
    });
  });

  test('パネル内で押して暗幕の上で離しても閉じない（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      const dialog = page.getByRole('dialog', { name: 'ナビゲーション' });
      await expect(dialog).toBeVisible();

      // パネル内（x: 134〜390）の余白で押し、暗幕（x < 134）まで動かして離す。
      // この click は共通祖先の dialog に暗幕側の座標で届く
      await page.mouse.move(140, 400);
      await page.mouse.down();
      await page.mouse.move(40, 400);
      await page.mouse.up();

      await expect(dialog).toBeVisible();
    });
  });

  test('dialog 自身への合成 click（座標 0,0）では閉じない（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      const dialog = page.getByRole('dialog', { name: 'ナビゲーション' });
      await expect(dialog).toBeVisible();

      // 実ポインタ操作では作れない click（pointerdown が先行しない）を直接送る
      await dialog.evaluate((el) => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      await expect(dialog).toBeVisible();
    });
  });

  // ダイアログの外の要素にフォーカスがあるときに 1 件ヒットするセレクタ。
  // モーダルでは末尾の次にブラウザ側へ抜けて何もフォーカスされない状態もあり得るので、
  // 「ダイアログ内にある」ではなく「ダイアログの外にない」を検査する
  const FOCUS_OUTSIDE_DIALOG = 'body :focus:not(dialog, dialog *)';

  test('陽性対照: 閉じている間の Tab はページ側に移り、フォーカス検知セレクタが捉える（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);

      await page.keyboard.press('Tab');

      await expect(page.locator(FOCUS_OUTSIDE_DIALOG)).toHaveCount(1);
    });
  });

  test('開いている間はフォーカスがページ側（ダイアログの外）に移らない（Tab / Shift+Tab）（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      const focusOutside = page.locator(FOCUS_OUTSIDE_DIALOG);

      await page.getByRole('button', { name: 'メニューを開く' }).click();
      const dialog = page.getByRole('dialog', { name: 'ナビゲーション' });
      await expect(dialog).toBeVisible();
      await expect(focusOutside).toHaveCount(0);

      const focusableCount =
        (await dialog.getByRole('button').count()) + (await dialog.getByRole('link').count());
      expect(focusableCount).toBeGreaterThan(1);

      // 要素数より多く押して、一周してもページ側に移らないことを見る
      for (const key of ['Tab', 'Shift+Tab']) {
        for (let i = 0; i < focusableCount + 3; i++) {
          await page.keyboard.press(key);
          await expect(focusOutside).toHaveCount(0);
        }
      }
    });
  });

  test('開いている間は body がスクロールしない（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      const body = page.locator('body');
      await expect(body).not.toHaveCSS('overflow', 'hidden');

      await page.getByRole('button', { name: 'メニューを開く' }).click();
      await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).toBeVisible();
      await expect(body).toHaveCSS('overflow', 'hidden');

      await page.getByRole('button', { name: 'メニューを閉じる' }).click();
      await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).not.toBeVisible();
      await expect(body).not.toHaveCSS('overflow', 'hidden');
    });
  });

  test('開いたまま PC 幅にすると閉じる（ページが操作不能のまま残らない）（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/url-encode', async (page) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      const dialog = page.getByRole('dialog', { name: 'ナビゲーション' });
      await expect(dialog).toBeVisible();

      await page.setViewportSize(DESKTOP_VIEWPORT);

      await expect(dialog).not.toBeVisible();
      await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
      // 非表示のトグルも閉じた状態に同期されている
      await expect(
        page.getByRole('button', { name: 'メニューを開く', includeHidden: true })
      ).toHaveAttribute('aria-expanded', 'false');

      // スマホ幅に戻しても開いたままにならない
      await page.setViewportSize(MOBILE_VIEWPORT);
      await expect(dialog).not.toBeVisible();

      // inert が残っていれば、click の actionability チェックで失敗する
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      await expect(dialog).toBeVisible();
    });
  });
});
