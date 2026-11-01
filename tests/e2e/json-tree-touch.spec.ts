import { expect, test, type Page } from '@playwright/test';
import { waitForReactHydration } from './helpers';

async function openTree(page: Page, json: string) {
  await page.goto('/tools/json-formatter');
  await waitForReactHydration(page);
  await page.getByLabel('入力').fill(json);
  await page.getByRole('button', { name: 'ツリー', exact: true }).click();
}

async function overlap(page: Page) {
  return page.getByRole('group', { name: 'JSON ツリー' }).evaluate((tree) => {
    const buttons = Array.from(tree.querySelectorAll('.json-row-actions .btn-copy')).filter(
      (button) => button.getAttribute('aria-label')?.startsWith('値をコピー')
    );
    const a = buttons[1]?.getBoundingClientRect();
    const b = buttons[2]?.getBoundingClientRect();
    if (!a || !b) throw new Error('隣接する値のコピーが見つからない');
    return a.bottom > b.top;
  });
}

test.describe('JSON ツリーのタッチ操作', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const [name, json] of [
    ['通常', JSON.stringify({ first: 1, second: 2, third: 3 })],
    ['仮想', JSON.stringify(Array.from({ length: 2100 }, (_, i) => i))],
  ] as const) {
    test(`${name}ツリーの隣接するコピーは重ならず押せる`, async ({ page }) => {
      await openTree(page, json);
      const tree = page.getByRole('group', { name: 'JSON ツリー' });
      const buttons = tree.getByRole('button', { name: /^値をコピー/ });
      await expect(buttons.nth(2)).toBeVisible();
      expect(await overlap(page)).toBe(false);
      for (const button of [buttons.nth(1), buttons.nth(2)]) {
        await button.evaluate((el) =>
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
        );
        const hits = await button.evaluate((el) => {
          const box = el.getBoundingClientRect();
          return [box.top + 1, box.bottom - 1].map((y) =>
            document
              .elementFromPoint(box.left + box.width / 2, y)
              ?.closest('button')
              ?.getAttribute('aria-label')
          );
        });
        expect(hits).toEqual(Array(2).fill(await button.getAttribute('aria-label')));
      }
      if (name === '仮想') {
        await tree.hover();
        await page.mouse.wheel(0, 10_000_000);
        await expect(tree.getByText('2099', { exact: true })).toBeVisible();
      }
    });
  }
});

test.describe('JSON ツリーの行高の陽性対照', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    bypassCSP: true,
  });

  test('行高を元に戻すと隣接コピーの重なりを検出する', async ({ page }) => {
    await openTree(page, JSON.stringify({ first: 1, second: 2, third: 3 }));
    await page.addStyleTag({ content: '.json-line { min-height: 0 !important; }' });
    expect(await overlap(page)).toBe(true);
  });
});
