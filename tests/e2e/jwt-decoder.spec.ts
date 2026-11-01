import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// jwt.io のサンプル JWT（HS256）
const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

test.describe('JWTデコーダー（production CSP 適用）', () => {
  for (const viewport of [
    { name: 'PC', width: 1280, height: 800 },
    { name: 'スマホ', width: 390, height: 844 },
  ]) {
    test(`${viewport.name}: 大きな結果を通知せず状態と操作を維持する`, async ({ browser }) => {
      await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const input = page.getByLabel('JWTトークンを貼り付け');
        const status = page.getByTestId('jwt-announcement');
        const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
        const payload = 'large-payload-'.repeat(500);
        const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ data: payload, exp: 1 })}.c2lnbmF0dXJl`;

        await input.fill(token);
        await expect(status).toContainText('有効期限: 期限切れ');
        await expect(page.getByTestId('jwt-payload')).toContainText(payload);
        for (const result of [
          page.getByTestId('jwt-header'),
          page.getByTestId('jwt-payload'),
          page.getByRole('heading', { name: 'Signature' }),
        ]) {
          await expect(
            result.locator('xpath=ancestor-or-self::*[@role="status" or @aria-live]')
          ).toHaveCount(0);
        }
        await expect(status).not.toContainText(payload);
        await expect(status).not.toContainText(token);
        await expect(
          page.getByTestId('jwt-header').getByRole('button', { name: 'コピー' })
        ).toBeEnabled();

        await input.fill(token.replace('c2lnbmF0dXJl', 'c2lnbmF0dXJm'));
        await expect(status).toContainText('JWTの入力を更新しました');
        await page.getByLabel('有効期限（exp）チェックを行う').uncheck();
        await expect(status).toContainText('有効期限チェックはオフ');
        await page.getByLabel('シークレットキー（HS*）').fill('wrong-key');
        await expect(status).toContainText('署名: 無効');
        await input.fill('invalid');
        await expect(status).toHaveText('JWTの形式が正しくありません。');
        await expect(page.getByRole('alert')).toContainText('有効なJWTトークンではありません');
        await page.getByRole('button', { name: 'クリア' }).click();
        await expect(status).toHaveText('JWTの入力をクリアしました。');
      });
    });
  }

  test('有効なJWTをデコードしてHeader・Payloadセクションを表示する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.getByLabel('JWTトークンを貼り付け').fill(SAMPLE_JWT);
      await expect(page.getByRole('heading', { name: 'Header (JOSE)' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Payload (Claims)' })).toBeVisible();
    });
  });

  test('Headerに alg と typ が含まれる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.getByLabel('JWTトークンを貼り付け').fill(SAMPLE_JWT);
      await expect(page.getByRole('heading', { name: 'Header (JOSE)' })).toBeVisible();
      await expect(page.getByTestId('jwt-header')).toContainText('"HS256"');
      await expect(page.getByTestId('jwt-header')).toContainText('"JWT"');
    });
  });

  test('Payloadに sub と name が含まれる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.getByLabel('JWTトークンを貼り付け').fill(SAMPLE_JWT);
      await expect(page.getByRole('heading', { name: 'Payload (Claims)' })).toBeVisible();
      await expect(page.getByTestId('jwt-payload')).toContainText('"1234567890"');
      await expect(page.getByTestId('jwt-payload')).toContainText('"John Doe"');
    });
  });

  test('不正なJWTでエラーメッセージを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.getByLabel('JWTトークンを貼り付け').fill('not-a-valid-jwt');
      await expect(page.getByRole('alert')).toContainText('有効なJWTトークンではありません');
    });
  });

  test('サンプルボタンでJWTが生成・デコードされる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await expect(page.getByRole('heading', { name: 'Header (JOSE)' })).toBeVisible();
      await expect(page.getByLabel('JWTトークンを貼り付け')).not.toHaveValue('');
      await expect(page.getByTestId('jwt-announcement')).toContainText('署名: 有効');
      await expect(page.getByTestId('jwt-announcement')).toContainText('有効期限: 有効');
    });
  });

  test('同じサンプルを再入力しても署名検証結果を維持する', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z'));
      const sample = page.getByRole('button', { name: 'サンプルを入力' });
      const input = page.getByLabel('JWTトークンを貼り付け');
      const status = page.getByTestId('jwt-announcement');
      await sample.click();
      await expect(status).toContainText('署名: 有効');
      const token = await input.inputValue();
      await sample.click();
      await expect(input).toHaveValue(token);
      await expect(status).toContainText('JWTの入力を更新しました');
      await expect(status).toContainText('署名: 有効');
    });
  });

  test('同じサンプルを同時に生成しても署名検証結果を維持する', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z'));
      await page.evaluate(() => {
        const releases: Array<() => void> = [];
        Object.assign(window, { jwtSignReleases: releases });
        const sign = crypto.subtle.sign.bind(crypto.subtle);
        Object.defineProperty(crypto.subtle, 'sign', {
          value: async (...args: Parameters<SubtleCrypto['sign']>) => {
            const result = await sign(...args);
            await new Promise<void>((resolve) => releases.push(resolve));
            return result;
          },
        });
      });
      const sample = page.getByRole('button', { name: 'サンプルを入力' });
      const status = page.getByTestId('jwt-announcement');
      await sample.click();
      await sample.click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as unknown as { jwtSignReleases: Array<() => void> }).jwtSignReleases.length
          )
        )
        .toBe(2);
      await page.evaluate(() =>
        (window as unknown as { jwtSignReleases: Array<() => void> }).jwtSignReleases[0]()
      );
      await expect(status).toContainText('署名: 有効');
      await page.evaluate(() =>
        (window as unknown as { jwtSignReleases: Array<() => void> }).jwtSignReleases[1]()
      );
      await expect(status).toContainText('JWTの入力を更新しました');
      await expect(status).toContainText('署名: 有効');
    });
  });

  test('入力クリアでデコード結果が消える（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/jwt-decoder', async (page) => {
      await page.getByLabel('JWTトークンを貼り付け').fill(SAMPLE_JWT);
      await expect(page.getByRole('heading', { name: 'Header (JOSE)' })).toBeVisible();
      await page.getByLabel('JWTトークンを貼り付け').fill('');
      await expect(page.getByRole('heading', { name: 'Header (JOSE)' })).not.toBeVisible();
    });
  });
});
