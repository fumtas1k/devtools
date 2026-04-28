import { test, expect } from '@playwright/test';

// global.css の CSS 変数と対応
const COLOR_LINK = 'rgb(37, 99, 235)'; // --color-link: #2563eb
const COLOR_PRIMARY = 'rgb(26, 86, 219)'; // --color-primary: #1a56db
const COLOR_LINK_VISITED = 'rgb(124, 58, 237)'; // --color-link-visited: #7c3aed
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
    await expect(link).toHaveCSS('text-decoration-line', 'underline');

    // Hover state
    await link.hover();
    await expect(link).toHaveCSS('color', COLOR_PRIMARY);
    await expect(link).toHaveCSS('text-decoration-thickness', '2px');
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
    const link = card.locator('.text-link-color');

    await expect(card).toBeVisible();

    // Normal state
    await expect(title).toHaveCSS('color', COLOR_TEXT);
    await expect(link).toHaveCSS('color', COLOR_LINK);
    // ツールカード内の「開く ›」 (span) には下線がないことを確認 (回帰防止)
    await expect(link).toHaveCSS('text-decoration-line', 'none');

    // Hover state
    await card.hover();
    await expect(title).toHaveCSS('color', COLOR_PRIMARY);

    // リンク自体をホバー
    await link.hover();
    await expect(link).toHaveCSS('color', COLOR_PRIMARY);
  });

  test('should have .text-link:visited style definition in the stylesheet', async ({ page }) => {
    await page.goto('/');

    // :visited の色検証のためにテスト用リンクを注入
    // 規約 §3.2 では evaluate による注入よりも expect を優先するが、
    // :visited のスタイルはブラウザのプライバシー保護仕様により getComputedStyle で取得できないため、
    // CSSOM を直接走査して定義を確認する必要がある。
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = 'https://example.com/test-link-' + Math.random();
      link.className = 'text-link';
      link.textContent = 'Test Link';
      document.body.appendChild(link);
    });

    const link = page.getByRole('link', { name: 'Test Link' });

    // 通常時の色確認 (--color-link: #2563eb)
    await expect(link).toHaveCSS('color', COLOR_LINK);

    // :visited の定義および色の確認
    // :visited は getComputedStyle が偽値を返すため、CSSStyleRule を直接確認する。
    const visitedColor = await page.evaluate(() => {
      // 全スタイルシートを走査
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          // セレクタが .text-link:visited に厳密にマッチするルールを探す
          const rule = Array.from(sheet.cssRules).find(
            (r): r is CSSStyleRule =>
              r instanceof CSSStyleRule &&
              /(^|[^\w-])\.text-link:(visited|where\(:visited\))(\s|,|$)/.test(r.selectorText)
          );
          if (rule) return rule.style.color;
        } catch (e) {
          // クロスドメインのスタイルシート等はアクセス不可な場合があるため無視
          continue;
        }
      }
      return null;
    });

    // 定義が存在し、色が正しいことを確認
    // ブラウザや CSS の定義方法によって 'var(...)' だったり 'rgb(...)' だったりする可能性がある。
    expect(visitedColor).not.toBeNull();
    const normalizedColor = visitedColor?.replace(/\s/g, '').toLowerCase();
    const isExpectedValue =
      normalizedColor === 'var(--color-link-visited)' ||
      normalizedColor === COLOR_LINK_VISITED.replace(/\s/g, '').toLowerCase() ||
      normalizedColor === '#7c3aed';

    expect(isExpectedValue).toBe(true);
  });
});
