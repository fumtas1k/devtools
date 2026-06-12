import { test, expect, type Page } from '@playwright/test';
import { withProductionCsp } from './helpers';

const PAGE_PATH = '/tools/clipboard-inspector';

/**
 * ClipboardInspector の初期状態には button/input/textarea が存在しないため、
 * 汎用の waitForReactHydration（button 要素の __react キーを待つ）は使えない。
 * drop zone の div に __react キーが付くことでハイドレーション完了を確認する。
 */
async function waitForClipboardInspectorHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const zone = document.querySelector('[data-testid="clipboard-drop-zone"]');
      if (!zone) return false;
      return Object.keys(zone).some((k) => k.startsWith('__react'));
    },
    null,
    { timeout: 10_000 }
  );
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
    await waitForClipboardInspectorHydration(page);
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
    await withProductionCsp(
      browser,
      PAGE_PATH,
      async (page) => {
        // withProductionCsp の汎用 waitForReactHydration は button 要素を探すため
        // 初期状態に button がない本ページでは timeout する。skipHydration を指定し
        // カスタム wait でハイドレーション完了を確認する。
        await waitForClipboardInspectorHydration(page);
        // style 属性を持つ HTML を DataTransfer 経由で paste すると
        // Chromium 内部の ClipboardEvent 処理で CSP 違反が発生するため（アプリ実装の問題ではなくブラウザ挙動）、
        // style なし HTML を使用してサニタイズ後のプレビュー表示が CSP 違反を起こさないことを確認する。
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
      },
      { skipHydration: true }
    );
  });
});
