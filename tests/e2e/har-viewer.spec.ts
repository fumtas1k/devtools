import { test, expect } from '@playwright/test';

/**
 * n 件のエントリを持つ最小 HAR を生成する。
 * 各エントリの URL は識別可能なインデックス付き。
 */
function buildTestHar(entryCount: number): string {
  const entries = Array.from({ length: entryCount }, (_, i) => ({
    startedDateTime: new Date().toISOString(),
    time: 10,
    request: {
      method: 'GET',
      url: `https://example.com/api/item/${i}`,
      headers: [{ name: 'Accept', value: 'application/json' }],
      queryString: [],
      cookies: [],
      headersSize: -1,
      bodySize: -1,
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: [{ name: 'Content-Type', value: 'application/json' }],
      cookies: [],
      content: {
        mimeType: 'application/json',
        size: 2,
        text: '{}',
      },
      redirectURL: '',
      headersSize: -1,
      bodySize: 2,
    },
    cache: {},
    timings: { send: 0, wait: 10, receive: 0 },
  }));

  return JSON.stringify({
    log: {
      version: '1.2',
      creator: { name: 'test', version: '1.0' },
      entries,
    },
  });
}

/**
 * n 件のエントリを持ち、各エントリに Cookie ヘッダを含む HAR を生成する。
 * COOKIE カテゴリの redact 件数が entryCount と一致する（1 エントリ 1 Cookie ペア）。
 */
function buildCookieHar(entryCount: number): string {
  const entries = Array.from({ length: entryCount }, (_, i) => ({
    startedDateTime: new Date().toISOString(),
    time: 10,
    request: {
      method: 'GET',
      url: `https://example.com/api/item/${i}`,
      headers: [{ name: 'Cookie', value: 'session=secretvalue123' }],
      queryString: [],
      cookies: [],
      headersSize: -1,
      bodySize: -1,
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: [],
      cookies: [],
      content: { mimeType: 'application/json', size: 2, text: '{}' },
      redirectURL: '',
      headersSize: -1,
      bodySize: 2,
    },
    cache: {},
    timings: { send: 0, wait: 10, receive: 0 },
  }));

  return JSON.stringify({
    log: { version: '1.2', creator: { name: 'test', version: '1.0' }, entries },
  });
}

/**
 * HAR ファイルをアップロードし、React コンポーネントが hydrate されるのを待ってから
 * setInputFiles を呼ぶヘルパー。
 * client:load コンポーネントは hydrate 前にはイベントハンドラが未登録のため、
 * ネットワーク idle + ラベルボタンが visible になってから upload する。
 */
async function uploadHar(page: import('@playwright/test').Page, json: string): Promise<void> {
  // ページリソース読み込み完了 + React hydrate 完了を待つ
  await page.waitForLoadState('networkidle');
  const fileInput = page.getByLabel('ファイルを選択');
  await expect(fileInput).toBeVisible({ timeout: 10000 });
  await fileInput.setInputFiles({
    name: 'test.har',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
}

test.describe('HAR ビューア', () => {
  test('Web Worker 経由で読み込み、全エントリが描画される（ページャは無い）', async ({ page }) => {
    await page.goto('/tools/har-viewer');

    const json = buildTestHar(120);
    await uploadHar(page, json);

    // worker が parse+sanitize した結果、先頭・末尾の両エントリが同時に見える
    // （ページングしないので 120 件すべて DOM 上に存在する）
    await expect(page.getByRole('button', { name: /\/api\/item\/0$/ })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('button', { name: /\/api\/item\/119$/ })).toBeVisible();

    // ページャ（前へ/次へ）は存在しない
    await expect(page.getByRole('button', { name: '次へ' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '前へ' })).toHaveCount(0);
  });

  test('entry クリックで詳細パネルにそのリクエストが表示される', async ({ page }) => {
    await page.goto('/tools/har-viewer');

    const json = buildTestHar(120);
    await uploadHar(page, json);

    // 末尾付近のエントリ（item/119）をクリックしても詳細が出る（全件描画の確認）
    const entryButton = page.getByRole('button', { name: /\/api\/item\/119$/ });
    await expect(entryButton).toBeVisible({ timeout: 10000 });
    await entryButton.click();

    // 詳細パネルに URL が表示されていることを確認
    await expect(page.getByText('https://example.com/api/item/119')).toBeVisible();
  });

  test('redact トグルで Web Worker の再 sanitize が走り redact 件数が変化する', async ({
    page,
  }) => {
    await page.goto('/tools/har-viewer');

    // 各エントリに Cookie ヘッダを持つ 5 件の HAR（COOKIE redact 件数 = 5）
    const json = buildCookieHar(5);
    await uploadHar(page, json);

    // 初期（COOKIE 有効）: redact 5 件。worker が parse+sanitize した結果が反映される。
    await expect(page.getByText(/redact:\s*5\s*件/)).toBeVisible({ timeout: 10000 });

    // Cookie チップをトグル off → worker に sanitize 再実行を依頼 → redact 0 件
    await page.getByRole('button', { name: /Cookie/ }).click();
    await expect(page.getByText(/redact:\s*0\s*件/)).toBeVisible({ timeout: 10000 });

    // 再度 on に戻すと 5 件へ戻る（resanitize が双方向に効く）
    await page.getByRole('button', { name: /Cookie/ }).click();
    await expect(page.getByText(/redact:\s*5\s*件/)).toBeVisible({ timeout: 10000 });
  });
});
