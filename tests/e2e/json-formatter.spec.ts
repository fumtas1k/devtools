import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('JSON整形・ビューア（production CSP 適用）', () => {
  test('サンプルを整形し、大きな整数の精度を保持する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      const output = page.getByRole('textbox', { name: '整形結果' });
      await expect(output).toHaveValue(/"name": "東京タワー"/);
      // 整形（2スペース）でインデントされる
      await expect(output).toHaveValue(/\n {2}"name"/);
      // 大きな整数が欠落しない（JS number 化なら 1234567890123456800 になる）
      await expect(output).toHaveValue(/1234567890123456789/);
    });
  });

  test('最小化モードで空白を除去する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill('{\n  "a": 1,\n  "b": [2, 3]\n}');
      await page.getByRole('button', { name: '最小化' }).click();
      await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue(
        '{"a":1,"b":[2,3]}'
      );
    });
  });

  test('インデントを4スペースに変更できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill('{"a":1}');
      await page.getByRole('button', { name: '4', exact: true }).click();
      await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue('{\n    "a": 1\n}');
    });
  });

  // 陽性対照（E2E）: 不正 JSON は行・列付きのエラーとして表示される。
  // 検知が空回りしていれば alert が出ず fail する。
  test('不正な JSON を行・列付きエラーで表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill('{"a":}');
      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible();
      await expect(alert).toContainText('行');
      await expect(alert).toContainText('列');
    });
  });

  test('ツリー表示に切り替えてキー・値を表示し、折りたたみ/展開できる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await page.getByRole('button', { name: 'ツリー' }).click();

      const tree = page.getByRole('group', { name: 'JSON ツリー' });
      await expect(tree).toBeVisible();
      await expect(tree.getByText('"name"')).toBeVisible();
      await expect(tree.getByText('東京タワー')).toBeVisible();

      // 全折りたたみで子が隠れ、折りたたみサマリ（項目数）が出る
      await page.getByRole('button', { name: '全折りたたみ' }).click();
      await expect(tree.getByText('"name"')).toHaveCount(0);
      await expect(tree.getByText(/項目/)).toBeVisible();

      // 全展開で再び子が見える
      await page.getByRole('button', { name: '全展開' }).click();
      await expect(tree.getByText('"name"')).toBeVisible();
    });
  });

  test('クエリ抽出: ナビゲーションで値を取り出す（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await page.getByLabel('クエリ (JMESPath)').fill('location.lat');
      await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue('35.6586');
    });
  });

  // 陽性対照（CSP）: フィルタ式（式評価を伴う）を実行しても CSP 違反が出ないこと。
  // eval/Function を使うエンジンに差し替えると withProductionCsp の guard が違反を検知して fail する。
  test('クエリ抽出: フィルタ式が production CSP 下で動く（eval 非使用の証明）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page
        .getByLabel('入力')
        .fill('{"items":[{"name":"A","price":5},{"name":"B","price":20}]}');
      await page.getByLabel('クエリ (JMESPath)').fill('items[?price > `10`].name');
      await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue(/"B"/);
      // withProductionCsp が fn 終了後に guard.assertNoViolations() を実行する。
    });
  });

  test('クエリ抽出: 不正式はクエリ欄下にエラー表示（入力エラーと分離・CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill('{"a":1}');
      await page.getByLabel('クエリ (JMESPath)').fill('items[?(');
      await expect(page.getByRole('alert')).toContainText('クエリ式が不正です');
    });
  });

  test('クエリ抽出: クエリを空にすると全体表示に戻る（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      const query = page.getByLabel('クエリ (JMESPath)');
      await query.fill('location.lat');
      await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue('35.6586');
      await query.fill('');
      await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue(
        /"name": "東京タワー"/
      );
    });
  });

  test('クエリ抽出: 入力 JSON が不正な間はクエリ欄で修正を案内（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill('{ broken');
      await page.getByLabel('クエリ (JMESPath)').fill('location.lat');
      await expect(page.getByText('入力 JSON を修正するとクエリを実行できます')).toBeVisible();
    });
  });
});
