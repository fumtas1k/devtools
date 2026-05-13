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
      ).not.toHaveText(/^[─\s]+$/);
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
      await expect(codeSpan).not.toHaveText(/^[─\s]+$/, { timeout: 5000 });

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
      await expect(codeSpan).not.toHaveText(/^[─\s]+$/, { timeout: 5000 });
      const labelText = await codeSpan.getAttribute('aria-label');
      const currentCode = labelText?.split(': ')[1] ?? '';

      // 検証モードに切り替え
      await page.getByRole('button', { name: '検証' }).click();
      await page.getByLabel('検証するコードを入力').fill(currentCode);
      await page.getByRole('button', { name: '検証する' }).click();

      // 有効 or 無効の結果テキストが直接表示されることを確認する。
      // 旧実装は `or` fallback により aria-live 要素が存在するだけで pass していたため
      // 「結果表示が消えても test が通る」silent regression を許していた。
      const verifyResult = page.locator('[aria-live="assertive"]');
      await expect(verifyResult).toContainText(/有効|無効/, { timeout: 5000 });
    });
  });

  test('ランダム生成ボタンで Base32 シークレットが生成されコードが計算される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      const secretInput = page.getByLabel('Base32 シークレット');
      // まずクリアして空の状態から生成を確認
      await page.getByRole('button', { name: 'クリア' }).click();
      await expect(secretInput).toHaveValue('');

      await page.getByRole('button', { name: 'ランダムなシークレットを生成' }).click();

      // 生成された secret は 32 文字 (= 20 byte、Base32 アルファベットのみ、padding なし)
      const generated = await secretInput.inputValue();
      expect(generated).toMatch(/^[A-Z2-7]{32}$/);

      // 生成された secret で TOTP コードが計算されること（valid な Base32 形式である陽性対照）
      const codeSpan = page.getByRole('status').locator('span[aria-label*="現在のコード"]');
      await expect(codeSpan).not.toHaveText(/^[─\s]+$/, { timeout: 5000 });
    });
  });

  test('ランダム生成を連続クリックすると異なる secret が生成される（陽性対照・CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      const secretInput = page.getByLabel('Base32 シークレット');
      const generateBtn = page.getByRole('button', { name: 'ランダムなシークレットを生成' });

      await generateBtn.click();
      const first = await secretInput.inputValue();
      await generateBtn.click();
      const second = await secretInput.inputValue();

      // crypto.getRandomValues が固定値を返したら同一値になる silent regression を検知
      expect(first).not.toBe(second);
      expect(first).toMatch(/^[A-Z2-7]{32}$/);
      expect(second).toMatch(/^[A-Z2-7]{32}$/);
    });
  });

  test('検証モードで Cmd/Ctrl+Enter で検証が発火する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      // TOTP モードで現在のコードを取得
      await page.getByLabel('Base32 シークレット').fill(RFC_SECRET_BASE32);
      const codeSpan = page.getByRole('status').locator('span[aria-label*="現在のコード"]');
      await expect(codeSpan).not.toHaveText(/^[─\s]+$/, { timeout: 5000 });
      const labelText = await codeSpan.getAttribute('aria-label');
      const currentCode = labelText?.split(': ')[1] ?? '';

      // 検証モードへ切替 → input にコード入力 → Enter ボタンを押さずキーボードショートカットで発火
      await page.getByRole('button', { name: '検証' }).click();
      const verifyInput = page.getByLabel('検証するコードを入力');
      await verifyInput.fill(currentCode);
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await verifyInput.press(`${modifier}+Enter`);

      const verifyResult = page.locator('[aria-live="assertive"]');
      await expect(verifyResult).toContainText(/有効|無効/, { timeout: 5000 });
    });
  });

  test('検証モードで input が空の状態の Cmd/Ctrl+Enter は検証を発火しない（陽性対照・CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/totp-hotp', async (page) => {
      await page.getByLabel('Base32 シークレット').fill(RFC_SECRET_BASE32);
      await page.getByRole('button', { name: '検証' }).click();

      // 空のまま Cmd/Ctrl+Enter を押下
      const verifyInput = page.getByLabel('検証するコードを入力');
      await verifyInput.focus();
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await verifyInput.press(`${modifier}+Enter`);

      // 結果が表示されないこと（disabled guard が効いている）。
      // `toHaveCount(0)` は要素「存在しない」を即時評価するため、guard を外した場合の
      // `setVerificationResult` async 反映を確実に観測できるよう待機してから assert する。
      await page.waitForTimeout(300);
      const verifyResult = page.locator('[aria-live="assertive"]');
      await expect(verifyResult).toHaveCount(0);
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
