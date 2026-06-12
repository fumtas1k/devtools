import { test, expect, type Page } from '@playwright/test';
import {
  applyProductionCsp,
  waitForReactHydration,
  withProductionCsp,
  type CspGuard,
} from './helpers';

const PAGE_PATH = '/tools/clipboard-inspector';

/**
 * CSP 違反は console への到達が非同期のため、固定 sleep ではなく
 * 「違反件数が変化しなくなる」まで expect.poll で安定を待ってから件数を読む
 * （直後に件数を読むと記録途中の中間値を掴み flaky / false green になる）。
 */
async function waitForViolationCountToStabilize(guard: CspGuard): Promise<void> {
  let lastCount = -1;
  await expect
    .poll(() => {
      const current = guard.violations.length;
      const stable = current === lastCount;
      lastCount = current;
      return stable;
    })
    .toBe(true);
}

/**
 * 合成 ClipboardEvent をディスパッチして貼り付けを再現する。
 * Playwright にはクリップボードを直接操作する API がないため、
 * page.evaluate で DataTransfer を構築してイベントを発火する（入力シミュレーション用途）。
 */
async function dispatchPaste(page: Page, flavors: Record<string, string>): Promise<void> {
  await page.evaluate((flavorEntries) => {
    const dt = new DataTransfer();
    for (const [type, value] of Object.entries(flavorEntries)) {
      dt.setData(type, value);
    }
    document.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    );
  }, flavors);
}

/** 合成 DragEvent（drop）でファイルドロップを再現する */
async function dispatchFileDrop(page: Page): Promise<void> {
  await page.evaluate(() => {
    // 1x1 透明 PNG
    const base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'test.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const zone = document.querySelector('[data-testid="clipboard-drop-zone"]')!;
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  });
}

test.describe('クリップボードインスペクタ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_PATH);
    await waitForReactHydration(page);
  });

  test('貼り付けで text/plain と text/html のフレーバーカードが表示される', async ({ page }) => {
    await dispatchPaste(page, {
      'text/plain': 'プレーンテキスト',
      'text/html': '<p>リッチテキスト</p>',
    });
    await expect(page.getByText('text/plain', { exact: true })).toBeVisible();
    await expect(page.getByText('text/html', { exact: true })).toBeVisible();
    await expect(page.getByText('プレーンテキスト')).toBeVisible();
    await expect(page.getByText('貼り付け', { exact: true })).toBeVisible();
  });

  test('サニタイズ後プレビューで script が除去された srcdoc を表示する（陽性対照）', async ({
    page,
  }) => {
    await dispatchPaste(page, {
      'text/html': '<p>safe content</p><script>document.title="pwned"</script>',
    });
    await expect(page.getByText('text/html', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'サニタイズ後プレビュー' }).click();
    const iframe = page.getByTitle('サニタイズ後プレビュー');
    await expect(iframe).toBeVisible();
    const srcdoc = await iframe.getAttribute('srcdoc');
    expect(srcdoc).toContain('<p>safe content</p>');
    expect(srcdoc).not.toContain('<script');
    expect(srcdoc).not.toContain('pwned');
  });

  test('ファイルドロップでメタデータカードと drop バッジが表示される', async ({ page }) => {
    await dispatchFileDrop(page);
    await expect(page.getByText('image/png', { exact: true })).toBeVisible();
    await expect(page.getByText('test.png')).toBeVisible();
    await expect(page.getByText('ドロップ', { exact: true })).toBeVisible();
    // 画像プレビュー（blob URL）
    await expect(page.getByAltText('test.png のプレビュー')).toBeVisible();
  });

  test('クリアボタンで結果がリセットされる', async ({ page }) => {
    await dispatchPaste(page, { 'text/plain': 'abc' });
    await expect(page.getByText('text/plain', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(page.getByText('text/plain', { exact: true })).toBeHidden();
  });
});

test.describe('クリップボードインスペクタ — 本番 CSP', () => {
  test('本番 CSP 下で HTML のプレビューを表示しても CSP 違反が発生しない', async ({ browser }) => {
    await withProductionCsp(browser, PAGE_PATH, async (page) => {
      // style 属性を持つ HTML を DataTransfer 経由で paste すると、アプリ実装と無関係に
      // "Applying inline style" の CSP 違反が記録される（Chromium の getAsString('text/html')
      // 内部サニタイズが page コンテキストで inline style を評価する経路が有力。
      // タイムポイント計測で paste evaluate 直後は 0 件、フレーバーカード表示後に 2 件、
      // iframe 表示後も増加なしを確認済み）。そのため本テストでは style なし HTML を使用し、
      // サニタイズ後のプレビュー表示が CSP 違反を起こさないことを確認する。
      // style 付き HTML のケースは後続の describe（inline pattern）で検証する。
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData(
          'text/html',
          '<p><strong>bold</strong> text</p><script>document.title="pwned"</script>'
        );
        document.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
        );
      });
      await expect(page.getByText('text/html', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'サニタイズ後プレビュー' }).click();
      await expect(page.getByTitle('サニタイズ後プレビュー')).toBeVisible();
      // withProductionCsp が終端で assertNoViolations() を呼ぶ
    });
  });
});

test.describe('クリップボードインスペクタ — 本番 CSP（style 付き HTML）', () => {
  // Chromium は paste 後の getAsString('text/html') 内部サニタイズで、DataTransfer 内の
  // inline style を page コンテキストで評価するため、style 付き HTML を貼り付けると
  // アプリ実装と無関係に "Applying inline style" の CSP 違反が数件記録される
  // （ブラウザ内部挙動。srcdoc iframe 由来でないことはタイムポイント別の violations
  // 観測で確認済み: カード表示後に 2 件 / iframe 表示後も増加なし）。
  // そのため withProductionCsp（終端で違反 0 を assert）は使えず、applyProductionCsp の
  // inline pattern で「sanitizer が style を除去し、プレビュー表示が違反を増やさない」
  // ことを検証する。
  test('style 付き HTML でも sanitizer が style を除去し、プレビュー表示は CSP 違反を増やさない', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      await page.goto(PAGE_PATH);
      await waitForReactHydration(page);
      await dispatchPaste(page, { 'text/html': '<p style="color:red">styled</p>' });
      await expect(page.getByText('text/html', { exact: true })).toBeVisible();
      // Chromium 内部処理由来の違反は getAsString の非同期コールバック経路で記録される
      await waitForViolationCountToStabilize(guard);
      const violationsBeforePreview = guard.violations.length;
      await page.getByRole('button', { name: 'サニタイズ後プレビュー' }).click();
      const iframe = page.getByTitle('サニタイズ後プレビュー');
      await expect(iframe).toBeVisible();
      // sanitizer が style 属性を除去していること（E2E レベルの陽性確認）
      const srcdoc = await iframe.getAttribute('srcdoc');
      expect(srcdoc).toContain('styled');
      expect(srcdoc).not.toContain('style=');
      // プレビュー（srcdoc iframe）表示が新たな CSP 違反を生まないこと。
      // クリック前と対称に、srcdoc 起因の違反が console に遅延到達する窓を潰すため
      // 件数比較の前にも同じ安定化 poll を入れる。
      await waitForViolationCountToStabilize(guard);
      expect(guard.violations.length).toBe(violationsBeforePreview);
    } finally {
      await context.close();
    }
  });

  test('remote 画像入り HTML でも sanitizer が src を除去し、プレビュー表示は CSP 違反を増やさない', async ({
    browser,
  }) => {
    // sanitizer が http(s) の img src を除去するため、本番 CSP（img-src 'self' data: blob:）下でも
    // プレビューが img-src 違反を発生させないことのゲート（PR #635 レビュー指摘の再発防止）
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      await page.goto(PAGE_PATH);
      await waitForReactHydration(page);
      await dispatchPaste(page, {
        'text/html': '<p>article</p><img src="https://tracking.example.com/pixel.png" alt="pic">',
      });
      await expect(page.getByText('text/html', { exact: true })).toBeVisible();
      await waitForViolationCountToStabilize(guard);
      const violationsBeforePreview = guard.violations.length;
      await page.getByRole('button', { name: 'サニタイズ後プレビュー' }).click();
      const iframe = page.getByTitle('サニタイズ後プレビュー');
      await expect(iframe).toBeVisible();
      const srcdoc = await iframe.getAttribute('srcdoc');
      expect(srcdoc).toContain('article');
      expect(srcdoc).not.toContain('https://tracking.example.com'); // remote src は除去済み
      expect(srcdoc).toContain('alt="pic"'); // img 要素自体と alt は保持
      await waitForViolationCountToStabilize(guard);
      expect(guard.violations.length).toBe(violationsBeforePreview);
    } finally {
      await context.close();
    }
  });
});
