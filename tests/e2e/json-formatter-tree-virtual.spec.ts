// tests/e2e/json-formatter-tree-virtual.spec.ts
import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// 1500 要素 × 4 行（open/close + id/name）+ ルート 2 行 = 6002 行 > TREE_VIRTUALIZE_THRESHOLD(2000)
// 入力は約 45KB で 500KB ガードには掛からない（自動構築 → 仮想化経路のみを検証する）
const bigJson = () =>
  JSON.stringify(Array.from({ length: 1500 }, (_, i) => ({ id: i, name: `item-${i}` })));

test.describe('JSON ツリー仮想化（production CSP 適用）', () => {
  // 陽性対照: 仮想化が機能しなければ（全行 DOM 化なら）この assert は fail する。
  // 旧実装に当てて fail することを確認済み（Task 6）。
  test('閾値超の JSON で可視範囲のみ DOM 化される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill(bigJson());
      await page.getByRole('button', { name: 'ツリー', exact: true }).click();
      const tree = page.getByRole('group', { name: 'JSON ツリー' });
      await expect(tree).toBeVisible();
      await expect(tree.getByText('"id"').first()).toBeVisible();
      const liCount = await tree.locator('li.json-row').count();
      expect(liCount).toBeGreaterThan(0);
      expect(liCount).toBeLessThan(500); // 総行数 6002 に対し可視範囲 + overscan のみ
    });
  });

  test('スクロールで末尾付近の行が描画される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill(bigJson());
      await page.getByRole('button', { name: 'ツリー', exact: true }).click();
      const tree = page.getByRole('group', { name: 'JSON ツリー' });
      await expect(tree.getByText('"id"').first()).toBeVisible();
      await tree.hover();
      await page.mouse.wheel(0, 10_000_000); // コンテナ最下部まで一気にスクロール
      await expect(tree.getByText('item-1499')).toBeVisible();
    });
  });

  test('仮想ビューでも開閉・全展開/全折りたたみが機能する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill(bigJson());
      await page.getByRole('button', { name: 'ツリー', exact: true }).click();
      const tree = page.getByRole('group', { name: 'JSON ツリー' });
      await expect(tree.getByText('"id"').first()).toBeVisible();

      // 全折りたたみ → ルートの折りたたみ行 1 行だけになる
      await page.getByRole('button', { name: '全折りたたみ' }).click();
      await expect(tree.getByText('1500 項目')).toBeVisible();
      expect(await tree.locator('li.json-row').count()).toBe(1);

      // ルートを展開 → 子コンテナの折りたたみ行（2 項目）が見える
      await tree.getByRole('button', { name: '展開する' }).first().click();
      await expect(tree.getByText('2 項目').first()).toBeVisible();

      // 全展開へ戻すとプリミティブ行が見える
      await page.getByRole('button', { name: '全展開' }).click();
      await expect(tree.getByText('"id"').first()).toBeVisible();
    });
  });

  // 陰性対照（陽性対照とは別 test）: 閾値未満の入力は従来の入れ子ツリーのまま。
  // 仮想化の適用条件が壊れて常時仮想化になると fail する。
  test('閾値未満の入力では従来の入れ子ツリーのまま（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await page.getByRole('button', { name: 'ツリー', exact: true }).click();
      const tree = page.getByRole('group', { name: 'JSON ツリー' });
      await expect(tree.getByText('"name"')).toBeVisible();
      // 従来パスの目印: 入れ子 ul（仮想パスはフラット ul 1 つで入れ子なし）
      expect(await tree.locator('ul ul').count()).toBeGreaterThan(0);
    });
  });
});
