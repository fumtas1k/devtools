import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// DADS のレイアウト（docs/decisions.md [147]）:
// ナビのリンクはコントロールと同じ 8px 角丸、カードは 12px、hover は色だけでなく下線を足す。

test.describe('DADS のレイアウト（production CSP 適用）', () => {
  test('ヘッダーのロゴは hover で下線が付く', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        const logo = page.getByRole('link', { name: 'DevTools' }).first();
        await expect(logo).toHaveCSS('text-decoration-line', 'none');
        await logo.hover();
        await expect(logo).toHaveCSS('text-decoration-line', 'underline');
      },
      { skipHydration: true }
    );
  });

  test('サイドバーのリンクは 8px 角丸で、hover で下線が付く', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      const nav = page.getByRole('navigation', { name: 'ツール一覧' }).first();
      const current = nav.getByRole('link', { name: 'Base64 エンコード/デコード' });
      await expect(current).toHaveAttribute('aria-current', 'page');
      await expect(current).toHaveCSS('border-radius', '8px');

      const other = nav.getByRole('link', { name: 'URLエンコード/デコード' });
      await expect(other).toHaveCSS('border-radius', '8px');
      await expect(other).toHaveCSS('text-decoration-line', 'none');
      await other.hover();
      await expect(other).toHaveCSS('text-decoration-line', 'underline');
    });
  });

  test('ドロワーのリンクは 8px 角丸になる', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'メニューを開く' }).click();
      const dialog = page.getByRole('dialog', { name: 'ナビゲーション' });
      await expect(dialog.getByRole('link', { name: 'URLエンコード/デコード' })).toHaveCSS(
        'border-radius',
        '8px'
      );
    });
  });

  test('ToolCard は 12px 角丸で、hover で影が付き見出しに下線が付く', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        const card = page.getByRole('link', { name: /Base64 エンコード\/デコード/ }).first();
        await expect(card).toHaveCSS('border-radius', '12px');
        await expect(card).toHaveCSS('box-shadow', 'none');
        const title = card.getByRole('heading');
        await expect(title).toHaveCSS('text-decoration-line', 'none');
        await card.hover();
        await expect(card).not.toHaveCSS('box-shadow', 'none');
        await expect(title).toHaveCSS('text-decoration-line', 'underline');
      },
      { skipHydration: true }
    );
  });

  test('PageContainer の最大幅は 1120px で左右に 24px の余白がある', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      await page.setViewportSize({ width: 1600, height: 900 });
      const box = await page.getByRole('banner').locator('> div').boundingBox();
      expect(box?.width).toBe(1120);
      await expect(page.getByRole('banner').locator('> div')).toHaveCSS('padding-left', '24px');
    });
  });
});
