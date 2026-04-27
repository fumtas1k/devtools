import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

const PRIMARY_COLOR = 'rgb(26, 86, 219)';

test.describe('DownloadButton', () => {
  test.beforeEach(async ({ page }) => {
    // DownloadButton が使用されているツール（JANコード生成）へ移動
    await page.goto('/tools/jan-code');
    await page.getByRole('button', { name: 'サンプルを入力' }).waitFor();
    await waitForReactHydration(page);
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
  });

  test('SVGダウンロードボタン（secondary）が表示される', async ({ page }) => {
    const button = page.getByRole('button', { name: 'SVGダウンロード' });
    await expect(button).toBeVisible();

    // スタイルの検証（背景が透明、枠線がプライマリ色であること）
    await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(button).toHaveCSS('border', `1px solid ${PRIMARY_COLOR}`);
    await expect(button).toHaveCSS('color', PRIMARY_COLOR);
  });

  test('PNGダウンロードボタン（primary）が表示される', async ({ page }) => {
    const button = page.getByRole('button', { name: 'PNGダウンロード' });
    await expect(button).toBeVisible();

    // スタイルの検証（背景がプライマリ色であること）
    await expect(button).toHaveCSS('background-color', PRIMARY_COLOR);
    await expect(button).toHaveCSS('color', 'rgb(255, 255, 255)');
  });

  test.skip('disabled 状態のスタイルが正しい', async () => {
    // 現在の各ツールの実装では、ダウンロード不可な状態ではボタン自体を非表示にする
    // パターンが主流（GS1 DataBar, JANコード等）であり、UI上でこの状態を
    // 再現することが困難なため、テストをスキップする。
    // 将来的に無効化（disabled）を恒常的に使用するツールが追加された際に実装を検討。
  });
});
