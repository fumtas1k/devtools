import { test, expect } from '@playwright/test';

// global.css の CSS 変数と対応
const COLOR_LINK = 'rgb(37, 99, 235)'; // --color-link: #2563eb
const COLOR_PRIMARY = 'rgb(26, 86, 219)'; // --color-primary: #1a56db
const COLOR_TEXT = 'rgb(17, 24, 39)'; // --color-text: #111827

test.describe('Link Styles', () => {
  test.beforeEach(async ({ page }) => {
    // UI 規約 §3.1 に従い状態をクリア
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test('privacy page link has correct color and hover color', async ({ page }) => {
    await page.goto('/privacy');

    const link = page.getByRole('link', { name: 'Cloudflare のプライバシーポリシー' });
    await expect(link).toBeVisible();

    // Normal state
    await expect(link).toHaveCSS('color', COLOR_LINK);

    // Hover state
    await link.hover();
    await expect(link).toHaveCSS('color', COLOR_PRIMARY);
  });

  test('about page tool links have correct color', async ({ page }) => {
    await page.goto('/about');
    // メインコンテンツ内の最初のリンクを取得
    const link = page.getByRole('main').getByRole('link').first();
    await expect(link).toBeVisible();

    await expect(link).toHaveCSS('color', COLOR_LINK);

    await link.hover();
    await expect(link).toHaveCSS('color', COLOR_PRIMARY);
  });

  test('tool layout breadcrumb link has correct color', async ({ page }) => {
    await page.goto('/tools/base64');

    const link = page.getByRole('link', { name: 'ホーム' });
    await expect(link).toBeVisible();

    await expect(link).toHaveCSS('color', COLOR_LINK);

    await link.hover();
    await expect(link).toHaveCSS('color', COLOR_PRIMARY);
  });

  test('index page tool card title and link have correct hover color', async ({ page }) => {
    await page.goto('/');

    // 最初のツールカードを取得
    const card = page.getByRole('main').getByRole('link').first();
    const title = card.getByRole('heading', { level: 2 });
    const link = card.locator('.text-link');

    await expect(card).toBeVisible();

    // Normal state
    await expect(title).toHaveCSS('color', COLOR_TEXT);
    await expect(link).toHaveCSS('color', COLOR_LINK);

    // Hover state
    await card.hover();
    await expect(title).toHaveCSS('color', COLOR_PRIMARY);

    // リンク自体をホバー
    await link.hover();
    await expect(link).toHaveCSS('color', COLOR_PRIMARY);
  });

  test('should have .text-link:visited style definition in the stylesheet', async ({ page }) => {
    await page.goto('/');

    // 検証用の要素を注入
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = 'https://example.com/test-link-' + Math.random();
      link.className = 'text-link';
      link.id = 'test-link';
      link.textContent = 'Test Link';
      document.body.appendChild(link);
    });

    const link = page.locator('#test-link');

    // 通常時の色確認 (--color-link: #2563eb)
    await expect(link).toHaveCSS('color', COLOR_LINK);

    // :visited の定義確認
    // ブラウザ上の全スタイルシートを走査して定義を確認する
    const hasVisitedRule = await page.evaluate(() => {
      return Array.from(document.styleSheets).some((sheet) => {
        try {
          return Array.from(sheet.cssRules).some(
            (rule) =>
              rule instanceof CSSStyleRule &&
              (rule.selectorText.includes('.text-link:visited') ||
                rule.selectorText.includes('.text-link:where(:visited)'))
          );
        } catch (e) {
          // クロスドメインのスタイルシート等はアクセス不可な場合があるため無視
          return false;
        }
      });
    });

    expect(hasVisitedRule).toBe(true);
  });
});
