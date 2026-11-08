import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KEY, startCompanion, upgrade } from '../helpers/brainstorm-companion';

let server: Awaited<ReturnType<typeof startCompanion>> | undefined;
beforeEach(async () => {
  server = await startCompanion();
});
afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe('companion authentication', () => {
  it.each(
    ['/', '/files/asset.txt', '/missing'].flatMap((route) =>
      ['', '?key=wrong', '?key='].map((query) => [route, query])
    )
  )('rejects HTTP %s with query %s before serving content', async (route, query) => {
    const response = await fetch(server!.base + route + query);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('synthetic asset');
  });

  it.each([
    'missing key',
    'wrong key',
    'wrong origin with key',
    'wrong origin with cookie',
    'wrong key with cookie',
  ])('rejects WebSocket %s and leaves events unchanged', async (scenario) => {
    const cookie = `brainstorm-key-${server!.port}=${KEY}`;
    const cases: Record<string, [string, Record<string, string>]> = {
      'missing key': ['/', {}],
      'wrong key': ['/?key=wrong', {}],
      'wrong origin with key': [`/?key=${KEY}`, { Origin: 'http://attacker.invalid' }],
      'wrong origin with cookie': ['/', { Origin: 'http://attacker.invalid', Cookie: cookie }],
      'wrong key with cookie': ['/?key=wrong', { Cookie: cookie }],
    };
    const [target, headers] = cases[scenario];
    expect((await upgrade(server!.port, target, headers)).accepted).toBe(false);
    expect(server!.events()).toBe('');
  });

  it('bootstraps a cookie and authorizes content, assets and matching-origin choices', async () => {
    const bootstrap = await fetch(`${server!.base}/?key=${KEY}`);
    expect(bootstrap.status).toBe(200);
    const setCookie = bootstrap.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(await bootstrap.text()).toContain('sessionStorage.setItem');
    const cookie = setCookie.split(';')[0];
    const screen = await fetch(server!.base, { headers: { Cookie: cookie } });
    expect(await screen.text()).toContain('Test screen');
    const asset = await fetch(`${server!.base}/files/asset.txt`, { headers: { Cookie: cookie } });
    expect(await asset.text()).toBe('synthetic asset');
    expect(
      (await fetch(`${server!.base}/?key=wrong`, { headers: { Cookie: cookie } })).status
    ).toBe(403);
    expect(
      (await upgrade(server!.port, '/', { Cookie: cookie, Origin: server!.base })).accepted
    ).toBe(true);
    await expect.poll(() => server!.events()).toContain('injected');
  });
});
