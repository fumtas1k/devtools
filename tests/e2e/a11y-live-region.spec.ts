import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

/**
 * issue #163 で追加した live region / aria-expanded / アイコン分離 のスモーク E2E。
 * SR が結果領域を読めることを `getByRole('status')` 経由で検証する。
 */

test.describe('a11y live region (issue #163)', () => {
  test('JANコード: チェック結果が role="status" として読める', async ({ page }) => {
    await page.goto('/tools/jan-code', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'サンプルを入力' }).waitFor();
    await waitForReactHydration(page);

    // 入力前は status が存在しない
    await expect(page.getByRole('status')).toHaveCount(0);

    await page.getByRole('button', { name: 'サンプルを入力' }).click();

    const status = page.getByRole('status').first();
    await expect(status).toBeVisible();
    await expect(status).toContainText('チェックディジット');
    await expect(status).toContainText('完成コード');
  });

  test('UUID v7: 生成結果が role="status" として読める', async ({ page }) => {
    await page.goto('/tools/uuid-v7', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '生成' }).waitFor();
    await waitForReactHydration(page);

    await page.getByRole('button', { name: '生成' }).click();

    const status = page.getByRole('status').first();
    await expect(status).toBeVisible();
    await expect(status).toContainText('件生成');
  });

  test('JWTデコーダ: デコード結果が role="status" として読める', async ({ page }) => {
    await page.goto('/tools/jwt-decoder', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('JWTトークンを貼り付け').waitFor();
    await waitForReactHydration(page);

    const SAMPLE_JWT =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    await page.getByLabel('JWTトークンを貼り付け').fill(SAMPLE_JWT);

    await expect(page.getByRole('heading', { name: 'Header (JOSE)' })).toBeVisible();

    const statusRegions = page.getByRole('status');
    await expect(statusRegions.first()).toBeVisible();
  });
});

test.describe('a11y aria-expanded (issue #163)', () => {
  test('ConfigConverter: JSON Schema 折りたたみが aria-expanded を反映する', async ({ page }) => {
    await page.goto('/tools/config-converter', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'JSON Schema で検証する' }).waitFor();
    await waitForReactHydration(page);

    const toggle = page.getByRole('button', { name: 'JSON Schema で検証する' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('a11y CopyButton compact tap target (issue #163)', () => {
  test('UUID 一覧の compact コピーボタンは 32x32 以上の領域を持つ', async ({ page }) => {
    await page.goto('/tools/uuid-v7', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '生成' }).waitFor();
    await waitForReactHydration(page);

    await page.getByRole('button', { name: '生成' }).click();

    const compactCopy = page.getByRole('button', { name: 'コピー' }).nth(1);
    await compactCopy.waitFor({ state: 'visible' });

    const box = await compactCopy.boundingBox();
    expect(box, 'compact ボタンの bounding box が取得できる').not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(32);
    expect(box!.height).toBeGreaterThanOrEqual(32);
  });
});
