import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// global.css の CSS 変数と対応
const COLOR_LINK = 'rgb(37, 99, 235)'; // --color-link: #2563eb
const COLOR_PRIMARY = 'rgb(26, 86, 219)'; // --color-primary: #1a56db
const COLOR_TEXT = 'rgb(17, 24, 39)'; // --color-text: #111827

test.describe('Link Styles（production CSP 適用）', () => {
  // withProductionCsp が test ごとに fresh context を作成するため
  // localStorage / sessionStorage は常に空。旧 addInitScript は不要。
  // /privacy, /about, / は React island を持たない静的ページのため
  // skipHydration: true を指定する。/tools/* は island ありで skip 不要。

  test('privacy page link has correct color and hover color（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(
      browser,
      '/privacy',
      async (page) => {
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
      },
      { skipHydration: true }
    );
  });

  test('about page tool links have correct color（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/about',
      async (page) => {
        // メインコンテンツ内の最初のリンクを取得
        const link = page.getByRole('main').getByRole('link').first();
        await expect(link).toBeVisible();

        await expect(link).toHaveCSS('color', COLOR_LINK);
        await expect(link).toHaveCSS('text-decoration-thickness', '1px');

        await link.hover();
        await expect(link).toHaveCSS('color', COLOR_PRIMARY);
        await expect(link).toHaveCSS('text-decoration-thickness', '2px');
      },
      { skipHydration: true }
    );
  });

  test('tool layout breadcrumb link has correct color（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      const link = page.getByRole('link', { name: 'ホーム' });
      await expect(link).toBeVisible();

      await expect(link).toHaveCSS('color', COLOR_LINK);
      await expect(link).toHaveCSS('text-decoration-thickness', '1px');

      await link.hover();
      await expect(link).toHaveCSS('color', COLOR_PRIMARY);
      await expect(link).toHaveCSS('text-decoration-thickness', '2px');
    });
  });

  test('index page tool card title and link have correct hover color（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        // 最初のツールカードを取得
        const card = page.getByRole('main').getByRole('link').first();
        const title = card.getByRole('heading', { level: 2 });
        const link = card.locator('.text-link-plain');

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
      },
      { skipHydration: true }
    );
  });

  test('should have correct :visited style definitions for link classes（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        // :visited は getComputedStyle が偽値を返すため、CSSStyleRule を直接走査して定義を確認するヘルパー
        const getVisitedColor = async (className: string): Promise<string | null> => {
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

        const expectVisitedColor = (color: string | null): void => {
          expect(color).not.toBeNull();
          const normalized = color?.replace(/\s/g, '').toLowerCase();
          // 定義された CSS 変数名、計算済みの RGB 値、または HEX 値のいずれかにマッチすることを確認
          expect(normalized).toMatch(/^(var\(--color-link-visited\)|rgb\(124,58,237\)|#7c3aed)$/);
        };

        // .text-link の :visited 定義確認
        expectVisitedColor(await getVisitedColor('text-link'));

        // .text-link-plain の :visited 定義確認
        expectVisitedColor(await getVisitedColor('text-link-plain'));
      },
      { skipHydration: true }
    );
  });
});
