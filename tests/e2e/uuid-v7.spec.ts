import { test, expect } from '@playwright/test';
import { applyProductionCsp, waitForReactHydration } from './helpers';

test.describe('UUID v7 生成（production CSP 適用）', () => {
  test('UUIDをデフォルト（10件）生成できる（CSP 違反なし）', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      await page.goto('/tools/uuid-v7');
      await page.getByLabel('生成数').waitFor();
      await waitForReactHydration(page);

      await page.getByRole('button', { name: '生成' }).click();

      // 「10 件生成」というテキストが表示される
      await expect(page.getByText('10 件生成')).toBeVisible();

      // テーブルに行が存在し、UUID形式（8-4-4-4-12）であることを確認
      const rows = page.locator('table tbody tr');
      await expect(rows).toHaveCount(10);
      const uuidCell = rows.first().locator('td').nth(1);
      const uuidText = await uuidCell.textContent();
      // UUID v7 の正規表現 (バージョン 7 であることを確認)
      expect(uuidText).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });

  test('UUIDを複数件一括生成できる（CSP 違反なし）', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      await page.goto('/tools/uuid-v7');
      await page.getByLabel('生成数').waitFor();
      await waitForReactHydration(page);

      const countInput = page.getByLabel('生成数');
      await countInput.fill('5');
      await page.getByRole('button', { name: '生成' }).click();

      await expect(page.getByText('5 件生成')).toBeVisible();
      const rows = page.locator('table tbody tr');
      await expect(rows).toHaveCount(5);

      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });

  test('クォートスタイルを切り替えられる（CSP 違反なし）', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      await page.goto('/tools/uuid-v7');
      await page.getByLabel('生成数').waitFor();
      await waitForReactHydration(page);

      await page.getByRole('button', { name: '生成' }).click();

      const noneBtn = page.getByRole('button', { name: 'なし' });
      const doubleBtn = page.getByRole('button', { name: '"..."' });
      const singleBtn = page.getByRole('button', { name: "'...'" });

      // デフォルトは「なし」が選択されている
      await expect(noneBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(doubleBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(singleBtn).toHaveAttribute('aria-pressed', 'false');

      const uuidCell = page.locator('table tbody tr').first().locator('td').nth(1);
      const coloredUuid = uuidCell.locator('span[aria-label]');

      // UUID v7 の正規表現
      const uuidV7Regex = /[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

      // なしの状態ではクォートが含まれない
      await expect(coloredUuid).toHaveAttribute(
        'aria-label',
        new RegExp(`^${uuidV7Regex.source}$`, 'i')
      );

      // ダブルクォートに切り替え
      await doubleBtn.click();
      await expect(noneBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(doubleBtn).toHaveAttribute('aria-pressed', 'true');

      await expect(coloredUuid).toHaveAttribute(
        'aria-label',
        new RegExp(`^"${uuidV7Regex.source}"$`, 'i')
      );

      // シングルクォートに切り替え
      await singleBtn.click();
      await expect(singleBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(doubleBtn).toHaveAttribute('aria-pressed', 'false');

      await expect(coloredUuid).toHaveAttribute(
        'aria-label',
        new RegExp(`^'${uuidV7Regex.source}'$`, 'i')
      );

      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });

  test('行をクリックするとフィールド分解パネルが表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      await page.goto('/tools/uuid-v7');
      await page.getByLabel('生成数').waitFor();
      await waitForReactHydration(page);

      await page.getByRole('button', { name: '生成' }).click();

      // 最初の行をクリック
      await page.locator('table tbody tr').first().click();

      // フィールド分解パネルが表示されることを確認
      await expect(page.getByText('フィールド分解', { exact: true })).toBeVisible();
      await expect(page.getByText('unix_ts_ms', { exact: true })).toBeVisible();
      await expect(page.getByText('ver', { exact: true })).toBeVisible();

      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });

  test('クリアボタンでリストをリセットできる（CSP 違反なし）', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      await page.goto('/tools/uuid-v7');
      await page.getByLabel('生成数').waitFor();
      await waitForReactHydration(page);

      await page.getByRole('button', { name: '生成' }).click();
      await expect(page.getByText('10 件生成')).toBeVisible();

      // 最初の行をクリックしてフィールド分解パネルを表示
      await page.locator('table tbody tr').first().click();
      await expect(page.getByText('フィールド分解', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'クリア' }).click();
      await expect(page.getByText('0 件生成')).not.toBeVisible();
      await expect(page.locator('table')).not.toBeVisible();
      await expect(page.getByText('フィールド分解', { exact: true })).not.toBeVisible();

      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });

  // 陽性対照 — ゲート自体の動作確認
  test('applyProductionCsp は実際に CSP 違反を捕捉する（ゲート自体の動作確認）', async ({
    browser,
  }) => {
    // helper の組み合わせが将来壊れたとき「ゲートが空回りしているのに green」
    // になる事故を防ぐメタテスト。意図的に CSP 違反を発生させ guard.violations
    // が確実に増えることを確認する。
    //
    // 設計メモ:
    // - browser から新規 context + 新規 page を作る。
    // - page.evaluate(() => eval(...)) は Playwright が CDP Runtime.evaluate
    //   経由でコードを評価するため CSP `unsafe-eval` を回避してしまう。代わりに
    //   「外部 origin の <script src>」を DOM に挿入する経路で違反を起こす。
    //   PRODUCTION_CSP は `script-src 'self' 'unsafe-inline'` のため
    //   example.com の外部スクリプトは確実に block され Chromium が
    //   "Refused to load the script ... because it violates the following
    //    Content Security Policy directive ..." を console error に出す。
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      const response = await page.goto('/tools/uuid-v7');
      // 前提検証: route 注入によって本番 CSP がレスポンスヘッダに乗っていること
      expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = 'https://example.com/violates-csp.js';
        document.head.appendChild(script);
      });
      await expect.poll(() => guard.violations.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});
