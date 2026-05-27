import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('正規表現ビジュアライザ', () => {
  test('有効な正規表現で構造ツリーが表示される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(ab)+');
      await expect(page.getByText(/1 回以上の繰り返し/)).toBeVisible();
    });
  });

  test('脆弱な正規表現で危険判定と攻撃文字列が出る（CSP 下で checkSync 動作）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(a+)+$');
      // ReDoS 判定セクション内の「脆弱：ReDoS のリスク」テキスト（ページ説明文の「脆弱性」と区別）
      await expect(
        page.getByRole('region', { name: 'ReDoS 判定' }).getByText(/脆弱：ReDoS/)
      ).toBeVisible();
      await expect(page.getByRole('button', { name: '攻撃文字列をコピー' })).toBeVisible();
    });
  });

  test('安全な正規表現で安全判定が出る', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('^[a-z]+$');
      // ReDoS 判定セクション内の「安全：」テキスト
      await expect(
        page.getByRole('region', { name: 'ReDoS 判定' }).getByText(/安全：/)
      ).toBeVisible();
    });
  });

  test('不正な正規表現でエラーが出る', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(');
      // ErrorMessage コンポーネントは role="alert" で描画される
      await expect(page.getByRole('alert').first()).toBeVisible();
    });
  });

  test('鉄道図タブに切り替えると SVG が表示される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(abc)');
      await expect(page.getByText('キャプチャグループ #1')).toBeVisible(); // 構造ツリー側で解析完了を待つ
      await page.getByRole('button', { name: '鉄道図' }).click();
      await expect(page.getByRole('img', { name: '正規表現の鉄道図' })).toBeVisible();
    });
  });

  test('選択肢 a|b|c が鉄道図で分岐表示される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('a|b|c');
      await expect(page.getByText('選択肢 (|)').first()).toBeVisible(); // 構造ツリー側で解析完了を待つ（a|b|c は Disjunction が2段ネストするため複数要素に解決される）
      await page.getByRole('button', { name: '鉄道図' }).click();
      await expect(page.getByRole('img', { name: '正規表現の鉄道図' })).toBeVisible();
    });
  });

  test('量指定子 a+ が鉄道図で表示される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('a+b');
      await expect(page.getByText(/1 回以上の繰り返し/)).toBeVisible(); // 構造ツリーで解析完了待ち
      await page.getByRole('button', { name: '鉄道図' }).click();
      await expect(page.getByRole('img', { name: '正規表現の鉄道図' })).toBeVisible();
    });
  });
});
