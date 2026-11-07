import { test, expect } from '@playwright/test';
import { applyProductionCsp, waitForReactHydration, withProductionCsp } from './helpers';

test('PC のメニューから複数語で別のツールを絞り込む', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const menu = page.locator('aside');
    const search = menu.getByRole('searchbox', { name: 'ツールを検索' });
    await expect(search).toBeVisible();
    await search.fill('JSON CSV');
    await expect(menu.getByRole('link', { name: 'JSON / CSV 変換' })).toBeVisible();
    await expect(
      menu.getByRole('link', { name: 'JSON / XML 変換', includeHidden: true })
    ).toBeHidden();
  });
});

test('スマホのメニューからカタカナで検索する', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    const menu = page.getByRole('dialog', { name: 'ナビゲーション' });
    const search = menu.getByRole('searchbox', { name: 'ツールを検索' });
    await expect(search).toBeVisible();
    await search.fill('ジェイソン');
    await expect(menu.getByRole('link', { name: 'JSON / CSV 変換' })).toBeVisible();
    await expect(
      menu.getByRole('link', { name: 'QRコード生成', includeHidden: true })
    ).toBeHidden();
  });
});

test('PC でカテゴリを横断検索し、0件とクリアから全一覧へ戻す', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const menu = page.locator('aside');
    const search = menu.getByRole('searchbox', { name: 'ツールを検索' });
    const status = menu.getByRole('status');
    await expect(menu.getByRole('link', { name: 'JSON整形・ビューア' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await search.fill('JSON');
    await expect(menu.getByRole('link', { name: 'JSON / XML 変換' })).toBeVisible();
    await expect(menu.getByRole('link', { name: '設定ファイル相互変換' })).toBeVisible();
    await expect(menu.getByText('コード・バーコード', { exact: true })).toBeHidden();
    await expect(status).toContainText('件のツールが見つかりました');
    await search.fill('存在しない語zzz');
    await expect(status).toHaveText('該当するツールがありません');
    await expect(menu.getByRole('link')).toHaveCount(0);
    await menu.getByRole('button', { name: '検索をクリア' }).click();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('');
    await expect(status).toBeEmpty();
    await expect(menu.getByRole('link', { name: 'QRコード生成' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'JSON整形・ビューア' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await search.fill('   ');
    await expect(status).toBeEmpty();
    await expect(menu.getByRole('link', { name: 'QRコード生成' })).toBeVisible();
  });
});

test('スマホ検索は閉じて再表示しても保持し、キーボードで結果へ移動できる', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const open = page.getByRole('button', { name: 'メニューを開く' });
    await open.click();
    const menu = page.getByRole('dialog', { name: 'ナビゲーション' });
    await expect(menu.getByRole('button', { name: 'メニューを閉じる' })).toBeFocused();
    const search = menu.getByRole('searchbox', { name: 'ツールを検索' });
    await search.fill('json csv');
    await menu.getByRole('button', { name: 'メニューを閉じる' }).click();
    await expect(open).toBeFocused();
    await open.click();
    await expect(search).toHaveValue('json csv');
    await expect(menu.getByRole('link', { name: 'JSON / CSV 変換' })).toBeVisible();
    await search.focus();
    await page.keyboard.press('Tab');
    await expect(menu.getByRole('button', { name: '検索をクリア' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menu.getByRole('link', { name: '日本語ダミー個人データ生成' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menu.getByRole('link', { name: 'JSON / CSV 変換' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/tools/json-csv');
  });
});

test('PC とスマホの検索値は独立し、1024px で drawer を閉じる', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const sidebar = page.locator('aside');
    const desktopSearch = sidebar.getByRole('searchbox', { name: 'ツールを検索' });
    await desktopSearch.fill('jwt');
    await expect(sidebar.getByRole('link', { name: 'JWTデコーダー' })).toBeVisible();
    await page.setViewportSize({ width: 1023, height: 800 });
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    const drawer = page.getByRole('dialog', { name: 'ナビゲーション' });
    const mobileSearch = drawer.getByRole('searchbox', { name: 'ツールを検索' });
    await expect(mobileSearch).toHaveValue('');
    await mobileSearch.fill('json');
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(drawer).toBeHidden();
    await expect
      .poll(() =>
        page.locator('#mobile-drawer').evaluate((element) => (element as HTMLDialogElement).open)
      )
      .toBe(false);
    await expect(desktopSearch).toHaveValue('jwt');
    await page.setViewportSize({ width: 1023, height: 800 });
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await expect(mobileSearch).toHaveValue('json');
    await mobileSearch.fill('存在しない語zzz');
    await expect(drawer.getByRole('status')).toHaveText('該当するツールがありません');
    await drawer.getByRole('button', { name: '検索をクリア' }).click();
    await expect(mobileSearch).toBeFocused();
    await expect(drawer.getByRole('link', { name: 'QRコード生成' })).toBeVisible();
  });
});

test('Escape は PC で検索を消し、スマホでは値を保ってメニューを閉じる', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const sidebar = page.locator('aside');
    const desktopSearch = sidebar.getByRole('searchbox', { name: 'ツールを検索' });
    await desktopSearch.fill('json');
    await desktopSearch.press('Escape');
    await expect(desktopSearch).toHaveValue('');
    await expect(sidebar.getByRole('status')).toBeEmpty();
    await expect(sidebar.getByRole('link', { name: 'QRコード生成' })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const open = page.getByRole('button', { name: 'メニューを開く' });
    await open.click();
    const drawer = page.getByRole('dialog', { name: 'ナビゲーション' });
    const search = drawer.getByRole('searchbox', { name: 'ツールを検索' });
    await search.fill('json');
    await search.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(open).toBeFocused();
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    await open.click();
    await expect(search).toHaveValue('json');
    await expect(drawer.getByRole('link', { name: 'JSON / CSV 変換' })).toBeVisible();
  });
});

test('狭いメニューでも検索入力とクリアを表示し、タッチできる', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    const guard = await applyProductionCsp(page);
    await page.goto('/tools/json-formatter');
    await waitForReactHydration(page);
    for (const size of ['desktop', 'mobile']) {
      if (size === 'mobile') {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: 'メニューを開く' }).click();
      }
      const menu =
        size === 'desktop'
          ? page.locator('aside')
          : page.getByRole('dialog', { name: 'ナビゲーション' });
      const search = menu.getByRole('searchbox', { name: 'ツールを検索' });
      await search.fill('json');
      const inputBox = await search.boundingBox();
      const clear = menu.getByRole('button', { name: '検索をクリア' });
      const result = await clear.evaluate((element) => {
        const r = element.getBoundingClientRect();
        // rounded-md の角は検索入力に重なる。角丸の内側を含む9点で確認する。
        const xs = [r.left + 8, r.left + r.width / 2, r.right - 8];
        const ys = [r.top + 8, r.top + r.height / 2, r.bottom - 8];
        return {
          width: r.width,
          height: r.height,
          hits: xs.flatMap((x) =>
            ys.map((y) => {
              const hit = document.elementFromPoint(x, y);
              return hit === element || (hit !== null && element.contains(hit));
            })
          ),
        };
      });
      expect(inputBox!.height).toBeGreaterThanOrEqual(48);
      expect(result.width).toBeGreaterThanOrEqual(44);
      expect(result.height).toBeGreaterThanOrEqual(44);
      expect(result.hits).toEqual(Array(9).fill(true));
      expect(await menu.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
      );
      await clear.click();
      await expect(search).toBeFocused();
    }
    guard.assertNoViolations();
  } finally {
    await context.close();
  }
});
