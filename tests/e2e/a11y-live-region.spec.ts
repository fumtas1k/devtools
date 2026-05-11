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

  test('Base64: 変換結果が role="status" で包まれ aria-live が off→polite に切り替わる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/base64', async (page) => {
      // 入力前: OutputField の status 領域は aria-live="off"（初期描画の過剰通知を防ぐ）
      const statusEl = page.getByRole('status').first();
      await expect(statusEl).toHaveAttribute('aria-live', 'off');

      // 入力後: aria-live="polite" に切り替わりスクリーンリーダーが通知可能になる
      await page.getByLabel('入力').fill('Hello');
      await expect(statusEl).toHaveAttribute('aria-live', 'polite');
    });
  });

  test('JSON→CSV: 変換結果が role="status" で包まれ aria-live が off→polite に切り替わる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-csv', async (page) => {
      // 入力前: OutputField の status 領域は aria-live="off"
      const statusEl = page.getByRole('status').first();
      await expect(statusEl).toHaveAttribute('aria-live', 'off');

      // JSON 入力後: aria-live="polite" に切り替わる
      await page.getByLabel('入力').fill('[{"id":1,"name":"太郎"}]');
      await expect(statusEl).toHaveAttribute('aria-live', 'polite');
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
