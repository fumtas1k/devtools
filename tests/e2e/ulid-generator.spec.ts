import { test, expect } from '@playwright/test';
import { applyProductionCsp, withProductionCsp } from './helpers';

test.describe('ULID生成（production CSP 適用）', () => {
  test('生成ボタンでULIDが表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/ulid-generator', async (page) => {
      await page.getByRole('button', { name: '生成' }).click();
      // 1行目の ULID セル（26文字 Crockford Base32）を確認
      await expect(page.getByRole('cell', { name: /[0-9A-Z]{26}/ }).first()).toBeVisible();
    });
  });

  test('生成数を変えると指定件数のULIDが生成される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/ulid-generator', async (page) => {
      // number input は click(3) で全選択してから type する
      await page.getByLabel('生成数').click({ clickCount: 3 });
      await page.keyboard.type('3');
      await page.getByRole('button', { name: '生成' }).click();

      // ULID セルを含む行 = データ行（ヘッダー行を除外）
      const dataRows = page
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: /[0-9A-Z]{26}/ }) });
      await expect(dataRows).toHaveCount(3);
    });
  });

  test('生成されたULIDはすべて26文字（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/ulid-generator', async (page) => {
      await page.getByLabel('生成数').click({ clickCount: 3 });
      await page.keyboard.type('3');
      await page.getByRole('button', { name: '生成' }).click();

      // ULID セルを含む行 = データ行（ヘッダー行を除外）
      const dataRows = page
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: /[0-9A-Z]{26}/ }) });
      await expect(dataRows).toHaveCount(3);

      for (const row of await dataRows.all()) {
        const cell = row.getByRole('cell', { name: /[0-9A-Z]{26}/ });
        const text = await cell.innerText();
        expect(text.trim()).toHaveLength(26);
      }
    });
  });

  test('再生成すると行が更新される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/ulid-generator', async (page) => {
      await page.getByLabel('生成数').click({ clickCount: 3 });
      await page.keyboard.type('1');
      await page.getByRole('button', { name: '生成' }).click();

      const first = await page
        .getByRole('cell', { name: /[0-9A-Z]{26}/ })
        .first()
        .innerText();
      await page.getByRole('button', { name: '生成' }).click();
      const second = await page
        .getByRole('cell', { name: /[0-9A-Z]{26}/ })
        .first()
        .innerText();

      // 単調増加するため second >= first
      expect(second >= first).toBe(true);
    });
  });

  test('タイムスタンプ列にISO形式の日時が表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/ulid-generator', async (page) => {
      await page.getByRole('button', { name: '生成' }).click();
      await expect(page.getByRole('cell', { name: /\d{4}-\d{2}-\d{2}T/ }).first()).toBeVisible();
    });
  });

  // 陰性確認: UlidGenerator は onRowClick を渡さないため <tr> に tabindex が付かないこと。
  // ResultTable の clickable 分岐 (`tabIndex={clickable ? 0 : undefined}`) が
  // 「未指定 consumer ではキーボード操作干渉ゼロ」を保つことを future-proof で守る (issue #264 受け入れ基準)。
  test('onRowClick 未指定 consumer では <tr> に tabindex が付かない（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/ulid-generator', async (page) => {
      await page.getByRole('button', { name: '生成' }).click();

      const dataRows = page
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: /[0-9A-Z]{26}/ }) });
      await expect(dataRows.first()).toBeVisible();

      // tabindex 属性が一切付かない (clickable=false 経路の保証)
      await expect(dataRows.first()).not.toHaveAttribute('tabindex', /.*/);
      // data-clickable も false (cursor: pointer も付かない)
      await expect(dataRows.first()).toHaveAttribute('data-clickable', 'false');
      // aria-current / aria-selected も無 (selection 概念がそもそも consumer に無い)
      await expect(dataRows.first()).not.toHaveAttribute('aria-current', /.*/);
      await expect(dataRows.first()).not.toHaveAttribute('aria-selected', /.*/);
    });
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
    //   blocked.invalid の外部スクリプトは確実に block され Chromium が
    //   "Refused to load the script ... because it violates the following
    //    Content Security Policy directive ..." を console error に出す。
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      const response = await page.goto('/tools/ulid-generator');
      // 前提検証: route 注入によって本番 CSP がレスポンスヘッダに乗っていること
      expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = 'https://blocked.invalid/violates-csp.js';
        document.head.appendChild(script);
      });
      await expect.poll(() => guard.violations.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});
