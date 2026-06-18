import { test, expect } from '@playwright/test';
import { withProductionCsp, waitForReactHydration } from './helpers';

test.describe('markdownエディタ（production CSP 適用）', () => {
  // ─── 陰性対照: 正常な変換が行われることを確認 ───────────────────────

  test('陰性対照: 見出しを入力するとプレビューに heading が表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await waitForReactHydration(page);
      await page.getByLabel('markdown入力エリア').fill('# 見出し1');
      // ページタイトルの h1 と重複しないようプレビュー内にスコープする
      const preview = page.locator('.markdown-preview');
      await expect(preview.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(preview.getByRole('heading', { level: 1 })).toContainText('見出し1');
    });
  });

  test('陰性対照: サンプルを入力ボタンでサンプルが挿入されプレビューに heading が出る（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await waitForReactHydration(page);
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      // サンプルの最初の h1 が表示される（ページタイトルと重複しないようプレビュー内にスコープ）
      const preview = page.locator('.markdown-preview');
      await expect(preview.getByRole('heading', { level: 1 })).toBeVisible();
    });
  });

  test('陰性対照: 入力前は「入力待ち」の案内テキストが表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await expect(
        page.getByText('markdown を入力するとプレビューが表示されます')
      ).toBeVisible();
    });
  });

  test('陰性対照: HTMLをコピーボタンが存在する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await expect(page.getByRole('button', { name: 'HTMLをコピー' })).toBeVisible();
    });
  });

  test('陰性対照: .mdダウンロードボタンが存在する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await expect(
        page.getByRole('button', { name: '.mdダウンロード', exact: false })
      ).toBeVisible();
    });
  });

  test('陰性対照: **太字** → <strong> がプレビューに反映される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await page.getByLabel('markdown入力エリア').fill('**太字テスト**');
      await expect(page.locator('.markdown-preview strong')).toContainText('太字テスト');
    });
  });

  test('陰性対照: GFM 表 → table がプレビューに反映される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      const tableMarkdown = '| A | B |\n| --- | --- |\n| 1 | 2 |';
      await page.getByLabel('markdown入力エリア').fill(tableMarkdown);
      await expect(page.locator('.markdown-preview table')).toBeVisible();
    });
  });

  // ─── 陽性対照: XSS ペイロードが除去されてプレビューに残らないことを確認 ──
  // 検知能力ゼロで green になることを防ぐ（test-gates skill 準拠）。
  // sanitizeHtml が空回りしていれば <script> が DOM に存在し、これらのテストが fail する。

  test('陽性対照: <script>alert(1)</script> がプレビューの DOM に残らない（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await page.getByLabel('markdown入力エリア').fill('<script>alert(1)</script>通常テキスト');
      // プレビューが表示されるまで待つ
      await expect(page.locator('.markdown-preview')).toContainText('通常テキスト');
      // <script> 要素が DOM に存在しないことを確認（観測可能な振る舞い）
      const scriptCount = await page.locator('.markdown-preview script').count();
      expect(scriptCount).toBe(0);
    });
  });

  test('陽性対照: javascript: href がプレビューのリンクから除去される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await page.getByLabel('markdown入力エリア').fill('[クリック](javascript:alert(1))');
      // リンクが表示されるまで待つ
      await expect(page.locator('.markdown-preview a')).toBeVisible();
      // href に javascript: が含まれないことを確認
      const href = await page.locator('.markdown-preview a').getAttribute('href');
      expect(href ?? '').not.toContain('javascript:');
    });
  });
});
