import { test, expect } from '@playwright/test';
import { KEY, startCompanion } from '../helpers/brainstorm-companion';

test('complete URL bootstraps the browser and saves a normal choice', async ({ page, context }) => {
  const server = await startCompanion();
  try {
    const external: string[] = [];
    await page.route('**/*', (route) => {
      if (
        !route
          .request()
          .url()
          .startsWith(server.base + '/')
      ) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    const asset = page.waitForResponse(
      (response) => response.url() === `${server.base}/files/asset.txt`
    );
    await page.goto(`${server.base}/?key=${KEY}`);
    await expect(page.getByRole('heading', { name: 'Test screen' })).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
    expect(await page.evaluate(() => sessionStorage.getItem('brainstorm-session-key'))).toBe(KEY);
    const cookies = await context.cookies(server.base);
    expect(cookies.some((cookie) => cookie.httpOnly && cookie.sameSite === 'Strict')).toBe(true);
    expect((await asset).status()).toBe(200);
    await page.getByRole('button', { name: 'Choose' }).click();
    await expect.poll(() => server.events()).toContain('"choice":"yes"');
    expect(external).toEqual([]);
  } finally {
    await server.stop();
  }
});

test('a different browser origin cannot inject a choice', async ({ page }) => {
  const server = await startCompanion();
  try {
    await page.route('http://attacker.invalid/', (route) =>
      route.fulfill({ status: 200, body: '<title>attacker</title>' })
    );
    await page.goto('http://attacker.invalid/');
    const result = await page.evaluate(
      ({ port, key }) =>
        new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('No WebSocket response')), 3000);
          const socket = new WebSocket(`ws://127.0.0.1:${port}/?key=${key}`);
          socket.onopen = () => {
            socket.send(JSON.stringify({ choice: 'attack' }));
            clearTimeout(timer);
            resolve('opened');
            socket.close();
          };
          socket.onerror = () => {
            clearTimeout(timer);
            resolve('rejected');
          };
        }),
      { port: server.port, key: KEY }
    );
    expect(result).toBe('rejected');
    expect(server.events()).toBe('');
  } finally {
    await server.stop();
  }
});
