import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('JANコード生成（production CSP 適用）', () => {
  test('JAN-13: サンプルボタンで結果が表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      // exact: true で説明文との誤マッチを防ぐ
      await expect(page.getByText('チェックディジット', { exact: true })).toBeVisible();
      await expect(page.getByText('完成コード', { exact: true })).toBeVisible();
    });
  });

  test('JAN-13: 12桁入力でチェックディジットと完成コードが表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      // pressSequentially で React の onChange を確実に発火させる
      await page.getByLabel(/桁を入力/).pressSequentially('490123456789');
      await expect(page.getByText('チェックディジット', { exact: true })).toBeVisible();
      await expect(page.getByText('完成コード', { exact: true })).toBeVisible();
    });
  });

  test('JAN-13: 完成コードは13桁（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await expect(page.getByText('完成コード', { exact: true })).toBeVisible();
      // 結果エリア全体に13桁数字が含まれることを確認
      await expect(
        page
          .getByTestId('jan-code-result')
          .getByText(/^\d{13}$/)
          .first()
      ).toBeVisible();
    });
  });

  test('JAN-13: 数字以外の入力でエラーを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByLabel(/桁を入力/).pressSequentially('abc');
      await expect(page.getByRole('alert')).toContainText('数字のみ入力してください');
    });
  });

  test('JAN-13: 入力が不完全な場合は結果を表示しない（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByLabel(/桁を入力/).pressSequentially('490');
      await expect(page.getByText('チェックディジット', { exact: true })).not.toBeVisible();
    });
  });

  test('JAN-8: モード切替後にサンプルで結果が表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByRole('button', { name: 'JAN-8' }).click();
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await expect(page.getByText('チェックディジット', { exact: true })).toBeVisible();
      // 完成コードは8桁
      await expect(
        page
          .getByTestId('jan-code-result')
          .getByText(/^\d{8}$/)
          .first()
      ).toBeVisible();
    });
  });

  // issue #392: downloadPngFromSvgElement Promise 化の陽性対照 E2E。
  // Image 読み込みを強制 onerror させ、async downloadPng の catch 経路で
  // ErrorMessage が表示されることを観測可能な振る舞いとして assert する
  // (旧 void 実装ではこの ErrorMessage は絶対に出ない silent failure)。
  test('JAN-13: PNG ダウンロード失敗時に role="alert" でエラー表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/jan-code', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await expect(page.getByText('完成コード', { exact: true })).toBeVisible();

      // hydration 後・クリック前に Image を必ず onerror させる stub に差し替える。
      // withProductionCsp は page.goto 後に fn が呼ばれるため addInitScript では
      // 次回ナビゲーション分しか効かない。
      await page.evaluate(() => {
        class FailingImage {
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;
          private _src = '';
          get src() {
            return this._src;
          }
          set src(v: string) {
            this._src = v;
            queueMicrotask(() => this.onerror?.());
          }
        }
        (window as unknown as { Image: unknown }).Image = FailingImage;
      });

      await page.getByRole('button', { name: 'PNGダウンロード' }).click();

      const alert = page.getByRole('alert').filter({ hasText: /PNG への変換に失敗しました/ });
      await expect(alert).toBeVisible();
      await expect(alert).toContainText('ダウンロードエラー');
    });
  });
});
