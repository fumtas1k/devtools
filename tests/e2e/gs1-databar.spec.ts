import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('GS1 DataBar 生成（production CSP 適用）', () => {
  test('ページが正しく表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      await expect(page.getByRole('heading', { name: 'GS1 DataBar 生成' })).toBeVisible();
      await expect(page.getByLabel('AI コード 1')).toBeVisible();
      await expect(page.getByRole('button', { name: '+ フィールド追加' })).toBeVisible();
    });
  });

  test('AI コード Select のデフォルト値が正しい（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 初期フィールドは賞味/消費期限(17) と ロット番号(10)
      await expect(page.getByLabel('AI コード 1')).toHaveValue('17');
      await expect(page.getByLabel('AI コード 2')).toHaveValue('10');
    });
  });

  test('別フィールドで選択済みの AI は disabled になる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 1 行目は '17'（賞味/消費期限）、2 行目は '10'（ロット番号）
      // 2 行目 Select で '17' の option は disabled のはず
      const opt17InSelect2 = page
        .getByLabel('AI コード 2')
        .getByRole('option', { name: '賞味/消費期限 (17)' });
      await expect(opt17InSelect2).toBeDisabled();

      // 2 行目 Select で '10' の option は disabled でない
      const opt10InSelect2 = page
        .getByLabel('AI コード 2')
        .getByRole('option', { name: 'ロット番号 (10)' });
      await expect(opt10InSelect2).toBeEnabled();
    });
  });

  test('1 行目の AI を変更すると 2 行目の disabled が連動する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 初期状態: Select1='17', Select2='10'。未使用の '11'（製造日）を 1 行目に選択
      await page.getByLabel('AI コード 1').selectOption('11');
      await expect(page.getByLabel('AI コード 1')).toHaveValue('11');

      // React 再レンダリング後に '11' が Select 2 で disabled になるのを expect のオートリトライで待つ
      await expect(
        page.getByLabel('AI コード 2').getByRole('option', { name: '製造日 (11)' })
      ).toBeDisabled();

      // '17' は 2 行目で enabled になる
      await expect(
        page.getByLabel('AI コード 2').getByRole('option', { name: '賞味/消費期限 (17)' })
      ).toBeEnabled();
    });
  });

  test('削除ボタンでフィールドが減る（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 初期状態: 2 フィールド
      await expect(page.getByLabel('AI コード 1')).toBeVisible();
      await expect(page.getByLabel('AI コード 2')).toBeVisible();

      await page.getByRole('button', { name: 'フィールドを削除' }).first().click();

      await expect(page.getByLabel('AI コード 2')).toBeHidden();
      await expect(page.getByLabel('AI コード 1')).toBeVisible();
    });
  });

  test('+ フィールド追加でフィールドが増える（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 初期状態: 2 フィールド。1 行削除してから追加
      await page.getByRole('button', { name: 'フィールドを削除' }).first().click();
      await expect(page.getByLabel('AI コード 1')).toBeVisible();

      await page.getByRole('button', { name: '+ フィールド追加' }).click();
      await expect(page.getByLabel('AI コード 2')).toBeVisible();
    });
  });

  // 陽性対照: PNG ダウンロード失敗時に ErrorMessage が表示されることを保証する
  // (issue #338: 旧実装は fire-and-forget で unhandled promise rejection、UI feedback 無し)。
  // svgContentToPngBlob 内の `URL.createObjectURL(svgBlob)` 経路を意図的に throw させ、
  // Promise reject → downloadPng の try/catch → setDownloadError → role=alert 表示
  // という全経路を実証する。
  test('PNG ダウンロード失敗時に ErrorMessage が表示される（陽性対照 / CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // GTIN-14 を入力して SVG 生成を待つ
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

      // svgContentToPngBlob 内 `URL.createObjectURL(svgBlob)` を意図的に throw させる。
      // 同期 throw は Promise executor 内なので Promise reject に変換される (Promise spec)。
      // blob.type は Chromium の正規化で `image/svg+xml;charset=utf-8` になる場合があるため
      // startsWith で照合する。PNG 出力 blob (`image/png`) は除外され影響しない。
      await page.evaluate(() => {
        const orig = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob: Blob) => {
          if (blob.type.startsWith('image/svg+xml')) {
            throw new Error('forced failure for E2E positive control');
          }
          return orig(blob);
        };
      });

      await page.getByRole('button', { name: 'PNGダウンロード' }).click();

      // role=alert の ErrorMessage block に「ダウンロードエラー」が表示される
      await expect(page.getByRole('alert').filter({ hasText: /ダウンロードエラー/ })).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────
  // バーコード認識安定化 (anti-aliasing 抑止) のブラウザ実測検証
  //
  // 旧実装は (a) bwip-js SVG に shape-rendering 未指定、(b) Canvas→PNG 時に
  // imageSmoothingEnabled = true (default) のため、bar/space edge が灰色に滲み
  // scanner が黒/白二値閾値で decode 失敗する事象を起こしていた (composite CC-A
  // のロット (10) が読めない事象)。fix を revert すると以下 2 ケースは必ず fail
  // する陽性対照。
  // ─────────────────────────────────────────────
  test('生成 SVG に shape-rendering="crispEdges" が付与されている（陽性対照 / CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

      const preview = page.getByLabel(/GS1 DataBar.*のバーコード/);
      const innerHtml = await preview.evaluate((el) => el.innerHTML);
      expect(innerHtml).toContain('shape-rendering="crispEdges"');
    });
  });

  test('バーコードプレビューの image-rendering が pixelated（陽性対照 / CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      const preview = page.getByLabel(/GS1 DataBar.*のバーコード/);
      await expect(preview).toBeVisible();

      const rendering = await preview.evaluate((el) => getComputedStyle(el).imageRendering);
      // Chromium (本リポジトリ playwright.config.ts の唯一の project) は
      // 'pixelated' をそのまま正規化して返す。本 assertion はあくまで CSS class が
      // 適用されたことの観測であり、実際の raster cache 経路でのピクセル化挙動は
      // ブラウザ実装依存のため別途実機検証が必要。
      expect(rendering).toBe('pixelated');
    });
  });
});
