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

  // issue #386 / #435: SVG の `<title>` は維持しつつ視覚プレビュー側の role="status" を
  // 撤去 (連呼防止)。sr-only な debounce live region でだけ短文を announce する。
  // accessible name の URL 本文 + aria-label 上書き防止 + <title> first child を assert する。
  test('SVG の accessible name に URL 本文が含まれ、aria-label で上書きされない（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/qr-code', async (page) => {
      await page.getByLabel('テキスト / URL').fill('https://example.com');

      const container = page.getByTestId('qr-code-container');
      await expect(container).toBeVisible();

      // SVG は role="img" を持ち、`<title>` が first child であることが accessible name の
      // 計算条件 (Accessible Name and Description Computation 4.3.1)。
      // aria-label を併用すると <title> が無視されるため、本コンポーネントは aria-label を
      // 付けない。属性として aria-label が無いことも陽性対照として確認する。
      const svgImg = container.locator('svg[role="img"]');
      await expect(svgImg).toHaveCount(1);
      await expect(svgImg).not.toHaveAttribute('aria-label', /.*/);

      // <title> が SVG の最初の子要素であり、URL 本文を含むこと
      const firstChildTag = await svgImg.evaluate((el) => el.firstElementChild?.tagName);
      expect(firstChildTag?.toLowerCase()).toBe('title');

      const titleText = await svgImg.locator('> title').textContent();
      expect(titleText).toContain('QRコード:');
      expect(titleText).toContain('https://example.com');
    });
  });

  // issue #435 陽性対照 A (debounce 機能): 入力直後の早い段階では announcement が
  // まだ空で、合計 600ms 経過後に「QRコードを生成しました」が現れる。
  // 実装側の debounce は 300ms。100ms / 500ms の二段でサンプルし、CI runner の
  // React commit ラグ (50-100ms) を吸収しても境界 (300ms) を確実に跨ぐマージンを取る。
  // 旧実装 (debounce 無しの直貼り role="status") に当てれば `qr-announcement` testid
  // 要素自体が無く `toHaveText` 段で fail する。
  test('aria-live announcement は 300ms debounce 後にだけ短文を出す（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/qr-code', async (page) => {
      const announcement = page.getByTestId('qr-announcement');

      // 初期状態は空
      await expect(announcement).toHaveText('');

      // テキスト入力。fill は瞬時。announcement はまだ debounce 待ち中。
      await page.getByLabel('テキスト / URL').fill('https://example.com');

      // 100ms 時点では debounce 待ち中で空のまま (300ms 境界より十分手前)
      await page.waitForTimeout(100);
      await expect(announcement).toHaveText('');

      // さらに 500ms 待つと debounce 通過し announce される (合計 600ms > 300ms に余裕)
      await page.waitForTimeout(500);
      await expect(announcement).toHaveText('QRコードを生成しました');
    });
  });

  // issue #435 陽性対照 B (構造): 視覚プレビュー側 div は role="status" / aria-live を
  // 持たない (持たせると入力 1 文字ごとに SVG title が連呼される旧実装に逆戻り)。
  // sr-only 専用 span がただ 1 つの aria-live 領域である構造の回帰を検知する。
  test('視覚プレビュー div は aria-live を持たず、sr-only span 1 つだけが live region である（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/qr-code', async (page) => {
      await page.getByLabel('テキスト / URL').fill('https://example.com');

      // 視覚プレビュー div の祖先に aria-live を持つ要素が無い
      const container = page.getByTestId('qr-code-container');
      const liveAncestors = container.locator('xpath=ancestor-or-self::*[@aria-live]');
      await expect(liveAncestors).toHaveCount(0);

      // aria-live="polite" を持つ要素は qr-announcement の sr-only span ただ 1 つ
      const liveRegions = page.locator('[aria-live="polite"]');
      await expect(liveRegions).toHaveCount(1);
      await expect(liveRegions).toHaveAttribute('data-testid', 'qr-announcement');
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
