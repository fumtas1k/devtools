import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

/**
 * issue #163 で追加した live region / aria-expanded / アイコン分離 のスモーク E2E。
 * SR が結果領域を読めることを `getByRole('status')` 経由で検証する。
 */

test.describe('a11y live region (issue #163, production CSP 適用)', () => {
  test('JANコード: チェック結果が role="status" として読める（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      // 入力前は status が存在しない
      await expect(page.getByRole('status')).toHaveCount(0);

      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      const status = page.getByRole('status').first();
      await expect(status).toBeVisible();
      await expect(status).toContainText('チェックディジット');
      await expect(status).toContainText('完成コード');
    });
  });

  test('UUID v7: 生成結果が role="status" として読める（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/uuid-v7', async (page) => {
      await page.getByRole('button', { name: '生成' }).click();

      const status = page.getByRole('status').first();
      await expect(status).toBeVisible();
      await expect(status).toContainText('件生成');
    });
  });

  test('JWTデコーダ: デコード結果が role="status" として読める（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      const SAMPLE_JWT =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      await page.getByLabel('JWTトークンを貼り付け').fill(SAMPLE_JWT);

      await expect(page.getByRole('heading', { name: 'Header (JOSE)' })).toBeVisible();

      const statusRegions = page.getByRole('status');
      await expect(statusRegions.first()).toBeVisible();
    });
  });

  test('Base64: 変換結果が role="status" で包まれ常時 aria-live="polite" で SR 通知可能（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      // OutputField は常時 role="status" aria-live="polite" を持つ
      const statusEl = page.getByRole('status').first();
      await expect(statusEl).toBeVisible();
      await expect(statusEl).toHaveAttribute('aria-live', 'polite');

      // 入力後: status 領域内の textarea に変換結果が反映される
      await page.getByLabel('入力').fill('Hello');
      await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8=');
      await expect(statusEl.locator('textarea')).toHaveValue('SGVsbG8=');
    });
  });

  test('ダミーテキスト: 生成完了が role="status" aria-live="polite" で SR 通知可能（CSP 違反なし、issue #388）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/dummy-text', async (page) => {
      // ページ読込時に auto-generate されるため status は即時存在する
      const status = page.getByRole('status').first();
      await expect(status).toHaveAttribute('aria-live', 'polite');
      await expect(status).toContainText('ダミーテキストを生成しました');

      // 文字種を変えると result が再生成され、status の文言も更新される
      await page.getByRole('button', { name: 'ひらがな' }).click();
      await expect(status).toContainText('ダミーテキストを生成しました');
    });
  });

  test('JSON→CSV: 変換結果が role="status" で包まれ常時 aria-live="polite" で SR 通知可能（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-csv', async (page) => {
      // OutputField は常時 role="status" aria-live="polite" を持つ
      const statusEl = page.getByRole('status').first();
      await expect(statusEl).toBeVisible();
      await expect(statusEl).toHaveAttribute('aria-live', 'polite');

      // JSON 入力後: status 領域内の textarea に CSV 結果が反映される
      await page.getByLabel('入力').fill('[{"id":1,"name":"太郎"}]');
      await expect(page.getByLabel('変換結果')).toHaveValue(/id,name/);
      await expect(statusEl.locator('textarea')).toHaveValue(/id,name/);
    });
  });
});

test.describe('a11y aria-expanded (issue #163, production CSP 適用)', () => {
  test('ConfigConverter: JSON Schema 折りたたみが aria-expanded を反映する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/config-converter', async (page) => {
      const toggle = page.getByRole('button', { name: 'JSON Schema で検証する' });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
  });
});

test.describe('a11y CopyButton compact tap target (issue #163, production CSP 適用)', () => {
  test('UUID 一覧の compact コピーボタンは 32x32 以上の領域を持つ（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/uuid-v7', async (page) => {
      await page.getByRole('button', { name: '生成' }).click();

      const compactCopy = page.getByRole('button', { name: 'コピー' }).nth(1);
      await compactCopy.waitFor({ state: 'visible' });

      const box = await compactCopy.boundingBox();
      expect(box, 'compact ボタンの bounding box が取得できる').not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(32);
      expect(box!.height).toBeGreaterThanOrEqual(32);
    });
  });
});
