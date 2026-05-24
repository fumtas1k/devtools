import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

const card = (slug: string) => `#search-results a[href="/tools/${slug}"]`;

test.describe('トップページ ツール検索（production CSP 適用）', () => {
  test('検索語入力でタブ/パネルを隠し、全ツール横断で結果を絞り込む', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        const search = page.getByRole('searchbox', { name: 'ツールを検索' });

        // 初期状態: タブ表示・検索結果は非表示
        await expect(page.locator('#tab-bar')).toBeVisible();
        await expect(page.locator('#search-results')).toBeHidden();

        await search.fill('json');

        // タブ/パネルは隠れ、検索結果グリッドが出る
        await expect(page.locator('#tab-bar')).toBeHidden();
        await expect(page.locator('#panels')).toBeHidden();
        await expect(page.locator('#search-results')).toBeVisible();

        // 陽性: JSON 系がヒット。config-converter は別カテゴリ(変換)だが説明に
        // json を含むため横断ヒットする
        await expect(page.locator(card('json-xml'))).toBeVisible();
        await expect(page.locator(card('json-csv'))).toBeVisible();
        await expect(page.locator(card('config-converter'))).toBeVisible();

        // 陰性: 無関係なツールは隠れる
        await expect(page.locator(card('qr-code'))).toBeHidden();

        await expect(page.locator('#search-status')).toContainText('件のツールが見つかりました');
      },
      { skipHydration: true }
    );
  });

  test('複数語クエリは全トークン AND マッチする', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        // 「json csv」は両トークンを含む json-csv のみヒットし、csv を含まない
        // json-xml はヒットしない（AND の陽性/陰性を 1 ケースで検証）
        await page.getByRole('searchbox', { name: 'ツールを検索' }).fill('json csv');

        await expect(page.locator(card('json-csv'))).toBeVisible();
        await expect(page.locator(card('json-xml'))).toBeHidden();
      },
      { skipHydration: true }
    );
  });

  test('カタカナ入力でもひらがな読み(yomi)にヒットする', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        // yomi は「じぇいそん…」。カタカナ「ジェイソン」もひらがな正規化でヒット
        await page.getByRole('searchbox', { name: 'ツールを検索' }).fill('ジェイソン');

        await expect(page.locator(card('json-xml'))).toBeVisible();
        await expect(page.locator(card('json-csv'))).toBeVisible();
      },
      { skipHydration: true }
    );
  });

  test('クリアボタンで元のタブ UI に戻る', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        const search = page.getByRole('searchbox', { name: 'ツールを検索' });
        await search.fill('json');
        await expect(page.locator('#search-results')).toBeVisible();

        await page.getByRole('button', { name: '検索をクリア' }).click();

        await expect(search).toHaveValue('');
        await expect(page.locator('#tab-bar')).toBeVisible();
        await expect(page.locator('#search-results')).toBeHidden();
      },
      { skipHydration: true }
    );
  });

  test('ヒット 0 件のとき「該当するツールがありません」を表示する', async ({ browser }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        await page.getByRole('searchbox', { name: 'ツールを検索' }).fill('該当しない検索語zzz');

        await expect(page.locator('#search-status')).toHaveText('該当するツールがありません');
        await expect(page.locator(card('json-xml'))).toBeHidden();
      },
      { skipHydration: true }
    );
  });
});
