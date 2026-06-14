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

test.describe('HAR ビューア — ページング', () => {
  test('120 件の HAR を読み込むとページャが表示される', async ({ page }) => {
    await page.goto('/tools/har-viewer');

    const json = buildTestHar(120);
    await uploadHar(page, json);

    // ページャの「次へ」ボタンが表示されていることを確認
    await expect(page.getByRole('button', { name: '次へ' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: '前へ' })).toBeVisible();
  });

  test('初期状態で 1 ページ目の entry が表示され 2 ページ目の entry は非表示', async ({ page }) => {
    await page.goto('/tools/har-viewer');

    const json = buildTestHar(120);
    await uploadHar(page, json);

    await expect(page.getByRole('button', { name: '次へ' })).toBeVisible({ timeout: 10000 });

    // item/0 が見える（1 ページ目の最初のエントリ）
    await expect(page.getByRole('button', { name: /\/api\/item\/0$/ })).toBeVisible();

    // item/100 が見えない（2 ページ目のエントリ）
    await expect(page.getByRole('button', { name: /\/api\/item\/100$/ })).not.toBeVisible();
  });

  test('「次へ」クリックで 2 ページ目が表示される', async ({ page }) => {
    await page.goto('/tools/har-viewer');

    const json = buildTestHar(120);
    await uploadHar(page, json);

    await expect(page.getByRole('button', { name: '次へ' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: '次へ' }).click();

    // 2 ページ目では item/100 が見える
    await expect(page.getByRole('button', { name: /\/api\/item\/100$/ })).toBeVisible();

    // 1 ページ目の最初のエントリは非表示になる
    await expect(page.getByRole('button', { name: /\/api\/item\/0$/ })).not.toBeVisible();
  });

  test('2 ページ目の entry クリックで詳細パネルにそのリクエストが表示される', async ({ page }) => {
    await page.goto('/tools/har-viewer');

    const json = buildTestHar(120);
    await uploadHar(page, json);

    await expect(page.getByRole('button', { name: '次へ' })).toBeVisible({ timeout: 10000 });

    // 2 ページ目に移動
    await page.getByRole('button', { name: '次へ' }).click();

    // item/100 の URL ボタンをクリック
    await page.getByRole('button', { name: /\/api\/item\/100$/ }).click();

    // 詳細パネルに URL が表示されていることを確認（getByText で URL 全体を検索）
    await expect(page.getByText('https://example.com/api/item/100')).toBeVisible();
  });

  test('陽性対照: 100 件以下の HAR ではページャが表示されない', async ({ page }) => {
    await page.goto('/tools/har-viewer');

    // 50 件のみの HAR（ページング不要）
    const json = buildTestHar(50);
    await uploadHar(page, json);

    // サマリ「リクエスト: N 件」が表示されるまで待つ（span > strong 構造）
    await expect(page.getByText('50', { exact: true })).toBeVisible({ timeout: 10000 });

    // ページャが表示されないことを確認
    // (PAGE_SIZE=100 なので 50 件は 1 ページに収まる)
    await expect(page.getByRole('button', { name: '次へ' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: '前へ' })).not.toBeVisible();
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
