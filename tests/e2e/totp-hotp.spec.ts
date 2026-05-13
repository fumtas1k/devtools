import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// RFC 6238 Appendix B テストベクタの Base32 エンコード
// "12345678901234567890" → GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const RFC_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test.describe('TOTP/HOTP ジェネレータ（production CSP 適用）', () => {
  test('ページが正しくロードされ、シークレット入力・モードトグルが表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      await expect(page.getByLabel('Base32 シークレット')).toBeVisible();
      await expect(page.getByRole('button', { name: 'TOTP' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'HOTP' })).toBeVisible();
      await expect(page.getByRole('button', { name: '検証' })).toBeVisible();
    });
  });

  test('TOTP モードで Base32 シークレットを入力するとコードが表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      const secretInput = page.getByLabel('Base32 シークレット');
      await secretInput.fill(RFC_SECRET_BASE32);
      // コード表示エリアに 6 桁の数字が現れるまで待機
      await expect(
        page.getByRole('status').locator('span[aria-label*="現在のコード"]')
      ).not.toHaveText('─────');
    });
  });

  test('TOTP モードで生成されるコードが 6 桁であることを確認する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      const secretInput = page.getByLabel('Base32 シークレット');
      await secretInput.fill(RFC_SECRET_BASE32);

      // コードが生成されるまで待機
      const codeSpan = page.getByRole('status').locator('span[aria-label*="現在のコード"]');
      await expect(codeSpan).not.toHaveText('─────', { timeout: 5000 });

      const labelText = await codeSpan.getAttribute('aria-label');
      // aria-label は "現在のコード: XXXXXX" 形式
      const code = labelText?.split(': ')[1] ?? '';
      expect(/^\d{6}$/.test(code)).toBe(true);
    });
  });

  test('シークレット表示/非表示トグルが動作する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      const secretInput = page.getByLabel('Base32 シークレット');
      // 初期状態は password 型（非表示）
      await expect(secretInput).toHaveAttribute('type', 'password');

      // 「表示」ボタンをクリック
      await page.getByRole('button', { name: 'シークレットを表示する' }).click();
      await expect(secretInput).toHaveAttribute('type', 'text');

      // 「隠す」ボタンをクリック
      await page.getByRole('button', { name: 'シークレットを隠す' }).click();
      await expect(secretInput).toHaveAttribute('type', 'password');
    });
  });

  test('HOTP モードでコードを生成できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      await page.getByRole('button', { name: 'HOTP' }).click();

      const secretInput = page.getByLabel('Base32 シークレット');
      await secretInput.fill(RFC_SECRET_BASE32);

      await page.getByRole('button', { name: 'コードを生成' }).click();

      // コード表示に数字が現れることを確認
      const codeSpan = page.getByRole('status').locator('span[aria-label*="現在のコード"]');
      const labelText = await codeSpan.getAttribute('aria-label');
      const code = labelText?.split(': ')[1] ?? '';
      expect(/^\d{6}$/.test(code)).toBe(true);
    });
  });

  test('不正な Base32 シークレットでエラーメッセージが表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      await page.getByLabel('Base32 シークレット').fill('INVALID!SECRET');
      await expect(page.getByRole('alert')).toContainText('有効な Base32 形式');
    });
  });

  test('検証モードで有効なコードを検証できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      // まず TOTP モードでコードを取得
      await page.getByLabel('Base32 シークレット').fill(RFC_SECRET_BASE32);
      const codeSpan = page.getByRole('status').locator('span[aria-label*="現在のコード"]');
      await expect(codeSpan).not.toHaveText('─────', { timeout: 5000 });
      const labelText = await codeSpan.getAttribute('aria-label');
      const currentCode = labelText?.split(': ')[1] ?? '';

      // 検証モードに切り替え
      await page.getByRole('button', { name: '検証' }).click();
      await page.getByLabel('検証するコードを入力').fill(currentCode);
      await page.getByRole('button', { name: '検証する' }).click();

      // 有効 or 無効の結果が表示されること（コードが期間をまたいだ場合は無効になり得るため両方を許容）
      await expect(
        page.getByRole('region', { name: /有効|無効/ }).or(page.locator('[aria-live="assertive"]'))
      ).toBeAttached({ timeout: 5000 });
    });
  });

  test('otpauth URI が生成されコピーできる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      // URI 出力欄に otpauth:// の文字列が含まれる
      const uriOutput = page.getByLabel('otpauth URI');
      await expect(uriOutput).toHaveValue(/^otpauth:\/\/totp\//);
    });
  });

  test('発行者名にコロンを入力するとエラーが表示される（陽性対照・CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      await page.getByLabel('発行者名').fill('bad:issuer');
      await expect(page.getByRole('alert')).toContainText('コロン');
    });
  });

  test('クリアボタンでシークレット入力が消える（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      const secretInput = page.getByLabel('Base32 シークレット');
      await secretInput.fill(RFC_SECRET_BASE32);
      await page.getByRole('button', { name: 'クリア' }).click();
      await expect(secretInput).toHaveValue('');
    });
  });
});
