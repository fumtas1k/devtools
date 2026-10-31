import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// DADS の通知・状態表示（docs/decisions.md [141]）。値は Claude Design の DS（components.css）に合わせる
test.describe('DADS の通知・状態表示（production CSP 適用）', () => {
  test('通知バナー・ステータスバッジ・チップラベルが DADS の寸法になる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(a+)+$');
      const region = page.getByRole('region', { name: 'ReDoS 判定' });

      // NotificationBanner: 見出し 18px Bold・アイコン 28px・本文 16px
      const banner = region.getByRole('note');
      await expect(banner).toBeVisible();
      await expect(banner).toHaveCSS('border-top-width', '2px');
      await expect(banner).toHaveCSS('border-radius', '12px');
      const title = banner.getByText('脆弱：ReDoS のリスクがあります');
      await expect(title).toHaveCSS('font-size', '18px');
      await expect(title).toHaveCSS('font-weight', '700');
      await expect(banner.locator('svg').first()).toHaveAttribute('width', '28');
      const body = banner.getByText(/入力長に対してマッチ時間が/);
      await expect(body).toHaveCSS('font-size', '16px');
      // 枠・色帯は種類色（currentColor = error-1）、見出しと本文は本文色（solid-gray-800）
      await expect(banner).toHaveCSS('border-top-color', 'rgb(236, 0, 0)');
      await expect(title).toHaveCSS('color', 'rgb(51, 51, 51)');
      await expect(body).toHaveCSS('color', 'rgb(51, 51, 51)');

      // StatusBadge: 16px / 400、padding 8px（decorative のため aria-hidden。getByText は a11y ツリーに依存しない）
      const badge = region.getByText('脆弱', { exact: true });
      await expect(badge).toHaveCSS('font-size', '16px');
      await expect(badge).toHaveCSS('font-weight', '400');
      await expect(badge).toHaveCSS('padding', '8px');

      // ChipLabel: 16px / 400、最小高 32px、枠は文字色と同じ
      const chip = page.getByText('⚠ ReDoS 危険箇所');
      await expect(chip).toHaveCSS('font-size', '16px');
      await expect(chip).toHaveCSS('font-weight', '400');
      await expect(chip).toHaveCSS('min-height', '32px');
      const chipColor = await chip.evaluate((el) => getComputedStyle(el).color);
      await expect(chip).toHaveCSS('border-top-color', chipColor);
    });
  });
});

// #808: UUID v7 / JWT の直書き色を DADS の色相へ（白地・gray-50・選択行で 4.5:1 以上）
test.describe('UUID v7 / JWT のデータ色（production CSP 適用）', () => {
  test('UUID v7 のフィールド色が DADS の色になり、ビット表示に opacity を使わない', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/uuid-v7', async (page) => {
      await page.getByRole('button', { name: '生成' }).click();
      await page.locator('table tbody tr').first().click();
      await expect(page.getByText('フィールド分解', { exact: true })).toBeVisible();

      const expected: Record<string, string> = {
        'uuid-field-ts': 'rgb(0, 23, 193)', // blue-900
        'uuid-field-ver': 'rgb(170, 0, 170)', // magenta-800
        'uuid-field-rand-a': 'rgb(12, 71, 42)', // green-1000
        'uuid-field-var': 'rgb(172, 62, 0)', // orange-900
        'uuid-field-rand-b': 'rgb(0, 76, 89)', // cyan-1100
      };
      for (const [cls, color] of Object.entries(expected)) {
        await expect(page.locator(`code.${cls}`)).toHaveCSS('color', color);
      }

      const bits = page.getByText('(48bit)', { exact: true });
      await expect(bits).toHaveCSS('opacity', '1');
      await expect(bits).toHaveCSS('color', 'rgb(77, 77, 77)'); // --color-muted（gray-50 上 7.55:1）
    });
  });

  test('JWT の payload 枠と値の色が DADS の色になる', async ({ browser }) => {
    const SAMPLE_JWT =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.getByLabel('JWTトークンを貼り付け').fill(SAMPLE_JWT);
      const payload = page.getByTestId('jwt-payload');
      await expect(payload).toHaveCSS('border-left-color', 'rgb(111, 35, 208)'); // purple-700
      await expect(payload.getByText('"John Doe"')).toHaveCSS('color', 'rgb(110, 86, 0)'); // yellow-1100
    });
  });
});
