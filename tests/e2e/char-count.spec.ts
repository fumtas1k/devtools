import { test, expect } from '@playwright/test';
import { applyProductionCsp, waitForReactHydration, withProductionCsp } from './helpers';

test.describe('文字カウント', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/char-count');
    await page.getByLabel('入力テキスト').waitFor();
    await waitForReactHydration(page);
  });

  test('ページが表示され textarea が使用可能', async ({ page }) => {
    await expect(page.getByLabel('入力テキスト')).toBeVisible();
    await expect(page.getByRole('button', { name: 'クリア' })).toBeVisible();
  });

  test('"😀" 入力で utf8mb3 が ❌ と表示される（DB 互換性 core value）', async ({ page }) => {
    await page.getByLabel('入力テキスト').fill('😀');
    // デバウンス後に ❌ が表示される — Playwright assertion が自動リトライ
    // aria-hidden + sr-only 挿入で text content が変化するため regex で部分一致
    await expect(page.getByText(/不可: 1 文字/).first()).toBeVisible();
  });

  test('"あいうえお" は utf8mb3 を含む全エンコーディングで ✅', async ({ page }) => {
    await page.getByLabel('入力テキスト').fill('あいうえお');
    // Shift_JIS ✅ 10 byte が表示されること (BMP 文字は全対応)
    await expect(page.getByText(/✅.*10 byte/).first()).toBeVisible();
    // エンコーディング行に「❌ 不可」が出ないこと
    // (ToolInfoSection に ❌ が含まれるため、エンコーディング行固有の形式 /不可: \d+ 文字/ で絞り込む)
    await expect(page.getByText(/不可: \d+ 文字/)).toHaveCount(0);
  });

  test('"a\\nb\\nc" を入力すると行 3 / LF と表示される', async ({ page }) => {
    await page.getByLabel('入力テキスト').fill('a\nb\nc');
    // 行セクションに LF が表示される
    await expect(page.getByText('LF')).toBeVisible();
  });

  test('任意上限を 100 に変更すると "hello" 入力時に残り 95 が表示される', async ({ page }) => {
    await page.getByLabel('入力テキスト').fill('hello');
    await page.getByLabel('任意上限').fill('100');
    await expect(page.getByText('95')).toBeVisible();
  });

  test('任意上限を空にすると残数が "—" 表示 + SR 用に "未指定" が併記される', async ({ page }) => {
    await page.getByLabel('入力テキスト').fill('あいうえお');
    await page.getByLabel('任意上限').fill('');
    // 任意上限 input の親 div 内にある font-mono span (残数表示) を確認
    const remaining = page.getByLabel('任意上限').locator('..').locator('span.font-mono');
    // 視覚: aria-hidden="true" な span に '—' / SR: sr-only の '未指定'
    await expect(remaining).toContainText('—');
    await expect(remaining).toContainText('未指定');
  });

  // 陽性対照: 入力 validator が "0" を実際に reject することを確認
  // 旧実装 (/^\d+$/) では '0' が通り value が '0' になるためこのテストは fail する
  test('[陽性対照] 任意上限欄に "0" を入力しても reject されて値が変わらない', async ({ page }) => {
    const limit = page.getByLabel('任意上限');
    await limit.fill('100');
    await limit.fill('0');
    // controlled input: setState されなければ value は直前の '100' のまま
    await expect(limit).not.toHaveValue('0');
  });

  // 陽性対照: 先頭ゼロ "01" も reject されること (validator 仕様変更検出力強化)
  test('[陽性対照] 任意上限欄に "01" (先頭ゼロ) を入力しても reject される', async ({ page }) => {
    const limit = page.getByLabel('任意上限');
    await limit.fill('100');
    await limit.fill('01');
    await expect(limit).not.toHaveValue('01');
  });

  test('クリアボタンで textarea が空になる', async ({ page }) => {
    await page.getByLabel('入力テキスト').fill('テスト');
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(page.getByLabel('入力テキスト')).toHaveValue('');
  });

  test('本番相当 CSP 下でページ機能が動作し違反が出ない（リグレッション防止）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/char-count', async (page) => {
      await page.getByLabel('入力テキスト').fill('😀');
      await expect(page.getByText(/不可: 1 文字/).first()).toBeVisible();
    });
  });
});

// 陽性対照: ゲート自体の動作確認
// CSP gate が空回りしていないことを保証するメタテスト (test-gates skill 準拠)。
// withProductionCsp を使わず applyProductionCsp を直接呼ぶ inline pattern 必須
// (withProductionCsp は終端で assertNoViolations を呼ぶため「違反を期待」テストに不向き)。
test.describe('CSP ゲート 陽性対照', () => {
  test('applyProductionCsp は実際に CSP 違反を捕捉する（ゲート自体の動作確認）', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      const response = await page.goto('/tools/char-count');
      // 前提検証: route 注入で本番 CSP が乗っていること
      expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
      // 意図的に外部 script を注入して CSP 違反を起こす
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = 'https://example.com/evil.js';
        document.head.appendChild(script);
      });
      await expect.poll(() => guard.violations.length, { timeout: 5000 }).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});
