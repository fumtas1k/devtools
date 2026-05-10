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

  test('"Hello世界" 入力で半角0.5・全角1換算が 4.5 と表示される', async ({ page }) => {
    await page.getByLabel('入力テキスト').fill('Hello世界');
    // ASCII 5 文字 × 0.5 + 全角 2 文字 × 1 = 4.5
    await expect(page.locator('dt:has-text("半角0.5・全角1換算") + dd')).toContainText('4.5');
  });

  test('任意上限を 100 に変更すると "hello" 入力時に文字数 5 が表示される', async ({ page }) => {
    await page.getByLabel('入力テキスト').fill('hello');
    await page.getByLabel('任意上限').fill('100');
    // 任意上限カード (article) の current 値に 5 が表示される
    const customCard = page.locator('article').filter({ has: page.getByText('任意上限') });
    await expect(customCard).toContainText('5');
    await expect(page.getByLabel('任意上限')).toHaveValue('100');
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

  // 陽性対照: SNS 上限超過時に X カードの current 値に text-error が付与される
  // 旧実装 (色変更ロジック無し) ではこのテストは fail する
  test('[陽性対照] Twitter weight 上限超過時 X カードの current に text-error が付与される', async ({
    page,
  }) => {
    await page.getByLabel('入力テキスト').fill('a'.repeat(300));
    const xCard = page.locator('article').filter({ has: page.getByText('X (旧 Twitter)') });
    // current 値の <span> に text-error class
    await expect(xCard.locator('span.text-error').first()).toBeVisible();
    // 補強: progressbar の aria-valuenow が max (280) で clamp される
    await expect(xCard.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '280');
    // SR 補強: aria-valuetext で実数値 (300) と「上限超過」を通知する
    await expect(xCard.getByRole('progressbar')).toHaveAttribute('aria-valuetext', /300.*上限超過/);
  });

  // 陰性対照: 上限内では text-error が付かない (過検知防止)
  test('上限内のとき X カードの current に text-error が付かない', async ({ page }) => {
    await page.getByLabel('入力テキスト').fill('hello');
    const xCard = page.locator('article').filter({ has: page.getByText('X (旧 Twitter)') });
    // current 値の <span> に text-error class が付いていないこと
    await expect(xCard.locator('span.text-error')).toHaveCount(0);
  });

  test('SNS カード 3 枚 (X / Bluesky / 任意上限) が描画される', async ({ page }) => {
    await expect(page.getByText('X (旧 Twitter)')).toBeVisible();
    await expect(page.getByText('Bluesky')).toBeVisible();
    await expect(page.getByText('任意上限')).toBeVisible();
    // 3 progressbar が見える (X/Bluesky/任意上限 用)
    await expect(page.getByRole('progressbar')).toHaveCount(3);
  });

  test('PC viewport (1280x800): SNS カード 3 枚が横並びになる', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const xCard = page.locator('article').filter({ has: page.getByText('X (旧 Twitter)') });
    const blueskyCard = page.locator('article').filter({ has: page.getByText('Bluesky') });
    const customCard = page.locator('article').filter({ has: page.getByText('任意上限') });
    const xBox = await xCard.boundingBox();
    const bskyBox = await blueskyCard.boundingBox();
    const customBox = await customCard.boundingBox();
    expect(xBox).not.toBeNull();
    expect(bskyBox).not.toBeNull();
    expect(customBox).not.toBeNull();
    if (xBox && bskyBox && customBox) {
      // 同じ Y 座標 (±5px) に並ぶ
      expect(Math.abs(xBox.y - bskyBox.y)).toBeLessThan(5);
      expect(Math.abs(xBox.y - customBox.y)).toBeLessThan(5);
      // X 座標は左→右の順
      expect(bskyBox.x).toBeGreaterThan(xBox.x);
      expect(customBox.x).toBeGreaterThan(bskyBox.x);
    }
  });

  test('モバイル viewport (390x844): SNS カード 3 枚が縦積みになる', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const xCard = page.locator('article').filter({ has: page.getByText('X (旧 Twitter)') });
    const blueskyCard = page.locator('article').filter({ has: page.getByText('Bluesky') });
    const customCard = page.locator('article').filter({ has: page.getByText('任意上限') });
    const xBox = await xCard.boundingBox();
    const bskyBox = await blueskyCard.boundingBox();
    const customBox = await customCard.boundingBox();
    expect(xBox).not.toBeNull();
    expect(bskyBox).not.toBeNull();
    expect(customBox).not.toBeNull();
    if (xBox && bskyBox && customBox) {
      // Y 座標が下に並ぶ
      expect(bskyBox.y).toBeGreaterThan(xBox.y);
      expect(customBox.y).toBeGreaterThan(bskyBox.y);
    }
  });

  test('URL を入れると X weight が 23 換算される', async ({ page }) => {
    await page.getByLabel('入力テキスト').fill('https://example.com');
    const xCard = page.locator('article').filter({ has: page.getByText('X (旧 Twitter)') });
    await expect(xCard.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '23');
  });

  test('「概算」ラベルが X カードから削除されている', async ({ page }) => {
    const xCard = page.locator('article').filter({ has: page.getByText('X (旧 Twitter)') });
    await expect(xCard.getByText('概算')).toHaveCount(0);
    await expect(xCard.getByText('（概算）')).toHaveCount(0);
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
