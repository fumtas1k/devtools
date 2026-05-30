import { test, expect } from '@playwright/test';

/**
 * カスタム 404 ページ (#411) の E2E ガード。
 *
 * 存在しない URL アクセス時に Cloudflare Pages の default 404 ではなく
 * src/pages/404.astro が返ることを検証する。production の Cloudflare Pages 挙動は
 * ここでは再現できないが、preview server (astro が dist/404.html を未マッチ経路へ返す)
 * 経由で「404 ステータス + カスタム 404 ページの内容」が成立することを保証する。
 */
test.describe('カスタム 404 ページ', () => {
  test('存在しない URL で 404 ステータスとカスタム 404 ページを返す', async ({ page }) => {
    const response = await page.goto('/this-path-does-not-exist-xyz');
    expect(response?.status()).toBe(404);

    await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
    await expect(page.getByRole('link', { name: /ホームに戻る/ })).toBeVisible();

    // 主要ツールへの shortcut が「よく使われるツール」セクション内に描画されている。
    // region でスコープを絞り、将来 "Base64" を含む別ツールが他箇所に増えても誤検出しない。
    const featuredRegion = page.getByRole('region', { name: 'よく使われるツール' });
    await expect(featuredRegion).toBeVisible();
    await expect(featuredRegion.getByRole('link', { name: /Base64/ })).toBeVisible();
  });
});
