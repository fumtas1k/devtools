import { test, expect, type Page } from '@playwright/test';
import { applyProductionCsp, waitForReactHydration, withProductionCsp } from './helpers';

async function checkBar(page: Page, legacy: boolean) {
  const input = page.getByLabel('入力テキスト');
  const limit = page.getByRole('spinbutton', { name: '任意上限' });
  const bar = page
    .locator('article')
    .filter({ has: page.getByText('任意上限') })
    .getByRole('progressbar');
  await limit.fill('10');
  await input.fill('12345');
  await expect(bar).toHaveAttribute('aria-valuenow', '5');
  const fill = bar.locator('.progress-fill');
  await expect(fill).toHaveAttribute('data-progress-width', '50%');
  await expect
    .poll(async () =>
      fill.evaluate((el) => {
        const track = el.parentElement!;
        return Math.round(
          (el.getBoundingClientRect().width / track.getBoundingClientRect().width) * 100
        );
      })
    )
    .toBe(50);
  await input.fill('123456789012345');
  await expect(bar.locator('.progress-overflow')).toHaveAttribute('data-progress-width', '50%');
  await expect
    .poll(async () =>
      bar.locator('.progress-overflow').evaluate((el) => {
        const track = el.parentElement!;
        return Math.round(
          (el.getBoundingClientRect().width / track.getBoundingClientRect().width) * 100
        );
      })
    )
    .toBe(33);
  await expect(page.getByRole('progressbar').first().locator('.progress-fill')).not.toHaveAttribute(
    'data-progress-width',
    '100%'
  );
  const rules = await page.evaluate(() =>
    document.adoptedStyleSheets
      .flatMap((sheet) => Array.from(sheet.cssRules, (rule) => rule.cssText))
      .filter((rule) => rule.includes('progress-fill-width'))
  );
  expect(rules.length > 0).toBe(legacy);
  await input.fill('1');
  await expect(bar.locator('.progress-overflow')).toHaveCount(0);
  await page.getByRole('button', { name: 'クリア' }).click();
  await expect(fill).toHaveAttribute('data-progress-width', '0%');
}

test('本番 CSP: typed attr() と独立したバーの幅', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/char-count', async (page) => {
    expect(
      await page.evaluate(() =>
        CSS.supports('width', 'attr(data-progress-width type(<percentage>), 0%)')
      )
    ).toBe(true);
    await checkBar(page, false);
  });
});

test('本番 CSP: 静的 attr() を無効化した旧経路でも幅が更新される', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = ((...args: [string, string]) =>
        args[0] === 'width' && args[1].includes('data-progress-width')
          ? false
          : supports(...args)) as typeof CSS.supports;
    });
    const guard = await applyProductionCsp(page);
    let transformed = false;
    await page.route('**/*.css', async (route) => {
      const response = await route.fetch();
      const css = await response.text();
      if (css.includes('type(<percentage>)')) transformed = true;
      await route.fulfill({
        response,
        body: css.replaceAll('type(<percentage>)', 'type(<unsupported-test-type>)'),
      });
    });
    await page.goto('/tools/char-count');
    await waitForReactHydration(page);
    expect(transformed).toBe(true);
    await checkBar(page, true);
    const unstyledVariable = await page
      .locator('.progress-fill')
      .first()
      .evaluate((el) => {
        const sheets = document.adoptedStyleSheets;
        document.adoptedStyleSheets = [];
        const value = getComputedStyle(el).getPropertyValue('--progress-fill-width');
        document.adoptedStyleSheets = sheets;
        return value;
      });
    expect(unstyledVariable).toBe('');
    guard.assertNoViolations();
  } finally {
    await context.close();
  }
});

test('本番 CSP: TOTP のカウントと周期・モード切替', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
    await page.getByLabel('Base32 シークレット').fill('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    const bar = page.getByRole('progressbar');
    await expect(bar).toBeVisible();
    const fill = bar.locator('.progress-fill');
    const initial = await fill.getAttribute('data-progress-width');
    await expect
      .poll(() => fill.getAttribute('data-progress-width'), { timeout: 4000 })
      .not.toBe(initial);
    await page.getByRole('button', { name: '60秒' }).click();
    await expect(bar).toHaveAttribute('aria-valuemax', '60');
    await page.getByRole('button', { name: 'HOTP' }).click();
    await expect(bar).toHaveCount(0);
    await page.getByRole('button', { name: 'TOTP' }).click();
    await expect(bar).toBeVisible();
  });
});
