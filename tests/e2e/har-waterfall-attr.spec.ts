import { test, expect, type Page } from '@playwright/test';
import { applyProductionCsp, waitForReactHydration, withProductionCsp } from './helpers';

function har(suffix = '') {
  const entries = [
    {
      start: '2026-06-15T00:00:00.000Z',
      timings: suffix ? { send: 0.01, wait: 332.99 } : { send: 25, wait: 75 },
    },
    {
      start: '2026-06-15T00:00:00.050Z',
      timings: suffix ? { send: 10, wait: 40 } : { send: 40, wait: 60 },
    },
    suffix
      ? { start: '2026-06-15T00:00:00.332Z', timings: { wait: 1 } }
      : {
          start: '2026-06-15T00:00:00.000Z',
          timings: { blocked: 10, dns: 10, connect: 20, ssl: 10, send: 10, wait: 10, receive: 10 },
        },
  ].map(({ start, timings }, i) => ({
    startedDateTime: start,
    time: 100,
    timings,
    request: {
      method: 'GET',
      url: `https://example.com/${i}${suffix}`,
      headers: [{ name: 'Cookie', value: 'session=secret' }],
      queryString: [],
      cookies: [],
    },
    response: { status: 200, headers: [], cookies: [], content: { size: 0 } },
  }));
  return JSON.stringify({
    log: { version: '1.2', creator: { name: 'test', version: '1' }, entries },
  });
}

async function upload(page: Page, suffix = '') {
  await page.getByLabel('ファイルを選択').setInputFiles({
    name: 'test.har',
    mimeType: 'application/json',
    buffer: Buffer.from(har(suffix)),
  });
  await expect(page.getByRole('button', { name: `example.com/1${suffix}` })).toBeVisible();
}

async function geometry(page: Page, legacy: boolean, changed = false) {
  const expected = changed
    ? [
        [0, 0, 1, 0.01 / 333],
        [1, 50 / 333, 50 / 333, 0.2],
      ]
    : [
        [0, 0, 100 / 150, 0.25],
        [1, 50 / 150, 100 / 150, 0.4],
      ];
  for (const [i, left, width, first] of expected) {
    const bar = page.locator(`[data-har-bar="${i}"]`);
    await expect
      .poll(async () => {
        const value = await bar.evaluate((el) => {
          const track = el.parentElement!.getBoundingClientRect();
          const rect = el.getBoundingClientRect();
          const seg = el.querySelector('.har-seg')!.getBoundingClientRect();
          return {
            left: rect.left - track.left,
            width: rect.width,
            track: track.width,
            seg: seg.width,
          };
        });
        return (
          value.track > 0 &&
          Math.abs(value.left - value.track * left!) < 0.5 &&
          Math.abs(value.width - value.track * width!) < 0.5 &&
          Math.abs(value.seg - Math.max(1, value.width * first!)) < 0.5
        );
      })
      .toBe(true);
    const measured = await bar.evaluate((el) => {
      const track = el.parentElement!.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const seg = el.querySelector('.har-seg')!.getBoundingClientRect();
      const last = el.querySelector('.har-seg:last-child')!.getBoundingClientRect();
      return {
        left: rect.left - track.left,
        width: rect.width,
        track: track.width,
        seg: seg.width,
        last: last.width,
        overflow: getComputedStyle(el.parentElement!).overflow,
        flex: getComputedStyle(el).display,
        color: getComputedStyle(el.querySelector('.har-seg')!).backgroundColor,
        expectedColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--color-har-send')
          .trim(),
        computedLeft: getComputedStyle(el).left,
        computedWidth: getComputedStyle(el).width,
      };
    });
    expect(measured.left).toBeCloseTo(measured.track * left!, 0);
    expect(measured.width).toBeCloseTo(measured.track * width!, 0);
    expect(measured.seg).toBeCloseTo(Math.max(1, measured.width * first!), 0);
    expect(measured.last).toBeCloseTo(measured.width - measured.seg, 0);
    expect(measured.overflow).toBe('hidden');
    expect(measured.flex).toBe('flex');
    expect(parseFloat(measured.computedLeft)).toBeCloseTo(measured.left, 1);
    expect(parseFloat(measured.computedWidth)).toBeCloseTo(measured.width, 1);
    expect(measured.color).not.toBe('rgba(0, 0, 0, 0)');
    expect(measured.expectedColor).not.toBe('');
  }
  const rules = await page.evaluate(() =>
    document.adoptedStyleSheets
      .flatMap((sheet) => Array.from(sheet.cssRules, (r) => r.cssText))
      .filter((r) => r.includes('data-har-bar'))
  );
  expect(rules.length > 0).toBe(legacy);
}

async function flows(page: Page, legacy: boolean) {
  await upload(page);
  await geometry(page, legacy);
  const phases = [
    ['blocked', 'rgb(148, 148, 148)'],
    ['dns', 'rgb(146, 114, 0)'],
    ['connect', 'rgb(29, 139, 86)'],
    ['ssl', 'rgb(136, 67, 225)'],
    ['send', 'rgb(0, 0, 113)'],
    ['wait', 'rgb(0, 23, 193)'],
    ['receive', 'rgb(112, 150, 248)'],
  ];
  await page.getByRole('button', { name: 'example.com/2' }).click();
  for (const [phase, expected] of phases) {
    const list = page.locator(`[data-har-bar="2"] .har-phase-${phase}`);
    const mini = page.locator(`.har-mini-fill.har-phase-${phase}`);
    await expect(list).toHaveCSS('background-color', expected!);
    await expect(mini).toBeVisible();
    await expect(mini).toHaveCSS('background-color', expected!);
  }
  const second = page.getByRole('button', { name: 'example.com/1' });
  await second.click();
  await expect(second).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('https://example.com/1')).toBeVisible();
  for (const phase of ['send', 'wait']) {
    const colors = await page.evaluate((name) => {
      const list = document.querySelector(`[data-har-bar="1"] .har-phase-${name}`)!;
      const detail = document.querySelector(`.har-mini-fill.har-phase-${name}`)!;
      return [getComputedStyle(list).backgroundColor, getComputedStyle(detail).backgroundColor];
    }, phase);
    expect(colors[0]).toBe(colors[1]);
  }
  await geometry(page, legacy);
  await page.getByRole('button', { name: /Cookie/ }).click();
  await expect(page.getByText(/redact:\s*0\s*件/)).toBeVisible();
  await expect(second).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('https://example.com/1')).toBeVisible();
  await geometry(page, legacy);
  await upload(page, '-new');
  await expect(page.getByRole('button', { name: 'example.com/0-new' })).toHaveAttribute(
    'aria-current',
    'true'
  );
  await expect(page.getByRole('button', { name: 'example.com/1-new' })).not.toHaveAttribute(
    'aria-current'
  );
  await expect(page.getByText('https://example.com/0-new')).toBeVisible();
  await geometry(page, legacy, true);
  const tiny = page.locator('[data-har-bar="2"]');
  await tiny.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      tiny.evaluate((el) => {
        const track = el.parentElement!.getBoundingClientRect();
        const bar = el.getBoundingClientRect();
        return track.width / 333 < 1 && Math.abs(bar.width - 1) < 0.05 && bar.right > track.right;
      })
    )
    .toBe(true);
  const hit = await tiny.evaluate((el) => {
    const track = el.parentElement!;
    const rect = track.getBoundingClientRect();
    const x = rect.right + 0.1;
    const y = rect.top + rect.height / 2;
    const clipped = el.contains(document.elementFromPoint(x, y));
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('.har-track { overflow: visible !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    const unclipped = el.contains(document.elementFromPoint(x, y));
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
    return { clipped, unclipped };
  });
  expect(hit).toEqual({ clipped: false, unclipped: true });
}

test('本番 CSP: native typed attr の一覧ジオメトリ', async ({ browser }) => {
  await withProductionCsp(
    browser,
    '/tools/har-viewer',
    async (page) => {
      expect(
        await page.evaluate(
          () =>
            CSS.supports('left', 'attr(data-har-left type(<percentage>), 0%)') &&
            CSS.supports('width', 'attr(data-har-width type(<percentage>), 0%)')
        )
      ).toBe(true);
      await flows(page, false);
    },
    { contextOptions: { viewport: { width: 1280, height: 800 } } }
  );
});

test('画面幅の境界とスマホの選択・詳細ミニバー', async ({ browser }, testInfo) => {
  await withProductionCsp(
    browser,
    '/tools/har-viewer',
    async (page) => {
      await upload(page);
      await page.getByRole('button', { name: 'example.com/1' }).click();
      await expect(page.getByRole('button', { name: 'example.com/1' })).toHaveAttribute(
        'aria-current',
        'true'
      );
      const timing = page.locator('th', { hasText: 'タイミング' });
      await expect(timing).toBeVisible();
      await geometry(page, false);
      await page.screenshot({ path: testInfo.outputPath('har-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(timing).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath('har-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 767, height: 800 });
      await expect(timing).toBeHidden();
      await page.setViewportSize({ width: 768, height: 800 });
      await expect(timing).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      const mini = page.locator('.har-mini-fill').first();
      await page.getByRole('button', { name: 'example.com/0' }).click();
      await expect(page.getByRole('button', { name: 'example.com/0' })).toHaveAttribute(
        'aria-current',
        'true'
      );
      await expect
        .poll(() =>
          mini.evaluate(
            (el) =>
              el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width
          )
        )
        .toBeCloseTo(0.25, 1);
      await page.getByRole('button', { name: 'example.com/1' }).click();
      await expect(page.getByRole('button', { name: 'example.com/1' })).toHaveAttribute(
        'aria-current',
        'true'
      );
      await expect(mini).toBeVisible();
      const fraction = await mini.evaluate(
        (el) => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width
      );
      expect(fraction).toBeCloseTo(0.4, 1);
    },
    { contextOptions: { viewport: { width: 1280, height: 800 } } }
  );
});

test('本番 CSP: HAR の static attr を無効化した旧経路と負の対照', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const original = CSS.supports.bind(CSS);
      CSS.supports = ((...args: [string, string]) =>
        args[1]?.includes('data-har-') ? false : original(...args)) as typeof CSS.supports;
    });
    const guard = await applyProductionCsp(page);
    let count = 0;
    await page.route('**/*.css', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /attr\(data-har-(?:left|width)\s+type\(<percentage>\),\s*0%\)/g,
        (match) => {
          count++;
          return match.replace('<percentage>', '<unsupported-test-type>');
        }
      );
      await route.fulfill({ response, body });
    });
    await page.goto('/tools/har-viewer');
    await waitForReactHydration(page);
    expect(count).toBeGreaterThanOrEqual(5);
    await flows(page, true);
    const left = await page.locator('[data-har-bar="1"]').evaluate((el) => {
      const sheets = document.adoptedStyleSheets;
      document.adoptedStyleSheets = sheets.filter(
        (sheet) => !Array.from(sheet.cssRules).some((rule) => rule.cssText.includes('data-har-bar'))
      );
      const value = getComputedStyle(el).left;
      document.adoptedStyleSheets = sheets;
      return value;
    });
    expect(parseFloat(left)).toBe(0);
    guard.assertNoViolations();
  } finally {
    await context.close();
  }
});
