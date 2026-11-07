import { expect, type Browser, type Page } from '@playwright/test';
import { applyProductionCsp } from '../e2e/helpers';

/** 実 Base64 module と同じ React chunk の公開 API で commit を保留する診断専用ラッパー。 */
export async function withHeldReact(browser: Browser, check: (page: Page) => Promise<void>) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const guard = await applyProductionCsp(page);
    await page.addInitScript(() => {
      const state = {
        hydrateEvents: 0,
        attempted: false,
        release: undefined as undefined | (() => void),
      };
      Object.assign(window, { __diagnosticReact: state });
      document.addEventListener(
        'astro:hydrate',
        (event) => {
          const target = event.target as Element;
          if (target.getAttribute('component-export') === 'Base64CodecTool') state.hydrateEvents++;
        },
        true
      );
    });

    let wrappers = 0;
    let originals = 0;
    await page.route('**/_astro/Base64Codec.*.js*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has('diagnostic-original')) {
        originals++;
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      const source = await response.text();
      const reactPath = source.match(
        /import\{t as [^}]+\}from["'](\.\/react\.[^"']+\.js)["']/
      )?.[1];
      if (!reactPath || !/as Base64CodecTool/.test(source))
        throw new Error('React chunk または component export を確認できません');
      wrappers++;
      url.searchParams.set('diagnostic-original', '1');
      const body = `import { t as reactFactory } from ${JSON.stringify(reactPath)};
import { Base64CodecTool as Original } from ${JSON.stringify(url.pathname + url.search)};
const React = reactFactory();
const state = globalThis.__diagnosticReact;
const gate = new Promise(resolve => { state.release = resolve; });
export function Base64CodecTool(props) {
  state.attempted = true;
  React.use(gate);
  React.useEffect(() => { document.querySelector('astro-island[component-export="Base64CodecTool"]').setAttribute('data-diagnostic-effect', 'done'); }, []);
  return React.createElement(Original, props);
}`;
      await route.fulfill({ status: 200, contentType: 'text/javascript', body });
    });
    expect((await page.goto('/tools/base64'))?.status()).toBe(200);
    await page.waitForFunction(() => {
      const state = (
        window as unknown as { __diagnosticReact: { attempted: boolean; hydrateEvents: number } }
      ).__diagnosticReact;
      return state.attempted && state.hydrateEvents > 0;
    });
    expect(wrappers).toBe(1);
    expect(originals).toBe(1);
    await check(page);
    guard.assertNoViolations();
  } finally {
    await context.close();
  }
}

export async function releaseHeldReact(page: Page) {
  await page.evaluate(() => {
    const state = (window as unknown as { __diagnosticReact: { release: () => void } })
      .__diagnosticReact;
    state.release();
  });
}
