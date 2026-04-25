import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

// Shift_JIS "あいうえお\n" (0x82A0 82A2 82A4 82A6 82A8 0A)
const SJIS_AIUEO = Buffer.from([0x82, 0xa0, 0x82, 0xa2, 0x82, 0xa4, 0x82, 0xa6, 0x82, 0xa8, 0x0a]);

// Shift_JIS "あ\r\nい" (CRLF あり)
const SJIS_CRLF = Buffer.from([0x82, 0xa0, 0x0d, 0x0a, 0x82, 0xa2]);

// UTF-8 "あ\nい" (LF のみ)
const UTF8_LF = Buffer.from([0xe3, 0x81, 0x82, 0x0a, 0xe3, 0x81, 0x84]);

// EUC-JP "あいうえお\n" (0xA4A2 A4A4 A4A6 A4A8 A4AA 0A)
const EUCJP_AIUEO = Buffer.from([0xa4, 0xa2, 0xa4, 0xa4, 0xa4, 0xa6, 0xa4, 0xa8, 0xa4, 0xaa, 0x0a]);

// UTF-8 with BOM "あ"
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf, 0xe3, 0x81, 0x82]);

// JPEG magic bytes (non-text binary)
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

test.describe('文字コード判定・変換', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/encoding-converter');
    await waitForReactHydration(page);
  });

  test('ページが正しく表示される', async ({ page }) => {
    await expect(page.getByRole('button', { name: '判定' })).toBeVisible();
    await expect(page.getByRole('button', { name: '変換' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'テキスト' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ファイル' })).toBeVisible();
  });

  test('ケースA: UTF-8 テキスト入力 → UTF-8 と判定される', async ({ page }) => {
    await page.getByLabel('入力テキスト').fill('あいうえお');
    await expect(page.getByTestId('detection-encoding')).toContainText('UTF-8', { timeout: 2000 });
    await expect(page.getByTestId('detection-bom')).toContainText('なし');
  });

  test('ケースB: Shift_JIS ファイルアップロード → SJIS 判定とプレビュー', async ({ page }) => {
    await page.getByRole('button', { name: 'ファイル' }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test_sjis.txt',
      mimeType: 'text/plain',
      buffer: SJIS_AIUEO,
    });
    await expect(page.getByTestId('detection-encoding')).toContainText('Shift_JIS', { timeout: 3000 });
    await expect(page.getByTestId('detection-result')).toContainText('あいうえお', { timeout: 3000 });
  });

  test('ケースC: Shift_JIS → UTF-8 BOM 付き変換', async ({ page }) => {
    await page.getByRole('button', { name: '変換' }).click();
    await page.getByRole('button', { name: 'ファイル' }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test_sjis.txt',
      mimeType: 'text/plain',
      buffer: SJIS_AIUEO,
    });

    await page.getByLabel('BOM を付与する').check();

    await expect(page.locator('#enc-output')).not.toBeEmpty({ timeout: 3000 });
    await expect(page.locator('#enc-output')).toContainText('あいうえお', { timeout: 3000 });
    // hex プレビューに BOM バイト EF BB BF が含まれる
    await expect(page.getByTestId('output-hex-preview')).toContainText('EF BB BF', { timeout: 3000 });
  });

  test('ケースD: EUC-JP → UTF-8 変換', async ({ page }) => {
    await page.getByRole('button', { name: '変換' }).click();
    await page.getByRole('button', { name: 'ファイル' }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test_eucjp.txt',
      mimeType: 'text/plain',
      buffer: EUCJP_AIUEO,
    });
    await expect(page.locator('#enc-output')).toContainText('あいうえお', { timeout: 3000 });
  });

  test('ケースE: UTF-8 BOM 付きファイル → BOM あり と判定', async ({ page }) => {
    await page.getByRole('button', { name: 'ファイル' }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test_utf8bom.txt',
      mimeType: 'text/plain',
      buffer: UTF8_BOM,
    });
    await expect(page.getByTestId('detection-encoding')).toContainText('UTF-8', { timeout: 3000 });
    await expect(page.getByTestId('detection-bom')).toContainText('あり', { timeout: 2000 });
  });

  test('ケースF: 非テキストバイナリ (JPEG) → 不明または空のプレビュー', async ({ page }) => {
    await page.getByRole('button', { name: 'ファイル' }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test.jpg',
      mimeType: 'image/jpeg',
      buffer: JPEG_MAGIC,
    });
    // 不明 (UNKNOWN) か ASCII か、どちらにしても detection-result が表示される
    await expect(page.getByTestId('detection-result')).toBeVisible({ timeout: 3000 });
  });

  test('ケースG: クリアボタンで入力がリセットされる', async ({ page }) => {
    await page.getByLabel('入力テキスト').fill('テスト');
    await expect(page.getByTestId('detection-encoding')).toContainText('UTF-8', { timeout: 2000 });
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(page.getByLabel('入力テキスト')).toHaveValue('');
    await expect(page.getByTestId('detection-result')).not.toBeVisible();
  });

  test('ケースH: 変換モードの文字コード Select に全選択肢がありデフォルト値が正しい', async ({ page }) => {
    await page.getByRole('button', { name: '変換' }).click();

    const srcSelect = page.getByLabel('元の文字コード');
    const tgtSelect = page.getByLabel('変換後の文字コード');

    // デフォルト値
    await expect(srcSelect).toHaveValue('AUTO');
    await expect(tgtSelect).toHaveValue('UTF8');

    // 元の文字コードを JIS に変更できる
    await srcSelect.selectOption('JIS');
    await expect(srcSelect).toHaveValue('JIS');

    // 変換後の文字コードを SJIS に変更できる
    await tgtSelect.selectOption('SJIS');
    await expect(tgtSelect).toHaveValue('SJIS');
  });

  test('ケースI: UTF-8 以外ターゲット選択時はコピーボタンが非表示になる', async ({ page }) => {
    await page.getByRole('button', { name: '変換' }).click();
    await page.getByLabel('入力テキスト').fill('あいうえお');

    const tgtSelect = page.getByLabel('変換後の文字コード');

    // UTF-8 ターゲット（デフォルト）→ コピーボタンが表示される
    await tgtSelect.selectOption('UTF8');
    await expect(page.getByRole('button', { name: 'コピー' })).toBeVisible({ timeout: 2000 });

    // SJIS ターゲット → コピーボタンが非表示になる
    await tgtSelect.selectOption('SJIS');
    await expect(page.getByRole('button', { name: 'コピー' })).not.toBeVisible();

    // UTF-8 に戻すとコピーボタンが再表示される
    await tgtSelect.selectOption('UTF8');
    await expect(page.getByRole('button', { name: 'コピー' })).toBeVisible();
  });

  test('ケースJ: ファイルアップロード変換時のダウンロード名が元拡張子を保持する', async ({ page }) => {
    await page.getByRole('button', { name: '変換' }).click();
    await page.getByRole('button', { name: 'ファイル' }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test_sjis.csv',
      mimeType: 'text/csv',
      buffer: SJIS_AIUEO,
    });

    await expect(page.locator('#enc-output')).toContainText('あいうえお', { timeout: 3000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '変換後ファイルをダウンロード' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('test_sjis_utf8.csv');
  });

  test('サンプルボタンでサンプルテキストが入力される', async ({ page }) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.getByLabel('入力テキスト')).not.toBeEmpty();
    await expect(page.getByTestId('detection-encoding')).toContainText('UTF-8', { timeout: 2000 });
  });

  test('ケースK: 改行コード「そのまま」でCRLFがそのまま保持される', async ({ page }) => {
    await page.getByRole('button', { name: '変換' }).click();
    await page.getByRole('button', { name: 'ファイル' }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test_sjis_crlf.txt',
      mimeType: 'text/plain',
      buffer: SJIS_CRLF,
    });

    // デフォルトは「そのまま」
    await expect(page.getByRole('group', { name: '改行コード' }).getByRole('button', { name: 'そのまま' })).toHaveAttribute('aria-pressed', 'true', { timeout: 3000 });
    await expect(page.locator('#enc-output')).not.toBeEmpty({ timeout: 3000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '変換後ファイルをダウンロード' }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const bytes = fs.readFileSync(downloadPath!);

    // CRLF (0x0D 0x0A) が保持されている
    expect(bytes.indexOf(Buffer.from([0x0d, 0x0a]))).toBeGreaterThan(-1);
  });

  test('ケースL: 改行コード「LF」でCRLFがLFに正規化される', async ({ page }) => {
    await page.getByRole('button', { name: '変換' }).click();
    await page.getByRole('button', { name: 'ファイル' }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test_sjis_crlf.txt',
      mimeType: 'text/plain',
      buffer: SJIS_CRLF,
    });

    await expect(page.locator('#enc-output')).not.toBeEmpty({ timeout: 3000 });

    await page.getByRole('group', { name: '改行コード' }).getByRole('button', { name: 'LF', exact: true }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '変換後ファイルをダウンロード' }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const bytes = fs.readFileSync(downloadPath!);

    // CRLF が除去されている（0x0D が残っていない）
    expect(bytes.indexOf(0x0d)).toBe(-1);
    // LF は残っている
    expect(bytes.indexOf(0x0a)).toBeGreaterThan(-1);
  });

  test('ケースM: 改行コード「CRLF」でLFがCRLFに正規化される', async ({ page }) => {
    await page.getByRole('button', { name: '変換' }).click();
    await page.getByRole('button', { name: 'ファイル' }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test_utf8_lf.txt',
      mimeType: 'text/plain',
      buffer: UTF8_LF,
    });

    await expect(page.locator('#enc-output')).not.toBeEmpty({ timeout: 3000 });

    await page.getByRole('group', { name: '改行コード' }).getByRole('button', { name: 'CRLF' }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '変換後ファイルをダウンロード' }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const bytes = fs.readFileSync(downloadPath!);

    // CRLF に変換されている
    expect(bytes.indexOf(Buffer.from([0x0d, 0x0a]))).toBeGreaterThan(-1);
  });

  test('ケースN: UTF-16LE ターゲット選択時は改行コードトグルが非表示になる', async ({ page }) => {
    await page.getByRole('button', { name: '変換' }).click();

    const tgtSelect = page.getByLabel('変換後の文字コード');

    // UTF-8 ターゲットでは改行コードトグルが表示される
    await expect(page.getByRole('group', { name: '改行コード' })).toBeVisible({ timeout: 2000 });

    // UTF-16LE ターゲットに切り替えると非表示になる
    await tgtSelect.selectOption('UTF16LE');
    await expect(page.getByRole('group', { name: '改行コード' })).not.toBeVisible();
    // UTF-16 向けの注記が表示される
    await expect(page.getByText('UTF-16 では改行コード正規化は適用されません')).toBeVisible();

    // UTF-8 に戻すと再表示される
    await tgtSelect.selectOption('UTF8');
    await expect(page.getByRole('group', { name: '改行コード' })).toBeVisible();
  });
});
