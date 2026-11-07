import { readFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { waitForReactHydration } from '../e2e/helpers';

type Mode = 'load' | 'domcontentloaded';
type Case = {
  spec: string;
  path: string;
  static?: boolean;
  mobile?: boolean;
  run: (page: Page, info: TestInfo, mode: Mode) => Promise<void>;
};

async function saveDownload(page: Page, info: TestInfo, name: string) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const download = await event;
  const path = info.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  return { filename: download.suggestedFilename(), data: await readFile(path) };
}

async function qrImage(page: Page, text: string) {
  await page.getByLabel('テキスト / URL').fill(text);
  const qr = page.getByTestId('qr-code-container');
  await expect(qr.locator('svg')).toBeVisible();
  return qr.screenshot();
}

export const cases: Case[] = [
  {
    spec: 'base64',
    path: '/tools/base64',
    run: async (page) => {
      await page.getByLabel('入力', { exact: true }).fill('Hello');
      await expect(page.getByLabel('変換結果')).toHaveValue('SGVsbG8=');
    },
  },
  {
    spec: 'config-converter',
    path: '/tools/config-converter',
    run: async (page) => {
      await page.getByLabel('JSON', { exact: true }).fill('{"host":"localhost"}');
      await expect(page.getByLabel('YAML')).toHaveValue(/host: localhost/);
    },
  },
  {
    spec: 'copy-button',
    path: '/tools/jan-code',
    run: async (page) => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      const button = page.getByRole('button', { name: 'コピー' }).first();
      await button.click();
      await expect(button.getByRole('status')).toHaveText('コピーしました');
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).not.toBe('');
    },
  },
  {
    spec: 'download-button',
    path: '/tools/json-csv',
    run: async (page, info) => {
      await page.getByLabel('入力', { exact: true }).fill('[{"id":1}]');
      await expect(page.getByLabel('変換結果')).toHaveValue('id\n1');
      const result = await saveDownload(page, info, 'CSVダウンロード');
      expect(result.filename).toMatch(/\.csv$/);
      expect(result.data.toString('utf8')).toContain('id\r\n1');
    },
  },
  {
    spec: 'dummy-text',
    path: '/tools/dummy-text',
    run: async (page) => {
      await page.getByLabel('文字数').fill('50');
      await page.getByLabel('文字数').press('Tab');
      await expect(page.getByText('50 文字')).toBeVisible();
    },
  },
  {
    spec: 'encoding-converter',
    path: '/tools/encoding-converter',
    run: async (page) => {
      await page.getByLabel('入力テキスト').fill('あいうえお');
      await expect(page.getByTestId('detection-encoding')).toContainText('UTF-8');
    },
  },
  {
    spec: 'filename-sanitize',
    path: '/tools/encoding-converter',
    run: async (page, info) => {
      await page.getByRole('button', { name: '変換' }).click();
      await page.getByRole('button', { name: 'ファイル' }).click();
      await page.getByLabel('ファイルを選択').setInputFiles({
        name: 'テスト データ.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from([0x82, 0xa0, 0x82, 0xa2, 0x82, 0xa4, 0x82, 0xa6, 0x82, 0xa8, 0x0a]),
      });
      await expect(page.getByLabel('変換結果プレビュー')).toContainText('あいうえお');
      const result = await saveDownload(page, info, '変換後ファイルをダウンロード');
      expect(result.filename).toMatch(/^[A-Za-z0-9._-]+\.csv$/);
      expect(result.data.length).toBeGreaterThan(0);
    },
  },
  {
    spec: 'gs1-databar',
    path: '/tools/gs1-databar',
    run: async (page) => {
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();
    },
  },
  {
    spec: 'jan-code',
    path: '/tools/jan-code',
    run: async (page, info) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await expect(page.getByTestId('jan-code-result')).toBeVisible();
      const result = await saveDownload(page, info, 'PNGダウンロード');
      expect([...result.data.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    },
  },
  {
    spec: 'json-csv',
    path: '/tools/json-csv',
    run: async (page) => {
      await page.getByLabel('入力', { exact: true }).fill('[{"id":1}]');
      await expect(page.getByLabel('変換結果')).toHaveValue('id\n1');
    },
  },
  {
    spec: 'json-xml',
    path: '/tools/json-xml',
    run: async (page) => {
      await page.getByLabel('入力', { exact: true }).fill('{"name":"太郎"}');
      await expect(page.getByLabel('変換結果')).toHaveValue(/<name>太郎<\/name>/);
    },
  },
  {
    spec: 'jwt-decoder',
    path: '/tools/jwt-decoder',
    run: async (page) => {
      const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"name":"fictional"}').toString('base64url')}.c2lnbmF0dXJl`;
      await page.getByLabel('JWTトークンを貼り付け').fill(token);
      await expect(page.getByTestId('jwt-payload')).toContainText('fictional');
    },
  },
  {
    spec: 'link-styles',
    path: '/privacy',
    static: true,
    run: async (page) => {
      const link = page.getByRole('link', { name: 'Cloudflare のプライバシーポリシー' });
      await expect(link).toHaveCSS('color', 'rgb(0, 17, 143)');
      await link.hover();
      await expect(link).toHaveCSS('color', 'rgb(0, 23, 193)');
    },
  },
  {
    spec: 'mobile-drawer',
    path: '/tools/url-encode',
    mobile: true,
    run: async (page) => {
      const open = page.getByRole('button', { name: 'メニューを開く' });
      await open.click();
      await expect(page.getByRole('dialog', { name: 'ナビゲーション' })).toBeVisible();
      await expect(open).toHaveAttribute('aria-expanded', 'true');
      await page.getByRole('button', { name: 'メニューを閉じる' }).click();
      await expect(open).toHaveAttribute('aria-expanded', 'false');
    },
  },
  {
    spec: 'qr-code',
    path: '/tools/qr-code',
    run: async (page, info) => {
      await qrImage(page, 'https://example.com');
      const result = await saveDownload(page, info, 'SVGダウンロード');
      expect(result.data.toString('utf8')).toContain('<svg');
    },
  },
  {
    spec: 'qr-reader',
    path: '/tools/qr-code',
    run: async (page, _info, mode) => {
      const image = await qrImage(page, 'diagnostic fictional text');
      expect((await page.goto('/tools/qr-reader', { waitUntil: mode }))?.status()).toBe(200);
      await waitForReactHydration(page);
      await page.getByRole('button', { name: '画像アップロード' }).click();
      await page
        .getByLabel('画像を選択')
        .setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: image });
      await expect(page.getByText('diagnostic fictional text', { exact: true })).toBeVisible();
    },
  },
  {
    spec: 'qr-ticket',
    path: '/tools/qr-ticket',
    run: async (page) => {
      await page.getByRole('button', { name: '鍵ペアを新規生成' }).click();
      await expect(page.getByLabel('公開鍵（検証スタッフへ共有）')).not.toHaveValue('');
      await page.getByLabel('イベントID').fill('event');
      await page.getByLabel('有効期限').fill('2099-12-31T23:59');
      await page.getByRole('button', { name: '一括生成' }).click();
      const qr = page.getByTestId('qr-code-container').first();
      await expect(qr.locator('svg')).toBeVisible();
      const image = await qr.screenshot();
      await page.getByRole('button', { name: '検証', exact: true }).click();
      await page.getByRole('button', { name: '画像アップロード' }).click();
      await page
        .getByLabel('画像を選択')
        .setInputFiles({ name: 'ticket.png', mimeType: 'image/png', buffer: image });
      await expect(page.getByText('有効なチケット', { exact: true })).toBeVisible();
    },
  },
  {
    spec: 'ulid-generator',
    path: '/tools/ulid-generator',
    run: async (page) => {
      await page.getByRole('button', { name: '生成' }).click();
      await expect(page.getByRole('cell', { name: /[0-9A-Z]{26}/ }).first()).toBeVisible();
    },
  },
  {
    spec: 'url-encode',
    path: '/tools/url-encode',
    run: async (page) => {
      await page.getByLabel('入力', { exact: true }).fill('テスト');
      await expect(page.getByLabel('変換結果')).toHaveValue('%E3%83%86%E3%82%B9%E3%83%88');
    },
  },
  {
    spec: 'uuid-v7',
    path: '/tools/uuid-v7',
    run: async (page) => {
      await page.getByRole('button', { name: '生成' }).click();
      await expect(page.getByText('10 件生成')).toBeVisible();
      await expect(page.locator('table tbody tr')).toHaveCount(10);
      await expect(page.locator('table tbody tr').first().locator('td').nth(1)).toHaveText(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    },
  },
];
