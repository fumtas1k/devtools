import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

/**
 * qr-code ツールでテキストからQR SVGを生成し、768px PNG に変換して base64 で返す
 */
async function generateQrPng(page: import('@playwright/test').Page, text: string): Promise<string> {
  await page.goto('/tools/qr-code');
  await waitForReactHydration(page);
  await page.getByLabel('テキスト / URL').fill(text);
  await page.waitForSelector('[data-testid="qr-code-container"] svg');

  return page.evaluate((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const container = document.querySelector('[data-testid="qr-code-container"]');
      const svgEl = container?.querySelector('svg') as SVGSVGElement | null;
      if (!svgEl) {
        reject(new Error('QR SVG not found'));
        return;
      }
      const vb = svgEl.getAttribute('viewBox');
      const dim = vb ? parseInt(vb.split(' ')[2]) : 200;
      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('width', String(dim));
      clone.setAttribute('height', String(dim));

      const svgStr = new XMLSerializer().serializeToString(clone);
      const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);

      const img = new Image();
      img.onload = () => {
        const size = 768;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''));
      };
      img.onerror = () => reject(new Error('SVG image load failed'));
      img.src = dataUrl;
    });
  });
}

test.describe('QRリーダー', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/qr-reader');
    await waitForReactHydration(page);
  });

  // ────────────────────────────────
  // 基本構造
  // ────────────────────────────────

  test('ページが表示されカメラ/アップロードの切替ボタンがある', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'カメラ', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '画像アップロード' })).toBeVisible();
  });

  // ────────────────────────────────
  // 画像アップロード: テキスト読取
  // ────────────────────────────────

  test('プレーンテキストを含むQR画像をアップロードして読み取れる', async ({ page }) => {
    const text = 'Hello DevTools QR Reader';
    const pngBase64 = await generateQrPng(page, text);

    await page.goto('/tools/qr-reader');
    await waitForReactHydration(page);
    await page.getByRole('button', { name: '画像アップロード' }).click();
    await page.getByLabel('画像を選択').setInputFiles({
      name: 'qr.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngBase64, 'base64'),
    });

    await expect(page.getByText(text)).toBeVisible({ timeout: 10000 });
  });

  test('読み取り結果にコピーボタンが表示される', async ({ page }) => {
    const text = 'copy button test';
    const pngBase64 = await generateQrPng(page, text);

    await page.goto('/tools/qr-reader');
    await waitForReactHydration(page);
    await page.getByRole('button', { name: '画像アップロード' }).click();
    await page.getByLabel('画像を選択').setInputFiles({
      name: 'qr.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngBase64, 'base64'),
    });

    await expect(page.getByText(text)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'コピー' })).toBeVisible();
  });

  test('再スキャンボタンを押すと結果がクリアされる', async ({ page }) => {
    const text = 'rescan test';
    const pngBase64 = await generateQrPng(page, text);

    await page.goto('/tools/qr-reader');
    await waitForReactHydration(page);
    await page.getByRole('button', { name: '画像アップロード' }).click();
    await page.getByLabel('画像を選択').setInputFiles({
      name: 'qr.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngBase64, 'base64'),
    });

    await expect(page.getByText(text)).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: '再スキャン' }).click();
    await expect(page.getByText(text)).toHaveCount(0);
  });

  // ────────────────────────────────
  // URL 検出 & フィッシング警告
  // ────────────────────────────────

  test('URL を含むQR読取時に警告メッセージと「URLを開く」ボタンが表示される', async ({ page }) => {
    const url = 'https://example.com/path';
    const pngBase64 = await generateQrPng(page, url);

    await page.goto('/tools/qr-reader');
    await waitForReactHydration(page);
    await page.getByRole('button', { name: '画像アップロード' }).click();
    await page.getByLabel('画像を選択').setInputFiles({
      name: 'qr.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngBase64, 'base64'),
    });

    await expect(page.getByText(url)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'URLを開く' })).toBeVisible();
    await expect(page.getByText('example.com', { exact: true })).toBeVisible();
  });

  test('「URLを開く」リンクは target=_blank かつ rel=noopener noreferrer で安全に開く', async ({
    page,
  }) => {
    const url = 'https://example.com';
    const pngBase64 = await generateQrPng(page, url);

    await page.goto('/tools/qr-reader');
    await waitForReactHydration(page);
    await page.getByRole('button', { name: '画像アップロード' }).click();
    await page.getByLabel('画像を選択').setInputFiles({
      name: 'qr.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngBase64, 'base64'),
    });

    const link = page.getByRole('link', { name: 'URLを開く' });
    await expect(link).toBeVisible({ timeout: 10000 });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('href', url);
  });

  // ────────────────────────────────
  // エラーケース
  // ────────────────────────────────

  test('navigator.mediaDevices が未定義のときカメラ起動で HTTPS 必須メッセージを表示する', async ({
    page,
  }) => {
    // 非HTTPS / localhost 以外の環境では navigator.mediaDevices が undefined になる挙動を再現
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        get: () => undefined,
      });
    });

    await page.goto('/tools/qr-reader');
    await waitForReactHydration(page);
    await page.getByRole('button', { name: 'カメラを起動' }).click();

    await expect(page.getByRole('alert')).toContainText(
      'カメラの起動には HTTPS 環境または localhost が必要です'
    );
  });

  test('QRコードを含まない画像をアップロードするとエラーが表示される', async ({ page }) => {
    // 1x1 の白 PNG (QR なし)
    const blankPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    await page.getByRole('button', { name: '画像アップロード' }).click();
    await page.getByLabel('画像を選択').setInputFiles({
      name: 'blank.png',
      mimeType: 'image/png',
      buffer: blankPng,
    });

    await expect(page.getByRole('alert')).toContainText('画像からQRコードを読み取れませんでした');
  });
});
