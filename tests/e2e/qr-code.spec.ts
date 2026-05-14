import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('QRコード生成（production CSP 適用）', () => {
  test('テキスト入力でQRコードが生成される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/qr-code', async (page) => {
      const input = page.getByLabel('テキスト / URL');
      await input.fill('https://example.com');

      // プレビュー領域が表示され、SVGが含まれていることを確認
      const preview = page.getByText('プレビュー');
      await expect(preview).toBeVisible();

      const qrContainer = page.getByTestId('qr-code-container');
      await expect(qrContainer).toBeVisible();
      await expect(qrContainer.locator('svg')).toBeVisible();
    });
  });

  test('誤り訂正レベルを切り替えられる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/qr-code', async (page) => {
      await page.getByLabel('テキスト / URL').fill('Test Text');

      // デフォルトは M
      await expect(page.getByText('復元率: 15%')).toBeVisible();

      // H に切り替え
      await page.getByRole('button', { name: 'H' }).click();
      await expect(page.getByText('復元率: 30%')).toBeVisible();

      // Q に切り替え
      await page.getByRole('button', { name: 'Q' }).click();
      await expect(page.getByText('復元率: 25%')).toBeVisible();

      // L に切り替え
      await page.getByRole('button', { name: 'L' }).click();
      await expect(page.getByText('復元率: 7%')).toBeVisible();
    });
  });

  test('サンプルテキストを挿入できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/qr-code', async (page) => {
      await page.getByRole('button', { name: 'サンプル' }).click();
      await expect(page.getByLabel('テキスト / URL')).toHaveValue('https://example.com');
      await expect(page.getByTestId('qr-code-container')).toBeVisible();
    });
  });

  test('テキストを空にするとプレビューが消える（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/qr-code', async (page) => {
      const input = page.getByLabel('テキスト / URL');
      await input.fill('Hello');
      await expect(page.getByTestId('qr-code-container')).toBeVisible();

      await input.fill('');
      await expect(page.getByTestId('qr-code-container')).not.toBeVisible();
      await expect(page.getByText('プレビュー')).not.toBeVisible();
    });
  });

  test('ダウンロードボタンが存在する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/qr-code', async (page) => {
      await page.getByLabel('テキスト / URL').fill('https://example.com');
      const downloadButton = page.getByRole('button', { name: 'SVGダウンロード' });
      await expect(downloadButton).toBeVisible();
      await expect(downloadButton).toBeEnabled();
    });
  });

  // issue #386: a11y。SR が生成完了と SVG の意味を読み取れること。
  // 修正前は role="status" / aria-live も <title> も無いため、この test は fail する。
  test('生成結果が role="status" として読め、SVG に <title> が含まれる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/qr-code', async (page) => {
      await page.getByLabel('テキスト / URL').fill('https://example.com');

      const status = page
        .getByRole('status')
        .filter({ has: page.getByTestId('qr-code-container') });
      await expect(status).toBeVisible();

      // SVG が img role + aria-label でアクセシブル名を持つ
      const svgImg = status.getByRole('img', { name: 'QRコード' });
      await expect(svgImg).toBeVisible();

      // <title> 要素にテキスト内容が含まれる
      const titleText = await status.locator('svg title').textContent();
      expect(titleText).toContain('https://example.com');
    });
  });

  // issue #386: XSS 二次防衛線。<title> 内に挿入される text は XML エスケープされる。
  // 旧実装 (生 text 連結) ではこの test が <script> 文字列の生置換で fail する設計
  // (test-gates 陽性対照: title 注入機構の escape が機能していないと検知)。
  test('<title> 内のテキストは HTML 特殊文字がエスケープされる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/qr-code', async (page) => {
      await page.getByLabel('テキスト / URL').fill('<script>alert(1)</script>');

      const container = page.getByTestId('qr-code-container');
      // textContent は DOM パース後の値なので元の文字列がそのまま見える
      const titleText = await container.locator('svg title').textContent();
      expect(titleText).toContain('<script>alert(1)</script>');

      // 一方、生の HTML 文字列上では実体参照化されており、<script> タグとして
      // パースされていない (XSS sink である dangerouslySetInnerHTML の前段で防御)。
      const containerHtml = await container.innerHTML();
      expect(containerHtml).toContain('&lt;script&gt;');
      expect(await container.locator('script').count()).toBe(0);
    });
  });
});
