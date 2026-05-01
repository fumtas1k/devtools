import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

// Shift_JIS "あいうえお\n"
const SJIS_AIUEO = Buffer.from([0x82, 0xa0, 0x82, 0xa2, 0x82, 0xa4, 0x82, 0xa6, 0x82, 0xa8, 0x0a]);

test.describe('セキュリティ: ファイル名サニタイズ', () => {
  // ──────────────────────────────────────────────────────────
  // EncodingConverter: ダウンロード名の安全化
  // ──────────────────────────────────────────────────────────

  test.describe('EncodingConverter', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/tools/encoding-converter');
      await waitForReactHydration(page);
    });

    test('日本語を含むファイル名はダウンロード時に許可文字のみに変換される', async ({ page }) => {
      await page.getByRole('button', { name: '変換' }).click();
      await page.getByRole('button', { name: 'ファイル' }).click();
      // 日本語混じり・スペース付きのファイル名（OS 由来の信頼できない値）
      await page.getByLabel('ファイルを選択').setInputFiles({
        name: 'テスト データ.csv',
        mimeType: 'text/csv',
        buffer: SJIS_AIUEO,
      });

      await expect(page.getByLabel('変換結果プレビュー')).toContainText('あいうえお');

      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: '変換後ファイルをダウンロード' }).click();
      const download = await downloadPromise;
      const filename = download.suggestedFilename();

      // 日本語・スペースは許可されないため _ に置換される
      expect(filename).toMatch(/^[A-Za-z0-9._-]+$/);
      // 拡張子はホワイトリストに含まれる .csv が維持される
      expect(filename.endsWith('.csv')).toBe(true);
      // 変換ターゲット名（utf8）が保持される
      expect(filename).toContain('utf8');
    });

    test('path separator を含むファイル名はダウンロード名から除去される', async ({ page }) => {
      await page.getByRole('button', { name: '変換' }).click();
      await page.getByRole('button', { name: 'ファイル' }).click();
      // 攻撃者が制御可能な名前として path traversal 風の名前を渡す
      await page.getByLabel('ファイルを選択').setInputFiles({
        name: '../../etc/passwd.csv',
        mimeType: 'text/csv',
        buffer: SJIS_AIUEO,
      });

      await expect(page.getByLabel('変換結果プレビュー')).toContainText('あいうえお');

      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: '変換後ファイルをダウンロード' }).click();
      const download = await downloadPromise;
      const filename = download.suggestedFilename();

      // path separator が含まれていない
      expect(filename).not.toContain('/');
      expect(filename).not.toContain('\\');
      // 先頭ドット（隠しファイル化）も発生しない
      expect(filename.startsWith('.')).toBe(false);
      // .csv はホワイトリストに含まれるため維持される
      expect(filename.endsWith('.csv')).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────
  // QrTicket: チケット ID のホワイトリスト検証
  // ──────────────────────────────────────────────────────────

  test.describe('QrTicket', () => {
    test.setTimeout(30000);

    test.beforeEach(async ({ page }) => {
      await page.goto('/tools/qr-ticket');
      await page.getByRole('button', { name: '鍵ペアを新規生成' }).waitFor();
      await waitForReactHydration(page);
    });

    test('チケット ID にスラッシュを含めると一括生成時にエラー表示される', async ({ page }) => {
      await page.getByRole('button', { name: '鍵ペアを新規生成' }).click();
      await expect(page.getByText('秘密鍵（主催者が保管）')).toBeVisible({ timeout: 10000 });

      await page.getByLabel('イベントID').fill('event-2099');
      await page.getByLabel('有効期限').fill('2099-12-31T23:59');
      // path separator を含む危険なチケット ID
      await page.getByLabel('チケットID 1').fill('../evil');

      await page.getByRole('button', { name: '一括生成' }).click();

      await expect(page.getByRole('alert')).toContainText(
        '英数字・ピリオド・アンダースコア・ハイフンのみ'
      );
      // 生成結果セクションは表示されない
      await expect(page.getByText(/生成結果（\d+件）/)).not.toBeVisible();
    });

    test('チケット ID に .. を含めると一括生成時にエラー表示される', async ({ page }) => {
      await page.getByRole('button', { name: '鍵ペアを新規生成' }).click();
      await expect(page.getByText('秘密鍵（主催者が保管）')).toBeVisible({ timeout: 10000 });

      await page.getByLabel('イベントID').fill('event-2099');
      await page.getByLabel('有効期限').fill('2099-12-31T23:59');
      await page.getByLabel('チケットID 1').fill('foo..bar');

      await page.getByRole('button', { name: '一括生成' }).click();

      await expect(page.getByRole('alert')).toContainText(
        '英数字・ピリオド・アンダースコア・ハイフンのみ'
      );
    });

    test('安全なチケット ID（T-00001 等）は受け入れられる', async ({ page }) => {
      await page.getByRole('button', { name: '鍵ペアを新規生成' }).click();
      await expect(page.getByText('秘密鍵（主催者が保管）')).toBeVisible({ timeout: 10000 });

      await page.getByLabel('イベントID').pressSequentially('event-2099');
      await page.getByLabel('有効期限').fill('2099-12-31T23:59');
      // 既定値 T-00001 のまま生成
      await page.getByRole('button', { name: '一括生成' }).click();

      await expect(page.getByText(/生成結果（\d+件）/)).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('T-00001')).toBeVisible();
    });
  });
});
