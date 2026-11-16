import { expect, type Page } from '@playwright/test';

/** 初期状態の Base64 ページで、公開操作への応答を確認して形式を戻す。 */
export async function waitForBase64Interaction(page: Page): Promise<void> {
  const urlSafe = page.getByRole('button', { name: 'URL-safe', exact: true });
  // 現行 hydration helper と同じ 10 秒の上限。SSR 上の可視性だけでは判定しない。
  await expect(async () => {
    await urlSafe.click();
    expect(await urlSafe.getAttribute('aria-pressed')).toBe('true');
  }).toPass({ timeout: 10_000 });
  const standard = page.getByRole('button', { name: '標準', exact: true });
  await standard.click();
  await expect(standard).toHaveAttribute('aria-pressed', 'true');
}
