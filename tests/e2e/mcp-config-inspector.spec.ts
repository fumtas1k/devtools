import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test('空欄に架空のサンプルを入力して確認できる', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/mcp-config-inspector', async (page) => {
    const input = page.getByLabel('MCP設定 JSON');
    await expect(input).toHaveValue('');
    const sampleButton = page.getByRole('button', { name: 'サンプルを入力' });
    await expect(sampleButton).toBeVisible({ timeout: 3000 });
    await sampleButton.click();
    const sample = JSON.parse(await input.inputValue());
    expect(Object.keys(sample.mcpServers).length).toBeGreaterThan(0);
    await page.getByRole('button', { name: '確認する' }).click();
    await expect(page.getByLabel('確認結果')).toBeVisible();
  });
});

test('入力済みの置換は確認し、キャンセル時は入力と結果を保持する', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/mcp-config-inspector', async (page) => {
    const input = page.getByLabel('MCP設定 JSON');
    const original = '{"mcpServers":{"keep":{"command":"node"}}}';
    await input.fill(original);
    await page.getByRole('button', { name: '確認する' }).click();
    const result = page.getByLabel('確認結果');
    await expect(result).toContainText('keep');
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('置き換え');
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(input).toHaveValue(original);
    await expect(result).toContainText('keep');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(input).toHaveValue(/example-local/);
    await expect(result).toHaveCount(0);
    await page.getByRole('button', { name: '確認する' }).click();
    await expect(result).toContainText('example-local');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(result).toContainText('example-local');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(input).toHaveValue(/example-local/);
    await expect(result).toHaveCount(0);
  });
});

test('サンプルへの置換で古いエラーを消す', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/mcp-config-inspector', async (page) => {
    const input = page.getByLabel('MCP設定 JSON');
    await input.fill('{bad');
    await page.getByRole('button', { name: '確認する' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(input).toHaveValue('{bad');
    await expect(page.getByRole('alert')).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(input).toHaveAttribute('aria-invalid', 'false');
    await page.getByRole('button', { name: '確認する' }).click();
    await expect(page.getByLabel('確認結果')).toBeVisible();
  });
});

for (const finish of ['resolve', 'reject'] as const) {
  test(`読込中にサンプルを選ぶと古い読込の${finish}は反映されない`, async ({ browser }) => {
    await withProductionCsp(browser, '/tools/mcp-config-inspector', async (page) => {
      await page.evaluate(() => {
        Object.defineProperty(File.prototype, 'arrayBuffer', {
          configurable: true,
          value() {
            return new Promise((resolve, reject) => {
              Reflect.set(window, '__resolveMcpRead', resolve);
              Reflect.set(window, '__rejectMcpRead', reject);
            });
          },
        });
      });
      const input = page.getByLabel('MCP設定 JSON');
      await page.getByLabel('JSONファイルを選択').setInputFiles({
        name: 'slow.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{}'),
      });
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      const sample = await input.inputValue();
      await page.evaluate(async (outcome) => {
        if (outcome === 'resolve')
          Reflect.get(
            window,
            '__resolveMcpRead'
          )(new TextEncoder().encode('{"mcpServers":{"stale":{"command":"node"}}}').buffer);
        else Reflect.get(window, '__rejectMcpRead')(new Error('read failed'));
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      }, finish);
      await expect(input).toHaveValue(sample);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.getByRole('button', { name: '確認する' }).click();
      await expect(page.getByLabel('確認結果')).toContainText('example-local');
    });
  });
}

test('読込中に再入力してサンプルをキャンセルすると再入力を保持する', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/mcp-config-inspector', async (page) => {
    await page.evaluate(() => {
      Object.defineProperty(File.prototype, 'arrayBuffer', {
        configurable: true,
        value() {
          return new Promise((resolve) => Reflect.set(window, '__resolveMcpRead', resolve));
        },
      });
    });
    await page.getByLabel('JSONファイルを選択').setInputFiles({
      name: 'slow.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{}'),
    });
    const input = page.getByLabel('MCP設定 JSON');
    const typed = '{"mcpServers":{"typed":{"command":"node"}}}';
    await input.fill(typed);
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await page.evaluate(async () => {
      Reflect.get(
        window,
        '__resolveMcpRead'
      )(new TextEncoder().encode('{"mcpServers":{"stale":{"command":"node"}}}').buffer);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
    });
    await expect(input).toHaveValue(typed);
    await page.getByRole('button', { name: '確認する' }).click();
    await expect(page.getByLabel('確認結果')).toContainText('typed');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test('設定の表示とマスク、通信しない操作、クリア', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/mcp-config-inspector', async (page) => {
    const value = JSON.stringify({
      mcpServers: {
        demo: {
          command: 'node',
          args: ['--token', 'DUMMY_NOT_SECRET'],
          env: { TOKEN: 'DUMMY_NOT_SECRET' },
        },
      },
    });
    await page.getByLabel('MCP設定 JSON').fill(value);
    await page.getByRole('button', { name: '確認する' }).click();
    const result = page.getByLabel('確認結果');
    await expect(result.getByText('node', { exact: true })).toBeVisible();
    await expect(result).not.toContainText('DUMMY_NOT_SECRET');
    await expect(result.getByText('TOKEN', { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(page.getByLabel('MCP設定 JSON')).toHaveValue('');
    await expect(result).toHaveCount(0);
  });
});

test('未対応形式はエラーで結果を残さない', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/mcp-config-inspector', async (page) => {
    await page.getByLabel('MCP設定 JSON').fill('{"servers":{}}');
    await page.getByRole('button', { name: '確認する' }).click();
    await expect(page.getByRole('alert')).toContainText('対応していない形式');
    await expect(page.getByLabel('確認結果')).toHaveCount(0);
  });
});

async function monitoredPage(
  browser: import('@playwright/test').Browser,
  run: (page: import('@playwright/test').Page) => Promise<void>
) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const calls: string[] = [];
      Object.defineProperty(window, '__mcpCalls', { value: calls });
      Object.defineProperty(window, '__mcpArm', { value: { enabled: false } });
      const wrap = (owner: object, key: string) => {
        const original = Reflect.get(owner, key);
        Object.defineProperty(owner, key, {
          configurable: true,
          writable: true,
          value: new Proxy(original, {
            apply(target, receiver, args) {
              if (Reflect.get(window, '__mcpArm').enabled) calls.push(key);
              return Reflect.apply(target, receiver, args);
            },
            construct(target, args, newTarget) {
              if (Reflect.get(window, '__mcpArm').enabled) calls.push(key);
              return Reflect.construct(target, args, newTarget);
            },
          }),
        });
      };
      wrap(window, 'fetch');
      wrap(window, 'WebSocket');
      wrap(window, 'EventSource');
      wrap(XMLHttpRequest.prototype, 'open');
      wrap(navigator, 'sendBeacon');
      wrap(Storage.prototype, 'setItem');
      wrap(Storage.prototype, 'removeItem');
      wrap(Storage.prototype, 'clear');
      wrap(IDBFactory.prototype, 'open');
      wrap(IDBFactory.prototype, 'deleteDatabase');
      wrap(IDBObjectStore.prototype, 'put');
      wrap(IDBObjectStore.prototype, 'add');
      wrap(IDBObjectStore.prototype, 'delete');
      wrap(IDBObjectStore.prototype, 'clear');
    });
    const { applyProductionCsp, waitForReactHydration } = await import('./helpers');
    const guard = await applyProductionCsp(page);
    await page.goto('/tools/mcp-config-inspector');
    await waitForReactHydration(page);
    await run(page);
    guard.assertNoViolations();
  } finally {
    await context.close();
  }
}

test('通信監視の陽性対照', async ({ browser }) => {
  await monitoredPage(browser, async (page) => {
    const requests: string[] = [];
    await page.route('**/mcp-network-probe', (route) => route.fulfill({ status: 200, body: 'ok' }));
    page.on('request', (request) => requests.push(request.url()));
    await page.evaluate(() => {
      Reflect.get(window, '__mcpArm').enabled = true;
    });
    await page.evaluate(() => fetch('/mcp-network-probe'));
    expect(requests.some((url) => url.endsWith('/mcp-network-probe'))).toBe(true);
    expect(await page.evaluate(() => Reflect.get(window, '__mcpCalls'))).toEqual(['fetch']);
  });
});

test('ファイル・HTML風の値・保存と通信の試行', async ({ browser }) => {
  await monitoredPage(browser, async (page) => {
    const value = JSON.stringify({
      mcpServers: { demo: { command: 'node', args: ['<img src=x onerror=alert(1)>'] } },
    });
    await page.getByLabel('MCP設定 JSON').fill(value);
    await page.getByRole('button', { name: '確認する' }).click();
    await expect(page.getByLabel('確認結果')).toContainText('<img src=x onerror=alert(1)>');
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.getByRole('button', { name: 'クリア' }).click();
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.evaluate(() => {
      Reflect.get(window, '__mcpArm').enabled = true;
    });
    await page.getByLabel('MCP設定 JSON').fill(value);
    await page.getByRole('button', { name: '確認する' }).click();
    await expect(page.getByLabel('確認結果')).toContainText('<img src=x onerror=alert(1)>');
    await page.getByRole('button', { name: 'クリア' }).click();
    await page.getByLabel('JSONファイルを選択').setInputFiles({
      name: 'config.json',
      mimeType: 'application/json',
      buffer: Buffer.from(value),
    });
    await expect(page.getByLabel('MCP設定 JSON')).toHaveValue(value);
    await page.getByRole('button', { name: '確認する' }).click();
    await expect(page.getByLabel('確認結果')).toContainText('<img src=x onerror=alert(1)>');
    await expect(page.getByLabel('確認結果').locator('img,script,iframe,a')).toHaveCount(0);
    expect(page.url()).not.toContain('mcpServers');
    await page.getByRole('button', { name: 'クリア' }).click();
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await page.getByRole('button', { name: '確認する' }).click();
    await expect(page.getByLabel('確認結果')).toContainText('example-local');
    await page.getByRole('button', { name: 'クリア' }).click();
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => Reflect.get(window, '__mcpCalls'))).toEqual([]);
    await page.reload();
    await expect(page.getByLabel('MCP設定 JSON')).toHaveValue('');
  });
});

test('不正UTF-8と読込中のクリアを扱う', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/mcp-config-inspector', async (page) => {
    await page.getByLabel('JSONファイルを選択').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from([0xff]),
    });
    await expect(page.getByRole('alert')).toContainText('UTF-8');
    await expect(page.getByLabel('MCP設定 JSON')).toHaveAttribute('aria-invalid', 'true');
    await page.evaluate(() => {
      Object.defineProperty(File.prototype, 'arrayBuffer', {
        configurable: true,
        value() {
          return new Promise((resolve) => {
            Reflect.set(window, '__resolveMcpRead', resolve);
          });
        },
      });
    });
    await page.getByLabel('JSONファイルを選択').setInputFiles({
      name: 'slow.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{}'),
    });
    await page.getByRole('button', { name: 'クリア' }).click();
    await page.evaluate(() =>
      Reflect.get(window, '__resolveMcpRead')(new TextEncoder().encode('{"mcpServers":{}}').buffer)
    );
    await expect(page.getByLabel('MCP設定 JSON')).toHaveValue('');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
