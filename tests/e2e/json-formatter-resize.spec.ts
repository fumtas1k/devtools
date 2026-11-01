import { test, expect, type Locator, type Page } from '@playwright/test';
import { withProductionCsp } from './helpers';

async function resize(page: Page, input: Locator, delta: number) {
  await input.scrollIntoViewIfNeeded();
  const box = await input.boundingBox();
  if (!box) throw new Error('入力欄が見つかりません');
  await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4 + delta, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await input.boundingBox())!.height).not.toBe(box.height);
}

async function expectAligned(input: Locator, tree: Locator) {
  await expect
    .poll(async () => {
      const a = await input.boundingBox();
      const b = await tree.boundingBox();
      if (!a || !b) return Infinity;
      return Math.max(
        Math.abs(a.y - b.y),
        Math.abs(a.height - b.height),
        Math.abs(a.y + a.height - b.y - b.height)
      );
    })
    .toBeLessThanOrEqual(1);
}

test('PC の入力リサイズにツリー枠が追従する（production CSP）', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const input = page.getByLabel('入力', { exact: true });
    const tree = page.locator('.json-tree-box');
    await page.getByRole('button', { name: 'ツリー', exact: true }).click();
    await expectAligned(input, tree);
    await resize(page, input, 120);
    await expectAligned(input, tree);
    await resize(page, input, -180);
    await expectAligned(input, tree);
    await resize(page, input, 80);
    await expectAligned(input, tree);
    await input.fill('{"a": 1}');
    await expect(page.getByText('"a"', { exact: true })).toBeVisible();
    await expectAligned(input, tree);
    await input.fill('{"a":}');
    await expect(page.getByRole('alert')).toBeVisible();
    await expectAligned(input, tree);
  });
});

test('テキストでのリサイズ、表示切替、クリア後も追従する', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const input = page.getByLabel('入力', { exact: true });
    await input.fill('{"a": 1}');
    await resize(page, input, 100);
    await page.getByRole('button', { name: 'ツリー', exact: true }).click();
    const tree = page.locator('.json-tree-box');
    await expectAligned(input, tree);
    await page.getByRole('button', { name: 'テキスト', exact: true }).click();
    await resize(page, input, -60);
    await page.getByRole('button', { name: 'ツリー', exact: true }).click();
    await expectAligned(input, tree);
    await page.getByRole('button', { name: 'クリア', exact: true }).click();
    await input.fill('{"b": 2}');
    await page.getByRole('button', { name: 'ツリー', exact: true }).click();
    await expect(page.getByText('"b"', { exact: true })).toBeVisible();
    await expectAligned(input, tree);
  });
});

test('大きいツリーはリサイズ後も枠内でスクロールと展開ができる', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const input = page.getByLabel('入力', { exact: true });
    await input.fill(
      JSON.stringify(Array.from({ length: 1500 }, (_, i) => ({ name: `item-${i}` })))
    );
    await page.getByRole('button', { name: 'ツリー', exact: true }).click();
    const box = page.locator('.json-tree-box');
    const tree = page.getByRole('group', { name: 'JSON ツリー' });
    await expect(tree.getByText('item-0')).toBeVisible();
    await resize(page, input, -120);
    await expectAligned(input, box);
    await resize(page, input, 90);
    await expectAligned(input, box);
    expect(await tree.locator('li.json-row').count()).toBeLessThan(200);
    await box.hover();
    await page.mouse.wheel(0, 10_000_000);
    await expect(tree.getByText('item-1499')).toBeVisible();
    await page.getByRole('button', { name: '全折りたたみ' }).click();
    await expect(tree.getByText('1500 項目')).toBeVisible();
    await tree.getByRole('button', { name: '展開する' }).first().click();
    await expect(tree.getByText('1 項目').first()).toBeVisible();
  });
});

test('モバイルと md 境界では独立した高さと縦積みを維持する', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const input = page.getByLabel('入力', { exact: true });
    await page.getByRole('button', { name: 'ツリー', exact: true }).click();
    const tree = page.locator('.json-tree-box');
    const initialTree = (await tree.boundingBox())!;
    expect(initialTree.y).toBeGreaterThan((await input.boundingBox())!.y);
    await resize(page, input, -100);
    expect((await tree.boundingBox())!.height).toBe(initialTree.height);
    await page.setViewportSize({ width: 768, height: 844 });
    await expectAligned(input, tree);
    await page.setViewportSize({ width: 767, height: 844 });
    await expect.poll(async () => (await tree.boundingBox())!.height).toBe(initialTree.height);
    expect((await tree.boundingBox())!.y).toBeGreaterThan((await input.boundingBox())!.y);
    await page.setViewportSize({ width: 768, height: 844 });
    await expectAligned(input, tree);
  });
});
