import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('QRチケット', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/qr-ticket');
    await page.getByRole('button', { name: '鍵ペアを新規生成' }).waitFor();
    await waitForReactHydration(page);
  });

  // ──────────────────────────────────────────────────────────
  // 基本構造
  // ──────────────────────────────────────────────────────────

  test('生成タブの各セクションが表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '鍵ペア' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'イベント情報' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /チケットリスト/ })).toBeVisible();
  });

  test('検証タブに切り替えると公開鍵・QR読取セクションが表示される', async ({ page }) => {
    await page.getByRole('button', { name: '検証' }).click();
    await expect(page.getByRole('heading', { name: '公開鍵' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'QR読取' })).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────
  // 鍵ペア生成
  // ──────────────────────────────────────────────────────────

  test('「鍵ペアを新規生成」で秘密鍵・公開鍵が表示される', async ({ page }) => {
    await page.getByRole('button', { name: '鍵ペアを新規生成' }).click();
    await expect(page.getByText('秘密鍵（主催者が保管）')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('公開鍵（検証スタッフへ共有）')).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────
  // バリデーション
  // ──────────────────────────────────────────────────────────

  test('鍵なし状態では一括生成ボタンが無効化されている', async ({ page }) => {
    // 鍵ペアがない場合は disabled={!cryptoKeyPair} により無効化される
    await expect(page.getByRole('button', { name: '一括生成' })).toBeDisabled();
  });

  test('イベントIDが空の状態で一括生成するとエラーメッセージが表示される', async ({ page }) => {
    await page.getByRole('button', { name: '鍵ペアを新規生成' }).click();
    await expect(page.getByText('秘密鍵（主催者が保管）')).toBeVisible({ timeout: 10000 });
    await page.locator('#expiry').fill('2099-12-31T23:59');
    await page.getByRole('button', { name: '一括生成' }).click();
    await expect(page.getByRole('alert')).toContainText('イベントIDを入力してください');
  });

  // ──────────────────────────────────────────────────────────
  // QR生成フロー
  // ──────────────────────────────────────────────────────────

  test('鍵生成→イベント情報入力→一括生成でQRコードグリッドが表示される', async ({ page }) => {
    await page.getByRole('button', { name: '鍵ペアを新規生成' }).click();
    await expect(page.getByText('秘密鍵（主催者が保管）')).toBeVisible({ timeout: 10000 });

    await page.getByLabel('イベントID').pressSequentially('event-2099');
    await page.locator('#expiry').fill('2099-12-31T23:59');
    await page.getByRole('button', { name: '一括生成' }).click();

    await expect(page.getByText(/生成結果（\d+件）/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('T-00001')).toBeVisible();
    await expect(page.getByRole('button', { name: 'SVG保存' }).first()).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────
  // 鍵インポートバリデーション
  // ──────────────────────────────────────────────────────────

  test('秘密鍵欄に公開鍵を貼り付けると適切なエラーを表示する', async ({ page }) => {
    // まず鍵ペアを生成して公開鍵を取得
    await page.getByRole('button', { name: '鍵ペアを新規生成' }).click();
    await expect(page.getByText('公開鍵（検証スタッフへ共有）')).toBeVisible({ timeout: 10000 });

    // 2つ目のtextarea（readOnly）が公開鍵JWK
    const pubKeyJwk = await page.locator('textarea').nth(1).inputValue();

    await page.getByText('▼ 既存の秘密鍵をインポート').click();
    await page.getByLabel('秘密鍵 JWK').fill(pubKeyJwk);
    // exact: true で「▲ 秘密鍵インポートを閉じる」との混同を防ぐ
    await page.getByRole('button', { name: 'インポート', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('公開鍵です');
  });

  // ──────────────────────────────────────────────────────────
  // 生成→検証ラウンドトリップ（画像アップロード経由）
  // ──────────────────────────────────────────────────────────

  test('生成したQRを画像アップロードで検証すると有効と判定される', async ({ page }) => {
    // 1. 鍵ペア生成
    await page.getByRole('button', { name: '鍵ペアを新規生成' }).click();
    await expect(page.getByText('秘密鍵（主催者が保管）')).toBeVisible({ timeout: 10000 });

    // 2. イベント情報入力・QR生成
    await page.getByLabel('イベントID').pressSequentially('roundtrip-test');
    await page.locator('#expiry').fill('2099-12-31T23:59');
    await page.getByRole('button', { name: '一括生成' }).click();
    await expect(page.getByText(/生成結果（\d+件）/)).toBeVisible({ timeout: 15000 });

    // 3. 生成されたQR SVGをPNGに変換
    //    dangerouslySetInnerHTML で注入された SVG は width=160px の div 内にある。
    //    ページ上の他の SVG（アイコン等）と区別するため、親コンテナで絞り込む。
    const pngBase64 = await page.evaluate((): Promise<string> => {
      return new Promise((resolve, reject) => {
        // QRカードの 160×160 コンテナ内の SVG を取得
        const container = Array.from(document.querySelectorAll<HTMLElement>('div')).find(
          (d) => d.style.width === '160px' && d.style.height === '160px',
        );
        const svgEl = container?.querySelector('svg') as SVGSVGElement | null;
        if (!svgEl) { reject(new Error('QR SVG not found')); return; }

        // viewBox から実寸を取得して width/height を設定
        const vb = svgEl.getAttribute('viewBox');
        const dim = vb ? parseInt(vb.split(' ')[2]) : 200;
        const clone = svgEl.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('width', String(dim));
        clone.setAttribute('height', String(dim));

        const svgStr = new XMLSerializer().serializeToString(clone);
        const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);

        const img = new Image();
        img.onload = () => {
          // jsQR が読み取れるよう十分な解像度で描画
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

    // 4. 検証タブに切替（公開鍵は handleGenerateKeys で verifyPubKeyStr に自動セット済み）
    await page.getByRole('button', { name: '検証' }).click();
    await expect(page.getByRole('heading', { name: '公開鍵' })).toBeVisible();

    // 5. 画像アップロードモードを選択
    await page.getByRole('button', { name: '画像アップロード' }).click();

    // 6. PNG を fileInput にセット（hidden input は setInputFiles で直接操作可能）
    await page.locator('input[type="file"]').setInputFiles({
      name: 'ticket.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngBase64, 'base64'),
    });

    // 7. 検証結果を確認
    await expect(page.getByText('有効なチケット')).toBeVisible({ timeout: 15000 });
  });

  test('日本語を含むイベント情報を画像アップロードで検証できる', async ({ page }) => {
    // 1. 鍵ペア生成
    await page.getByRole('button', { name: '鍵ペアを新規生成' }).click();
    await expect(page.getByText('秘密鍵（主催者が保管）')).toBeVisible({ timeout: 10000 });

    // 2. 日本語を含むイベント情報入力・QR生成
    await page.getByLabel('イベントID').pressSequentially('春 of プログラミング 2026');
    await page.getByLabel('参加者名 1').pressSequentially('山田 太郎');
    await page.locator('#expiry').fill('2099-12-31T23:59');
    await page.getByRole('button', { name: '一括生成' }).click();
    await expect(page.getByText(/生成結果（\d+件）/)).toBeVisible({ timeout: 15000 });

    // 3. 生成されたQR SVGをPNGに変換
    const pngBase64 = await page.evaluate((): Promise<string> => {
      return new Promise((resolve, reject) => {
        const container = Array.from(document.querySelectorAll<HTMLElement>('div')).find(
          (d) => d.style.width === '160px' && d.style.height === '160px'
        );
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

    // 4. 検証タブに切替
    await page.getByRole('button', { name: '検証' }).click();

    // 5. 画像アップロードモードを選択
    await page.getByRole('button', { name: '画像アップロード' }).click();

    // 6. PNG を fileInput にセット
    await page.locator('input[type="file"]').setInputFiles({
      name: 'ticket-ja.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngBase64, 'base64'),
    });

    // 7. 検証結果を確認（日本語が正しく表示されることも確認）
    await expect(page.getByText('有効なチケット')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('春 of プログラミング 2026')).toBeVisible();
    await expect(page.getByText('山田 太郎')).toBeVisible();
  });
});
