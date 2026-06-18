import { test, expect } from '@playwright/test';
import { withProductionCsp, waitForReactHydration } from './helpers';

test.describe('markdownエディタ（production CSP 適用）', () => {
  // ─── 陰性対照: 正常な変換が行われることを確認 ───────────────────────

  test('陰性対照: 見出しを入力するとプレビューに heading が表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await waitForReactHydration(page);
      await page.getByLabel('markdown入力').fill('# 見出し1');
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
      await expect(page.getByText('markdown を入力するとプレビューが表示されます')).toBeVisible();
    });
  });

  test('陰性対照: 入力するとHTMLコピーボタンが表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await waitForReactHydration(page);
      // 空入力時はコピーボタンを表示しない（空文字コピーを防ぐ）
      await expect(page.getByRole('button', { name: 'HTMLコピー' })).toHaveCount(0);
      // 入力するとコピーボタンが表示される
      await page.getByLabel('markdown入力').fill('# 見出し');
      await expect(page.getByRole('button', { name: 'HTMLコピー' })).toBeVisible();
    });
  });

  test('陰性対照: 入力すると.mdダウンロードボタンが表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await waitForReactHydration(page);
      // 空入力時はダウンロードボタンを表示しない（空ファイル DL を防ぐ）
      await expect(page.getByRole('button', { name: '.mdダウンロード', exact: false })).toHaveCount(
        0
      );
      // 入力するとダウンロードボタンが表示される
      await page.getByLabel('markdown入力').fill('# 見出し');
      await expect(
        page.getByRole('button', { name: '.mdダウンロード', exact: false })
      ).toBeVisible();
    });
  });

  test('陰性対照: クリアボタンで入力と出力ボタンがリセットされる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await waitForReactHydration(page);
      await page.getByLabel('markdown入力').fill('# 見出し');
      await expect(page.getByRole('button', { name: 'HTMLコピー' })).toBeVisible();
      // クリアで入力が空になり、出力系ボタンと案内テキストが初期状態へ戻る
      await page.getByRole('button', { name: 'クリア' }).click();
      await expect(page.getByLabel('markdown入力')).toHaveValue('');
      await expect(page.getByRole('button', { name: 'HTMLコピー' })).toHaveCount(0);
      await expect(page.getByText('markdown を入力するとプレビューが表示されます')).toBeVisible();
    });
  });

  test('陰性対照: **太字** → <strong> がプレビューに反映される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      await page.getByLabel('markdown入力').fill('**太字テスト**');
      await expect(page.locator('.markdown-preview strong')).toContainText('太字テスト');
    });
  });

  test('陰性対照: GFM 表 → table がプレビューに反映される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      const tableMarkdown = '| A | B |\n| --- | --- |\n| 1 | 2 |';
      await page.getByLabel('markdown入力').fill(tableMarkdown);
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
      await page.getByLabel('markdown入力').fill('<script>alert(1)</script>通常テキスト');
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
      await page.getByLabel('markdown入力').fill('[クリック](javascript:alert(1))');
      // リンクが表示されるまで待つ
      await expect(page.locator('.markdown-preview a')).toBeVisible();
      // href に javascript: が含まれないことを確認
      const href = await page.locator('.markdown-preview a').getAttribute('href');
      expect(href ?? '').not.toContain('javascript:');
    });
  });

  // ─── 高さ一致ガード: 入力欄とプレビューの縦幅が揃うことを担保 ──────────
  // 入力 textarea(rows=18 ≒ 28rem) とプレビュー箱(.md-preview-box = 固定高 28rem) を揃える設計。
  // 旧実装（プレビューが青天井に伸長）では高さ差が広がり fail する。
  test('高さガード: 長文入力時に入力欄とプレビューの高さがほぼ一致する（PC 幅）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
      // 左右 2 カラムが横並びになる PC 幅で検証する（md ブレークポイント >= 768px）
      await page.setViewportSize({ width: 1280, height: 800 });
      await waitForReactHydration(page);

      // プレビューが入力欄より明確に高くなるよう、十分に長い markdown を入力する
      const longMarkdown = Array.from(
        { length: 40 },
        (_, i) => `## 見出し${i + 1}\n\n本文テキスト${i + 1}`
      ).join('\n\n');
      await page.getByLabel('markdown入力').fill(longMarkdown);

      const input = page.getByLabel('markdown入力');
      const preview = page.locator('.markdown-preview');
      await expect(preview).toBeVisible();

      // 実際に見えている箱どうし（入力 textarea とプレビュー箱）の高さを比較する。
      // wrapper 同士の比較では「箱が wrapper をはみ出す」等の真の不揃いを検出できないため、
      // 可視要素を直接比較する。旧実装（プレビューが青天井に伸びる）では diff が広がり fail する。
      const inputBox = await input.boundingBox();
      const previewBox = await preview.boundingBox();
      if (!inputBox || !previewBox) throw new Error('boundingBox が取得できませんでした');

      // 固定高 28rem 同士のため両者の高さは一致する。border/padding 差の許容差は数 px。
      expect(Math.abs(inputBox.height - previewBox.height)).toBeLessThanOrEqual(5);
    });
  });
});
