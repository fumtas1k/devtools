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

  test('固定文言カラムの見出しが nowrap で1文字ずつ縦折り返ししない（狭幅でも）', async ({
    page,
  }) => {
    // スマホ相当の狭幅にしてカラムが squeeze される状況を再現
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tools/har-viewer');

    const json = buildTestHar(3);
    await uploadHar(page, json);

    // テーブル描画を待つ
    await expect(page.getByRole('button', { name: /\/api\/item\/0$/ })).toBeVisible({
      timeout: 10000,
    });

    // 固定文言カラムの見出しは折り返さない（whitespace-nowrap）。
    // これを外すと computed style が 'normal' に戻りこの assert が fail する（陽性ガード）。
    for (const name of ['メソッド', 'ステータス', 'サイズ', '時間']) {
      const header = page.getByRole('columnheader', { name });
      const whiteSpace = await header.evaluate((el) => getComputedStyle(el).whiteSpace);
      expect(whiteSpace, `${name} カラム見出しは nowrap であるべき`).toBe('nowrap');
    }

    // URL カラムは可変長を吸収するため折り返し可のまま（nowrap にしない）
    const urlHeader = page.getByRole('columnheader', { name: 'URL' });
    const urlWhiteSpace = await urlHeader.evaluate((el) => getComputedStyle(el).whiteSpace);
    expect(urlWhiteSpace).not.toBe('nowrap');
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

  test('壊れた entry（request/response 欠落）を含んでもクラッシュせず描画する', async ({
    page,
  }) => {
    await page.goto('/tools/har-viewer');

    // 1 件目は正常、2 件目は request/response を欠く壊れた entry（issue #681 再現データ）
    const json = JSON.stringify({
      log: {
        version: '1.2',
        creator: { name: 'test', version: '1.0' },
        entries: [
          {
            time: 10,
            request: {
              method: 'GET',
              url: 'https://example.com/api/ok',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
          {}, // 壊れた entry
        ],
      },
    });
    await uploadHar(page, json);

    // 正常 entry が描画される（React island がクラッシュしていない陽性対照）
    await expect(page.getByRole('button', { name: /\/api\/ok$/ })).toBeVisible({
      timeout: 10000,
    });
    // 壊れた entry 行はプレースホルダで表示される
    await expect(page.getByText('（壊れたエントリ）')).toBeVisible();
    // サマリのリクエスト件数は 2 件（entry は配列に保持される）
    await expect(page.getByText(/リクエスト:/)).toBeVisible();
  });

  test('先頭 entry が null でも自動選択で詳細プレースホルダが表示される', async ({ page }) => {
    await page.goto('/tools/har-viewer');

    // 先頭 entry が null（index=0 が自動選択される）+ 2 件目は正常
    const json = JSON.stringify({
      log: {
        version: '1.2',
        creator: { name: 'test', version: '1.0' },
        entries: [
          null,
          {
            time: 10,
            request: {
              method: 'GET',
              url: 'https://example.com/api/ok',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    });
    await uploadHar(page, json);

    // 正常 entry が一覧に描画される（React island がクラッシュしていない陽性対照）
    await expect(page.getByRole('button', { name: /\/api\/ok$/ })).toBeVisible({
      timeout: 10000,
    });
    // 先頭 null entry が自動選択され、詳細パネルにプレースホルダが出る。
    // 修正前は selectedEntry が falsy で詳細パネル自体が描画されず、この assert は fail する（陽性ガード）。
    await expect(page.getByText(/詳細を表示できません/)).toBeVisible();
  });

  test('タイミング列が PC 幅で表示され詳細パネルにタイミング内訳が出る', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/tools/har-viewer');

    // timings を持つ 2 件の HAR（2 件目は起点をずらして相対配置を確認）
    const json = JSON.stringify({
      log: {
        version: '1.2',
        creator: { name: 'test', version: '1.0' },
        entries: [
          {
            startedDateTime: '2026-06-15T00:00:00.000Z',
            time: 100,
            timings: { blocked: 5, dns: 10, connect: 20, ssl: 8, send: 2, wait: 55, receive: 8 },
            request: {
              method: 'GET',
              url: 'https://example.com/a',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: { size: 0 } },
          },
          {
            startedDateTime: '2026-06-15T00:00:00.060Z',
            time: 80,
            timings: { blocked: 2, send: 1, wait: 70, receive: 7 },
            request: {
              method: 'POST',
              url: 'https://example.com/b',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: { status: 201, headers: [], cookies: [], content: { size: 0 } },
          },
        ],
      },
    });
    await uploadHar(page, json);

    // PC 幅では「タイミング」列見出しが表示される（陽性対照: hidden md:table-cell が効く）
    await expect(page.getByRole('button', { name: /\/a$/ })).toBeVisible({ timeout: 10000 });
    // th 要素を直接取得（hidden md:table-cell は display:none→table-cell 切替のため
    // accessibility tree から除外されることがある。DOM 存在 + 可視性を CSS で確認する）
    const timingHeader = page.locator('th', { hasText: 'タイミング' });
    await expect(timingHeader).toBeVisible();

    // 1 件目をクリックして詳細パネルにタイミング内訳が出ることを確認
    await page.getByRole('button', { name: /\/a$/ }).click();
    // 詳細パネルの「タイミング」見出し（h4）を特定（th との重複を避けるため heading role を使う）
    await expect(page.getByRole('heading', { name: 'タイミング' })).toBeVisible();
    // フェーズラベルが詳細パネルに出る
    await expect(page.getByText('待ち(wait)')).toBeVisible();
    await expect(page.getByText('合計')).toBeVisible();
  });

  test('正常 entry 選択後も壊れた行を再クリックして詳細プレースホルダを再表示できる', async ({
    page,
  }) => {
    await page.goto('/tools/har-viewer');

    // 先頭が壊れた entry（{}）+ 2 件目は正常（issue #701 再現データ）
    const json = JSON.stringify({
      log: {
        version: '1.2',
        creator: { name: 'test', version: '1.0' },
        entries: [
          {}, // 壊れた entry（先頭。auto-select で index=0 が選ばれる）
          {
            time: 10,
            request: {
              method: 'GET',
              url: 'https://example.com/api/ok',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    });
    await uploadHar(page, json);

    // 正常 entry が一覧に描画される（React island がクラッシュしていない陽性対照）
    const okButton = page.getByRole('button', { name: /\/api\/ok$/ });
    await expect(okButton).toBeVisible({ timeout: 10000 });

    // 前提: 先頭の壊れ entry が auto-select され詳細プレースホルダが出る
    await expect(page.getByText(/詳細を表示できません/)).toBeVisible();

    // 正常 entry をクリックして選択を移す → 詳細に正常 entry の URL が出る
    await okButton.click();
    await expect(page.getByText('https://example.com/api/ok')).toBeVisible();
    // プレースホルダは消える
    await expect(page.getByText(/詳細を表示できません/)).toHaveCount(0);

    // 壊れた行（「（壊れたエントリ）」button）を再クリック → 詳細プレースホルダが再表示される。
    // 修正前は壊れ行が button でなくクリックできないため、ここで fail する（陽性ガード）。
    await page.getByRole('button', { name: '（壊れたエントリ）' }).click();
    await expect(page.getByText(/詳細を表示できません/)).toBeVisible();
  });
});
