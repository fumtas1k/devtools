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
    await expect(link).toHaveCSS('text-decoration-thickness', '1px');

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
    await expect(link).toHaveCSS('text-decoration-thickness', '1px');

    await link.hover();
    await expect(link).toHaveCSS('color', COLOR_PRIMARY);
    await expect(link).toHaveCSS('text-decoration-thickness', '2px');
  });

  test('tool layout breadcrumb link has correct color', async ({ page }) => {
    await page.goto('/tools/base64');

    const link = page.getByRole('link', { name: 'ホーム' });
    await expect(link).toBeVisible();

    await expect(link).toHaveCSS('color', COLOR_LINK);
    await expect(link).toHaveCSS('text-decoration-thickness', '1px');

    await link.hover();
    await expect(link).toHaveCSS('color', COLOR_PRIMARY);
    await expect(link).toHaveCSS('text-decoration-thickness', '2px');
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

  test('should have correct :visited style definitions for link classes', async ({ page }) => {
    await page.goto('/');

    // :visited は getComputedStyle が偽値を返すため、CSSStyleRule を直接走査して定義を確認するヘルパー
    const getVisitedColor = async (className: string) => {
      return await page.evaluate((cls) => {
        // セレクタが .<cls>:visited に厳密にマッチする正規表現
        // (文字境界を考慮し、他のクラス名の一部としてマッチするのを防ぐ)
        const selectorRegex = new RegExp(
          `(^|[^\\w-])\\.${cls}:(visited|where\\(:visited\\))($|[^\\w-])`
        );

        for (const sheet of Array.from(document.styleSheets)) {
          try {
            const rule = Array.from(sheet.cssRules).find(
              (r): r is CSSStyleRule =>
                r instanceof CSSStyleRule && selectorRegex.test(r.selectorText)
            );
            if (rule) return rule.style.color;
          } catch (e) {
            continue;
          }
        }
        return null;
      }, className);
    };

    const validateColor = (color: string | null) => {
      expect(color).not.toBeNull();
      const normalized = color?.replace(/\s/g, '').toLowerCase();
      return (
        normalized === 'var(--color-link-visited)' ||
        normalized === COLOR_LINK_VISITED.replace(/\s/g, '').toLowerCase() ||
        normalized === '#7c3aed'
      );
    };

    // .text-link の :visited 定義確認
    expect(validateColor(await getVisitedColor('text-link'))).toBe(true);

    // .text-link-color の :visited 定義確認
    // span 等に当てている場合でも、クラス定義として色が保証されていることを確認
    expect(validateColor(await getVisitedColor('text-link-color'))).toBe(true);
  });
});
