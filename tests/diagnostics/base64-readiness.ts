import { expect, type Page } from '@playwright/test';

/** Base64 のトグルが実際に応答するまで再試行し、初期状態に戻す診断。 */
export async function waitForBase64Interaction(page: Page): Promise<void> {
  const urlSafe = page.getByRole('button', { name: 'URL-safe', exact: true });
  await expect(async () => {
    await urlSafe.click();
    expect(await urlSafe.getAttribute('aria-pressed')).toBe('true');
  }).toPass({ timeout: 10_000 });
  const standard = page.getByRole('button', { name: '標準', exact: true });
  await standard.click();
  await expect(standard).toHaveAttribute('aria-pressed', 'true');
}
