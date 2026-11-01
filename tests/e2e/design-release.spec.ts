import { test, expect } from '@playwright/test';

test('apple-touch-icon は画像全体が不透明', async ({ page }) => {
  await page.goto('/');
  const alpha = await page.locator('link[rel="apple-touch-icon"]').evaluate(async (link) => {
    const image = new Image();
    image.src = (link as HTMLLinkElement).href;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return Array.from(pixels)
      .filter((_, i) => i % 4 === 3)
      .every((value) => value === 255);
  });
  expect(alpha).toBe(true);
});

test('カードの位置を保ち、パネルの右端と下端に影の余白を確保する', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const panel = page.getByRole('tabpanel').first();
  const cards = panel.getByRole('link');
  const bounds = await panel.evaluate((element) => {
    const container = element.parentElement!.getBoundingClientRect();
    const cardRects = Array.from(element.querySelectorAll('a')).map((card) =>
      card.getBoundingClientRect()
    );
    const search = document.getElementById('tool-search')!.getBoundingClientRect();
    return {
      left: Math.min(...cardRects.map((rect) => rect.left)) - search.left,
      right: container.right - Math.max(...cardRects.map((rect) => rect.right)),
      bottom: container.bottom - Math.max(...cardRects.map((rect) => rect.bottom)),
    };
  });
  expect(bounds.left).toBe(0);
  expect(bounds.right).toBeGreaterThanOrEqual(12);
  expect(bounds.bottom).toBeGreaterThanOrEqual(12);
  await cards.nth(2).hover();
  await expect(cards.nth(2)).not.toHaveCSS('box-shadow', 'none');
  await cards.last().hover();
  await expect(cards.last()).not.toHaveCSS('box-shadow', 'none');
});

test('スマホのタッチスワイプとタブクリックで対応するパネルへ移動する', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  const card = page.getByRole('tabpanel').first().getByRole('link').first();
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const y = Math.min(box.y + 100, 700);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 340, y }],
  });
  for (let x = 320; x >= 60; x -= 20) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(40);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const tabs = page.getByRole('tab');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await tabs.last().click();
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(async () =>
      page
        .locator('#panels')
        .evaluate((element) => Math.round(element.scrollLeft / element.clientWidth))
    )
    .toBe((await tabs.count()) - 1);
  await context.close();
});
