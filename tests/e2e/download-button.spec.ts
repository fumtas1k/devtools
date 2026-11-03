import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

const PRIMARY_COLOR = 'rgb(0, 23, 193)'; // --color-primary (blue-900)
const PRIMARY_HOVER_COLOR = 'rgb(0, 17, 143)'; // --color-primary-hover (blue-1000)

test.describe('DownloadButton（production CSP 適用）', () => {
  test('SVGダウンロードボタン（secondary）が表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      const button = page.getByRole('button', { name: 'SVGダウンロード' });
      await expect(button).toBeVisible();

      // スタイルの検証（DADS の outline: 白地、枠線がプライマリ色であること）
      await expect(button).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(button).toHaveCSS('border', `1px solid ${PRIMARY_COLOR}`);
      await expect(button).toHaveCSS('color', PRIMARY_COLOR);
    });
  });

  test('PNGダウンロードボタン（primary）が表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      const button = page.getByRole('button', { name: 'PNGダウンロード' });
      await expect(button).toBeVisible();

      // スタイルの検証（背景がプライマリ色であること）
      await expect(button).toHaveCSS('background-color', PRIMARY_COLOR);
      await expect(button).toHaveCSS('color', 'rgb(255, 255, 255)');
    });
  });

  test('変換中の secondary は disabled 表示となり、完了後にダウンロードできる', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-csv', async (page) => {
      const button = page.getByRole('button', { name: 'CSVダウンロード' });
      const input = page.getByLabel('入力');
      await expect(button).toBeHidden();
      await input.fill('[{"id":1}]');
      await expect(button).toBeEnabled();
      await expect(page.getByLabel('変換結果')).toHaveValue('id\n1');

      // デバウンスの実タイマーを停止し、前回の出力が残る pending 状態を維持する。
      await page.clock.install({ time: new Date('2024-01-01T00:00:00Z') });
      await page.clock.pauseAt(new Date('2024-01-01T01:00:00Z'));
      const downloads: string[] = [];
      page.on('download', (download) => downloads.push(download.suggestedFilename()));
      await input.fill('[{"id":2}]');
      await expect(button).toBeVisible();
      await expect(button).toBeDisabled();
      await expect(button).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(button).toHaveCSS('border', '1px solid rgb(179, 179, 179)');
      await expect(button).toHaveCSS('color', 'rgb(179, 179, 179)');
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      expect(downloads).toEqual([]);

      await page.clock.runFor(300);
      await expect(page.getByLabel('変換結果')).toHaveValue('id\n2');
      await expect(button).toBeEnabled();
      const downloadPromise = page.waitForEvent('download');
      await button.click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
      expect(downloads).toEqual([download.suggestedFilename()]);
    });
  });

  test('ZIP 作成中の primary は disabled 表示となり、完了後に復帰する', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      const zip = page.getByRole('button', { name: /全件ZIPダウンロード/ });
      await expect(zip).toBeHidden();
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      await page.getByRole('button', { name: '+ バーコードを追加' }).click();
      await page.getByLabel('GTIN-14（先頭13桁）').nth(1).fill('0498700000002');
      await expect(zip).toBeEnabled();

      // PNG 変換自体は実行し、toBlob の完了通知だけを保持する。
      await page.evaluate(() => {
        const original = HTMLCanvasElement.prototype.toBlob;
        const held: Array<() => void> = [];
        Object.assign(window, { heldPngCallbacks: held });
        HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
          return original.call(this, (blob) => held.push(() => callback(blob)), ...args);
        };
      });
      const downloads: string[] = [];
      page.on('download', (download) => downloads.push(download.suggestedFilename()));
      await zip.click();
      const pending = page.getByRole('button', { name: 'ZIP作成中...' });
      await expect(pending).toBeVisible();
      await expect(pending).toBeDisabled();
      await expect(pending).toHaveCSS('background-color', 'rgb(179, 179, 179)');
      await expect(pending).toHaveCSS('border', '4px double rgba(0, 0, 0, 0)');
      await expect(pending).toHaveCSS('color', 'rgb(242, 242, 242)');
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as unknown as { heldPngCallbacks: Array<() => void> }).heldPngCallbacks.length
          )
        )
        .toBe(2);
      const box = await pending.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      expect(downloads).toEqual([]);

      const downloadPromise = page.waitForEvent('download');
      await page.evaluate(() => {
        const callbacks = (window as unknown as { heldPngCallbacks: Array<() => void> })
          .heldPngCallbacks;
        callbacks.forEach((callback) => callback());
      });
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('gs1-databars.zip');
      await expect(zip).toBeEnabled();
      expect(downloads).toEqual(['gs1-databars.zip']);
    });
  });

  // hover フィードバック（issue #238）
  // ActionButton は variant 別に :hover:not(:disabled) を src/styles/components/button.css の @layer components で定義する。
  // DownloadButton は ActionButton の thin wrapper のため、その hover 挙動を経路として検証する。
  test('SVGダウンロードボタン（secondary）の hover で背景が var(--color-bg-primary-hover) になる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      const button = page.getByRole('button', { name: 'SVGダウンロード' });
      await expect(button).toBeVisible();

      // 初期状態: 白地（DADS の outline）
      await expect(button).toHaveCSS('background-color', 'rgb(255, 255, 255)');

      // hover: 背景が --color-bg-primary-hover (#c5d7fb = blue-200) に変化し、下線が付く
      await button.hover();
      await expect(button).toHaveCSS('background-color', 'rgb(197, 215, 251)');
      await expect(button).toHaveCSS('text-decoration-line', 'underline');
    });
  });

  test('PNGダウンロードボタン（primary）の hover で背景が primary-hover になる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      const button = page.getByRole('button', { name: 'PNGダウンロード' });
      await expect(button).toBeVisible();

      // 初期状態: primary（blue-900）
      await expect(button).toHaveCSS('background-color', PRIMARY_COLOR);

      // hover: --color-primary-hover（blue-1000）。filter は使わない（フォーカスの黄リングまで暗くなるため）
      await button.hover();
      await expect(button).toHaveCSS('background-color', PRIMARY_HOVER_COLOR);
      await expect(button).toHaveCSS('filter', 'none');
    });
  });
});
