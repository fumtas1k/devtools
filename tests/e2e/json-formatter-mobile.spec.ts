import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test('スマホでは詳細設定を閉じても主要操作を表示する', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: '詳細設定' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expect(page.getByLabel('クエリ (JMESPath)')).toBeHidden();
    await expect(page.getByRole('button', { name: '最小化' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ツリー' })).toBeVisible();
  });
});

test('スマホで入力と結果の間をフォーカスごと移動できる', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('入力', { exact: true }).fill('{"a":1}');
    await page.getByRole('button', { name: '結果へ移動' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#json-formatter-result-region')).toBeFocused();
    const ring = await page.locator('#json-formatter-result-region').evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.outlineWidth, offset: style.outlineOffset };
    });
    expect(ring).toEqual({ width: '4px', offset: '2px' });
    const returnButton = await page.getByRole('button', { name: '入力へ戻る' }).boundingBox();
    expect(returnButton!.y).toBeGreaterThanOrEqual(64);
    const resultTop = await page.getByText('結果', { exact: true }).boundingBox();
    expect(resultTop!.y).toBeGreaterThanOrEqual(0);
    expect(resultTop!.y).toBeLessThan(844);
    await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue(/"a": 1/);
    await page.getByRole('button', { name: '入力へ戻る' }).focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#json-formatter-input-region')).toBeFocused();
    const inputRing = await page.locator('#json-formatter-input-region').evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.outlineWidth, offset: style.outlineOffset };
    });
    expect(inputRing).toEqual({ width: '4px', offset: '2px' });
    const forwardButton = await page.getByRole('button', { name: '結果へ移動' }).boundingBox();
    expect(forwardButton!.y).toBeGreaterThanOrEqual(64);
    const inputTop = await page.getByText('入力', { exact: true }).boundingBox();
    expect(inputTop!.y).toBeGreaterThanOrEqual(0);
    expect(inputTop!.y).toBeLessThan(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390
    );
    await expect(page.getByLabel('入力', { exact: true })).toHaveValue('{"a":1}');
  });
});

test('詳細設定はキーボードで開閉でき、クエリの状態と値を保持する', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('入力', { exact: true }).fill('{"a":{"b":1}}');
    const toggle = page.getByRole('button', { name: '詳細設定' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: '4', exact: true }).click();
    const query = page.getByLabel('クエリ (JMESPath)');
    await query.fill('a');
    await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue('{\n    "b": 1\n}');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(query).toBeHidden();
    await expect(page.getByText('クエリ適用中')).toBeVisible();
    await toggle.click();
    await expect(query).toHaveValue('a');
    await expect(page.getByRole('button', { name: '4', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await query.fill('items[?(');
    await expect(page.getByRole('alert')).toContainText('クエリ式が不正です');
    await toggle.click();
    await expect(page.getByText('クエリエラー')).toBeVisible();
  });
});

test('767px と 768px を往復しても設定と表示形式を維持する', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 767, height: 844 });
    const toggle = page.getByRole('button', { name: '詳細設定' });
    await toggle.click();
    await expect(page.getByRole('group', { name: 'インデント' })).toHaveCount(1);
    await page.getByRole('button', { name: '4', exact: true }).click();
    await page.getByLabel('クエリ (JMESPath)').fill('a');
    await page.getByRole('button', { name: 'ツリー' }).click();
    await toggle.click();
    await page.setViewportSize({ width: 768, height: 844 });
    await expect(toggle).toBeHidden();
    await expect(page.getByRole('group', { name: 'インデント' })).toHaveCount(1);
    await expect(page.getByLabel('クエリ (JMESPath)')).toBeVisible();
    await expect(page.getByRole('button', { name: '4', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByRole('button', { name: 'ツリー' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.setViewportSize({ width: 767, height: 844 });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByLabel('クエリ (JMESPath)')).toBeHidden();
    await expect(page.getByRole('group', { name: 'インデント' })).toHaveCount(0);
    await toggle.click();
    await expect(page.getByRole('group', { name: 'インデント' })).toHaveCount(1);
    await expect(page.getByLabel('クエリ (JMESPath)')).toHaveValue('a');
  });
});

test('PC とスマホの Tab 順は表示順に沿う', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    const button = (name: string) => page.getByRole('button', { name, exact: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await button('2').focus();
    for (const name of ['4', 'タブ', '整形', '最小化', 'テキスト', 'ツリー', 'マスク', '型']) {
      await page.keyboard.press('Tab');
      await expect(button(name)).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('クエリ (JMESPath)')).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await button('整形').focus();
    for (const name of ['最小化', 'テキスト', 'ツリー', 'マスク', '型', '詳細設定']) {
      await page.keyboard.press('Tab');
      await expect(button(name)).toBeFocused();
    }
    await page.keyboard.press('Enter');
    for (const name of ['2', '4', 'タブ']) {
      await page.keyboard.press('Tab');
      await expect(button(name)).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('クエリ (JMESPath)')).toBeFocused();
  });
});

test('スマホで各表示と既存操作を使い、横にはみ出さない', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue(/東京タワー/);
    for (const view of ['テキスト', 'ツリー', 'マスク', '型']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      await page.getByRole('button', { name: '結果へ移動' }).click();
      await expect(page.locator('#json-formatter-result-region')).toBeFocused();
      await expect(page.getByRole('button', { name: '入力へ戻る' })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390
      );
      await page.getByRole('button', { name: '入力へ戻る' }).click();
      await expect(page.locator('#json-formatter-input-region')).toBeFocused();
      await expect(page.getByRole('button', { name: view, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    }
    await page.getByRole('button', { name: 'ツリー' }).click();
    const tree = page.getByRole('group', { name: 'JSON ツリー' });
    await expect(tree.getByText('東京タワー')).toBeVisible();
    await page.getByRole('button', { name: '全折りたたみ' }).click();
    await expect(tree.getByText('東京タワー')).toHaveCount(0);
    await page.getByRole('button', { name: '全展開' }).click();
    await expect(tree.getByText('東京タワー')).toBeVisible();
    await page.getByRole('button', { name: 'マスク', exact: true }).click();
    const mask = page.getByRole('textbox', { name: 'マスク済み結果' });
    await expect(mask).not.toHaveValue(/info@tokyo-tower.jp/);
    await page.getByRole('button', { name: /メール/ }).click();
    await expect(mask).toHaveValue(/info@tokyo-tower.jp/);
    await page.getByRole('button', { name: '型', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '生成された型' })).toHaveValue(/interface/);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'ダウンロード' }).click();
    expect((await downloadPromise).suggestedFilename()).toBe('types.ts');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'コピー', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('interface');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390
    );
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(page.getByLabel('入力', { exact: true })).toHaveValue('');
  });
});

test('新しい操作は 44px 以上で、PC では左右に並ぶ', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const name of ['詳細設定', '結果へ移動', '入力へ戻る']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    const input = await page.getByLabel('入力', { exact: true }).boundingBox();
    const output = await page.getByRole('textbox', { name: '整形結果' }).boundingBox();
    expect(output!.x).toBeGreaterThan(input!.x + input!.width);
    expect(Math.abs(output!.y - input!.y)).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: '結果へ移動' })).toBeHidden();
    await expect(page.getByLabel('クエリ (JMESPath)')).toBeVisible();
  });
});
