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

  test('Tab・Shift+Tab と Enter・Space で各タブを操作できる', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const tabs = page.getByRole('tab');
        await page.getByRole('searchbox', { name: 'ツールを検索' }).focus();
        for (let i = 0; i < labels.length; i++) {
          await page.keyboard.press('Tab');
          await expect(tabs.nth(i)).toBeFocused();
        }
        await page.keyboard.press('Enter');
        await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
        await expect
          .poll(() =>
            page.locator('#panels').evaluate((p) => Math.abs(p.scrollLeft - p.clientWidth * 4) < 1)
          )
          .toBe(true);
        await page.keyboard.press('Shift+Tab');
        await expect(tabs.nth(3)).toBeFocused();
        await page.keyboard.press('Space');
        await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
        await expect
          .poll(() =>
            page.locator('#panels').evaluate((p) => Math.abs(p.scrollLeft - p.clientWidth * 3) < 1)
          )
          .toBe(true);
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
