import { test, expect, type Page } from '@playwright/test';
import { applyProductionCsp, withProductionCsp } from './helpers';

const labels = ['すべて', '生成', 'コード・バーコード', 'エンコード・デコード', '変換・解析'];

// タブの矩形と文字の両方を確認し、右端に隠れた項目を検出する。
async function clippedTabs(page: Page): Promise<string[]> {
  return page.locator('#tab-bar').evaluate((bar) => {
    const bounds = bar.getBoundingClientRect();
    return Array.from(bar.querySelectorAll('[role="tab"]')).flatMap((tab) => {
      const box = tab.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(tab);
      const text = range.getBoundingClientRect();
      return box.left < bounds.left - 0.5 ||
        box.right > bounds.right + 0.5 ||
        box.top < bounds.top - 0.5 ||
        box.bottom > bounds.bottom + 0.5 ||
        text.left < bounds.left - 0.5 ||
        text.right > bounds.right + 0.5
        ? [tab.textContent!.trim()]
        : [];
    });
  });
}

test.describe('トップページ カテゴリタブ（production CSP 適用）', () => {
  for (const width of [390, 320]) {
    test(`${width}px で全カテゴリのボタンとラベルが収まる`, async ({ browser }) => {
      await withProductionCsp(
        browser,
        '/',
        async (page) => {
          await page.setViewportSize({ width, height: 844 });
          await expect(page.getByRole('tab')).toHaveText(labels);
          await expect.poll(() => clippedTabs(page)).toEqual([]);
          await expect
            .poll(() =>
              page.locator('#tab-bar').evaluate((bar) => bar.scrollWidth - bar.clientWidth)
            )
            .toBe(0);
        },
        { skipHydration: true }
      );
    });
  }

  test('陽性対照: 折返しを外すと同じ観測で隠れたカテゴリを検出する', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await expect.poll(() => clippedTabs(page)).toEqual([]);
        // テスト DOM だけを旧 nowrap に戻して同じ判定が違反を捉えるか確かめる。
        await page.locator('#tab-bar').evaluate((bar) => bar.classList.remove('flex-wrap'));
        await expect.poll(() => clippedTabs(page)).toContain('変換・解析');
      },
      { skipHydration: true }
    );
  });

  test('末尾パネルへの移動で末尾タブが選択され、全カテゴリを表示する', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => {
          const panels = document.getElementById('panels')!;
          panels.scrollLeft = panels.clientWidth * 4;
          panels.dispatchEvent(new Event('scrollend'));
        });
        await expect(page.getByRole('tab', { name: '変換・解析' })).toHaveAttribute(
          'aria-selected',
          'true'
        );
        await expect.poll(() => clippedTabs(page)).toEqual([]);
        await expect
          .poll(() => page.locator('#tab-bar').evaluate((bar) => bar.scrollWidth - bar.clientWidth))
          .toBe(0);
      },
      { skipHydration: true }
    );
  });

  test('タブとパネルの対応、クリック、検索からの復帰を維持する', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const tabs = page.getByRole('tab');
        for (let i = 0; i < labels.length; i++) {
          await expect(tabs.nth(i)).toHaveAttribute('id', `tab-${i}`);
          await expect(tabs.nth(i)).toHaveAttribute('aria-controls', `panel-${i}`);
          await expect(page.locator(`#panel-${i}`)).toHaveAttribute('role', 'tabpanel');
          await expect(page.locator(`#panel-${i}`)).toHaveAttribute('aria-labelledby', `tab-${i}`);
        }
        await tabs.nth(4).click();
        await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
        await expect
          .poll(() =>
            page.locator('#panels').evaluate((p) => Math.round(p.scrollLeft / p.clientWidth))
          )
          .toBe(4);
        await expect(page.locator('#panel-4 a').first()).toBeVisible();
        const search = page.getByRole('searchbox', { name: 'ツールを検索' });
        await search.fill('json csv');
        await expect(page.getByRole('tablist')).toBeHidden();
        await expect(page.locator('#search-results')).toContainText('JSON / CSV 変換');
        await page.getByRole('button', { name: '検索をクリア' }).click();
        await expect(search).toBeFocused();
        await expect(page.getByRole('tablist')).toBeVisible();
        await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
        await expect.poll(() => clippedTabs(page)).toEqual([]);
        await expect(page.locator('#panel-4 a').first()).toBeVisible();
      },
      { skipHydration: true }
    );
  });

  test('矢印・Home・End はフォーカスのみ移動し Enter・Space で選択する', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        const tabs = page.getByRole('tab');
        const search = page.getByRole('searchbox', { name: 'ツールを検索' });
        await search.focus();
        await page.keyboard.press('Tab');
        await expect(tabs.nth(0)).toBeFocused();
        await page.keyboard.press('ArrowLeft');
        await expect(tabs.nth(4)).toBeFocused();
        await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
        await expect(tabs.nth(4)).toHaveAttribute('tabindex', '0');
        await page.keyboard.press('ArrowRight');
        await expect(tabs.nth(0)).toBeFocused();
        await page.keyboard.press('End');
        await expect(tabs.nth(4)).toBeFocused();
        await page.keyboard.press('Home');
        await expect(tabs.nth(0)).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Space');
        await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
        await page.keyboard.press('Tab');
        await expect(page.locator('#panel-4 a').first()).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(tabs.nth(4)).toBeFocused();
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+Tab');
        await expect(search).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(tabs.nth(4)).toBeFocused();
      },
      { skipHydration: true }
    );
  });

  test('検索中と幅ゼロの scrollend を無視し、表示中のスクロールは同期する', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        const tabs = page.getByRole('tab');
        const panels = page.locator('#panels');
        await tabs.nth(4).click();
        await expect
          .poll(() => panels.evaluate((p) => Math.round(p.scrollLeft / p.clientWidth)))
          .toBe(4);
        const search = page.getByRole('searchbox', { name: 'ツールを検索' });
        await search.fill('json');
        expect(
          await panels.evaluate((p) => ({ hidden: p.hasAttribute('hidden'), width: p.clientWidth }))
        ).toEqual({
          hidden: true,
          width: 0,
        });
        const selectedWhileHidden = await panels.evaluate((p) => {
          p.dispatchEvent(new Event('scrollend'));
          return document.getElementById('tab-4')?.getAttribute('aria-selected');
        });
        expect(selectedWhileHidden).toBe('true');
        await expect(search).toBeFocused();
        await page.getByRole('button', { name: '検索をクリア' }).click();
        await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
        await expect(search).toBeFocused();
        const headerLink = page.locator('header').getByRole('link').first();
        await headerLink.focus();
        await panels.evaluate((p) => {
          p.parentElement!.hidden = true;
        });
        expect(
          await panels.evaluate((p) => ({ hidden: p.hasAttribute('hidden'), width: p.clientWidth }))
        ).toEqual({
          hidden: false,
          width: 0,
        });
        const selectedAtZeroWidth = await panels.evaluate((p) => {
          p.dispatchEvent(new Event('scrollend'));
          return document.getElementById('tab-4')?.getAttribute('aria-selected');
        });
        expect(selectedAtZeroWidth).toBe('true');
        await expect(headerLink).toBeFocused();
        await panels.evaluate((p) => {
          p.parentElement!.hidden = false;
        });
        await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
        await search.focus();
        await panels.evaluate((p) => p.scrollTo({ left: p.clientWidth * 2, behavior: 'instant' }));
        await panels.dispatchEvent('scrollend');
        await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
        await expect(search).toBeFocused();
        await expect(page.locator('#panel-4')).toHaveAttribute('inert', '');
        await expect(page.locator('#panel-2')).not.toHaveAttribute('inert');
        await page.keyboard.press('Tab');
        await expect(tabs.nth(2)).toBeFocused();
      },
      { skipHydration: true }
    );
  });

  test('連続選択とスクロールの中断後は最後に表示したパネルに同期する', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        const tabs = page.getByRole('tab');
        const panels = page.locator('#panels');
        await tabs.nth(4).click();
        await tabs.nth(1).click();
        await tabs.nth(3).click();
        await expect
          .poll(() => panels.evaluate((p) => Math.round(p.scrollLeft / p.clientWidth)))
          .toBe(3);
        await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
        const search = page.getByRole('searchbox', { name: 'ツールを検索' });
        await search.focus();
        await tabs.nth(4).evaluate((tab) => (tab as HTMLElement).click());
        await panels.evaluate((p) => p.scrollTo({ left: p.clientWidth, behavior: 'instant' }));
        await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
        await expect(search).toBeFocused();
      },
      { skipHydration: true }
    );
  });

  test('新パネルにフォーカスできない場合は旧パネルの操作を保つ', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        const focused = page.locator('#panel-0 a').first();
        await focused.focus();
        await page.locator('#panel-1').evaluate((panel) => {
          panel.focus = () => {};
        });
        await page
          .getByRole('tab')
          .nth(1)
          .evaluate((tab) => (tab as HTMLElement).click());
        await expect(focused).toBeFocused();
        await expect(page.getByRole('tab').nth(0)).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('#panel-0')).not.toHaveAttribute('inert');
        await expect(page.locator('#panel-1')).toHaveAttribute('inert', '');
        await expect(page.locator('#panels')).toHaveJSProperty('scrollLeft', 0);
      },
      { skipHydration: true }
    );
  });

  test('inert 非対応では全タブ・パネルを従来どおり操作できる', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        delete (HTMLElement.prototype as { inert?: boolean }).inert;
      });
      await page.goto('/');
      expect(await page.evaluate(() => 'inert' in HTMLElement.prototype)).toBe(false);
      const tabs = page.getByRole('tab');
      await tabs.nth(0).focus();
      await page.keyboard.press('ArrowRight');
      await expect(tabs.nth(0)).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(tabs.nth(1)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#panel-0')).not.toHaveAttribute('inert');
      await expect(page.locator('#panel-1')).not.toHaveAttribute('inert');
    } finally {
      await context.close();
    }
  });

  test('JavaScript 無効時は全パネルが残る', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('/');
      for (let i = 0; i < labels.length; i++) {
        await expect(page.locator(`#panel-${i}`)).not.toHaveAttribute('inert');
        const link = page.locator(`#panel-${i} a`).first();
        await expect(link).toBeAttached();
        await link.focus();
        await expect(link).toBeFocused();
      }
    } finally {
      await context.close();
    }
  });

  test('パネル内のフォーカスを保ちながら実タッチでスワイプできる', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      await page.goto('/');
      await page.locator('#panel-0 a').first().focus();
      const panels = page.locator('#panels');
      const box = (await panels.boundingBox())!;
      const y = Math.min(box.y + 120, 750);
      const initialY = await page.evaluate(() => window.scrollY);
      const session = await context.newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 320, y }],
      });
      for (const x of [280, 240, 200, 160, 120, 80]) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y }],
        });
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(page.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#panel-1')).toBeFocused();
      await expect(panels).toHaveJSProperty('scrollLeft', 390);
      expect(await page.evaluate(() => window.scrollY)).toBe(initialY);
      await page.keyboard.press('Tab');
      await expect(page.locator('#panel-1 a').first()).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(page.getByRole('tab').nth(1)).toBeFocused();
      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });

  test('ホイール操作でも旧パネル内のフォーカスを新パネルへ移す', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        const panels = page.locator('#panels');
        await page.locator('#panel-0 a').first().focus();
        await panels.hover();
        const initialY = await page.evaluate(() => window.scrollY);
        await page.mouse.wheel(1100, 0);
        await expect(page.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('#panel-1')).toBeFocused();
        expect(await page.evaluate(() => window.scrollY)).toBe(initialY);
        await page.keyboard.press('Shift+Tab');
        await expect(page.getByRole('tab').nth(1)).toBeFocused();
      },
      { skipHydration: true }
    );
  });

  test('767px と 768px で全タブが横一列に収まる', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        for (const width of [767, 768]) {
          await page.setViewportSize({ width, height: 844 });
          await expect(page.getByRole('tab')).toHaveText(labels);
          await expect.poll(() => clippedTabs(page)).toEqual([]);
          await expect
            .poll(() =>
              page.locator('#tab-bar').evaluate((bar) => bar.scrollWidth - bar.clientWidth)
            )
            .toBe(0);
          await expect
            .poll(() =>
              page.getByRole('tab').evaluateAll((tabs) => {
                const tops = tabs.map((tab) => tab.getBoundingClientRect().top);
                return Math.max(...tops) - Math.min(...tops);
              })
            )
            .toBeLessThan(0.5);
        }
      },
      { skipHydration: true }
    );
  });

  test('スマホの全タブは44px以上で互いに干渉せずタップできる', async ({ browser }) => {
    for (const width of [390, 320]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        hasTouch: true,
      });
      try {
        const page = await context.newPage();
        const guard = await applyProductionCsp(page);
        await page.goto('/');
        const tabs = page.getByRole('tab');
        for (let i = 0; i < labels.length; i++) {
          const tab = tabs.nth(i);
          const probe = await tab.evaluate((el) => {
            const box = el.getBoundingClientRect();
            const points = [box.left + 1, box.left + box.width / 2, box.right - 1].flatMap((x) =>
              [box.top + 1, box.top + box.height / 2, box.bottom - 1].map((y) =>
                el.contains(document.elementFromPoint(x, y))
              )
            );
            return { width: box.width, height: box.height, points };
          });
          expect(probe.width).toBeGreaterThanOrEqual(44);
          expect(probe.height).toBeGreaterThanOrEqual(44);
          expect(probe.points).toEqual(Array(9).fill(true));
          await tab.tap();
          await expect(tab).toHaveAttribute('aria-selected', 'true');
          await expect
            .poll(() =>
              page.locator('#panels').evaluate((p) => Math.round(p.scrollLeft / p.clientWidth))
            )
            .toBe(i);
        }
        guard.assertNoViolations();
      } finally {
        await context.close();
      }
    }
  });
});
