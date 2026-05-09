import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

const PRIMARY_COLOR = 'rgb(26, 86, 219)';

test.describe('DownloadButton（production CSP 適用）', () => {
  test('SVGダウンロードボタン（secondary）が表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      const button = page.getByRole('button', { name: 'SVGダウンロード' });
      await expect(button).toBeVisible();

      // スタイルの検証（背景が透明、枠線がプライマリ色であること）
      await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
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

  test.skip('disabled 状態のスタイルが正しい', async () => {
    // 現在の各ツールの実装では、ダウンロード不可な状態ではボタン自体を非表示にする
    // パターンが主流（GS1 DataBar, JANコード等）であり、UI上でこの状態を
    // 再現することが困難なため、テストをスキップする。
    // 将来的に無効化（disabled）を恒常的に使用するツールが追加された際に実装を検討。
  });

  // hover フィードバック（issue #238）
  // ActionButton は variant 別に :hover:not(:disabled) を global.css の @layer components で定義する。
  // DownloadButton は ActionButton の thin wrapper のため、その hover 挙動を経路として検証する。
  test('SVGダウンロードボタン（secondary）の hover で背景が var(--color-bg-active) になる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      const button = page.getByRole('button', { name: 'SVGダウンロード' });
      await expect(button).toBeVisible();

      // 初期状態: 背景透明
      await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

      // hover: 背景が --color-bg-active (#eff6ff = blue-50) に変化
      await button.hover();
      await expect(button).toHaveCSS('background-color', 'rgb(239, 246, 255)');
    });
  });

  test('PNGダウンロードボタン（primary）の hover で filter brightness が変化する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      const button = page.getByRole('button', { name: 'PNGダウンロード' });
      await expect(button).toBeVisible();

      // 初期状態: filter なし (none)
      await expect(button).toHaveCSS('filter', 'none');

      // hover: filter brightness(0.92) で 8% 暗化
      await button.hover();
      await expect(button).toHaveCSS('filter', 'brightness(0.92)');
    });
  });
});
