import { test, expect } from '@playwright/test';
import { applyProductionCsp, waitForReactHydration, withProductionCsp } from './helpers';

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

  test('title を閉じる入力も文字列として保持し、要素や属性を注入しない', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/qr-code', async (page) => {
      const payload = `</title><script>alert(1)</script><svg onload="alert(1)">&'"`;
      await page.getByLabel('テキスト / URL').fill(payload);
      const container = page.getByTestId('qr-code-container');
      const svg = container.locator('svg[role="img"]');
      await expect(svg.locator('> title')).toHaveText(`QRコード: ${payload}`);
      await expect(svg.locator('> title')).toHaveCount(1);
      await expect(container.locator('svg')).toHaveCount(1);
      await expect(container.locator('script, [onload]')).toHaveCount(0);
      await expect(svg).not.toHaveAttribute('aria-label', /.*/);
    });
  });
});

for (const viewport of [
  { name: 'PC', width: 1280, height: 800 },
  { name: 'スマホ', width: 390, height: 844 },
]) {
  test(`${viewport.name}: 入力内容に合わせて高さが変わり、上限後はスクロールできる`, async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/qr-code', async (page) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const input = page.getByLabel('テキスト / URL');
      expect(await page.evaluate(() => CSS.supports('field-sizing', 'content'))).toBe(true);
      const initial = await input.evaluate((el) => el.getBoundingClientRect().height);
      // 既存 rows=3 の 107.5625px と描画上同じ高さを保つ。
      expect(initial).toBeCloseTo(107.5625, 0);
      await input.fill('短文');
      expect(await input.evaluate((el) => el.getBoundingClientRect().height)).toBeCloseTo(
        initial,
        0
      );

      // 折返しと改行の双方で内容が 3 行を超える。
      await input.fill('折り返しの確認です'.repeat(30));
      const wrapped = await input.evaluate((el) => el.getBoundingClientRect().height);
      expect(wrapped).toBeGreaterThan(initial);
      await input.fill(Array.from({ length: 7 }, (_, i) => `行 ${i}`).join('\n'));
      expect(await input.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(
        initial
      );

      await input.fill(Array.from({ length: 40 }, (_, i) => `長い入力 ${i}`).join('\n'));
      const dimensions = await input.evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        client: el.clientHeight,
        scroll: el.scrollHeight,
        width: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(dimensions.height).toBeLessThanOrEqual(320);
      expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
      expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
      await input.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      expect(await input.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'H', exact: true }).click();
      await expect(page.getByText('復元率: 30%')).toBeVisible();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'SVGダウンロード' }).click();
      expect((await download).suggestedFilename()).toBe('qrcode.svg');
      await input.fill('');
      expect(await input.evaluate((el) => el.getBoundingClientRect().height)).toBeCloseTo(
        initial,
        0
      );
      await page.getByRole('button', { name: 'サンプル' }).click();
      await expect(input).toHaveValue('https://example.com');
      expect(await input.evaluate((el) => el.getBoundingClientRect().height)).toBeCloseTo(
        initial,
        0
      );
      await input.focus();
      await expect(input).toBeFocused();
    });
  });
}

test('手動リサイズ後も高さを保ち、追加した内容をスクロールできる', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/qr-code', async (page) => {
    const input = page.getByLabel('テキスト / URL');
    await input.fill(Array.from({ length: 5 }, (_, i) => `行 ${i}`).join('\n'));
    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 5, box.y + box.height + 45, { steps: 10 });
    await page.mouse.up();
    const resized = await input.evaluate((el) => el.getBoundingClientRect().height);
    expect(resized).toBeGreaterThan(box.height + 20);
    await input.fill(Array.from({ length: 30 }, (_, i) => `追加した行 ${i}`).join('\n'));
    const after = await input.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      client: el.clientHeight,
      scroll: el.scrollHeight,
    }));
    expect(after.height).toBeCloseTo(resized, 0);
    expect(after.scroll).toBeGreaterThan(after.client);
    await input.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await input.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });
});

test('未対応時は従来の3行高さ、スクロール、手動リサイズを維持する', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const guard = await applyProductionCsp(page);
    let replaced = 0;
    // 実際に配信される CSS の @supports 条件を偽にして未対応経路を通す。
    await page.route('**/*.css', async (route) => {
      const response = await route.fetch();
      const css = await response.text();
      const body = css.replace(/@supports\s*\(\s*field-sizing\s*:\s*content\s*\)/g, () => {
        replaced++;
        return '@supports (field-sizing: invalid-value)';
      });
      await route.fulfill({ response, body });
    });
    await page.goto('/tools/qr-code');
    await waitForReactHydration(page);
    expect(replaced).toBe(1);
    const input = page.getByLabel('テキスト / URL');
    const initial = await input.evaluate((el) => el.getBoundingClientRect().height);
    expect(initial).toBeCloseTo(107.5625, 0);
    await input.fill(Array.from({ length: 30 }, (_, i) => `行 ${i}`).join('\n'));
    const fallback = await input.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      client: el.clientHeight,
      scroll: el.scrollHeight,
      resize: getComputedStyle(el).resize,
    }));
    expect(fallback.height).toBeCloseTo(initial, 0);
    expect(fallback.scroll).toBeGreaterThan(fallback.client);
    expect(fallback.resize).toBe('vertical');
    await input.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await input.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 5, box.y + box.height + 45, { steps: 10 });
    await page.mouse.up();
    expect(await input.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(
      initial + 20
    );
    guard.assertNoViolations();
  } finally {
    await context.close();
  }
});
