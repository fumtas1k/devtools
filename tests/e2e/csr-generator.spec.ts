import { test, expect } from '@playwright/test';
import { withProductionCsp, waitForReactHydration } from './helpers';

test.describe('CSR・鍵ペアジェネレータ（production CSP 適用）', () => {
  test('ページが正しくロードされ、生成モードがデフォルト表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    // pkijs + Web Crypto のロードで初回ナビゲーションが遅い場合があるため
    // skipHydration で withProductionCsp の標準待機を skip し、手動で 20s に拡張する
    await withProductionCsp(
      browser,
      '/tools/csr-generator',
      async (page) => {
        await waitForReactHydration(page, { timeout: 20_000 });
        await expect(page.getByRole('button', { name: 'CSR を生成' })).toBeVisible();
        await expect(page.getByRole('button', { name: '既存 CSR を解析' })).toBeVisible();
        // 生成モードがデフォルト（RSA アルゴリズムが選択状態）
        await expect(page.getByRole('button', { name: 'RSA' }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: 'CSR と鍵ペアを生成' })).toBeVisible();
      },
      { skipHydration: true }
    );
  });

  test('CN を入力して CSR と鍵ペアを生成できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/csr-generator', async (page) => {
      // CN を入力
      await page.getByLabel('CN（コモンネーム）').fill('test.example.jp');

      // 生成ボタンをクリック
      await page.getByRole('button', { name: 'CSR と鍵ペアを生成' }).click();

      // CSR PEM 出力が表示されるまで待機（CSR 生成に時間がかかる場合あり）
      await expect(page.getByLabel('CSR（PKCS#10 / PEM）')).not.toHaveValue('', {
        timeout: 15_000,
      });

      // 秘密鍵 PEM 出力も表示される
      await expect(page.getByLabel('秘密鍵（PKCS#8 / PEM）')).not.toHaveValue('', {
        timeout: 5_000,
      });

      // CSR PEM が正しい形式
      const csrValue = await page.getByLabel('CSR（PKCS#10 / PEM）').inputValue();
      expect(csrValue).toContain('-----BEGIN CERTIFICATE REQUEST-----');
      expect(csrValue).toContain('-----END CERTIFICATE REQUEST-----');

      // 秘密鍵 PEM が正しい形式
      const keyValue = await page.getByLabel('秘密鍵（PKCS#8 / PEM）').inputValue();
      expect(keyValue).toContain('-----BEGIN PRIVATE KEY-----');
      expect(keyValue).toContain('-----END PRIVATE KEY-----');
    });
  });

  test('ECDSA に切り替えて CSR を生成できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/csr-generator', async (page) => {
      // ECDSA に切り替え
      await page.getByRole('button', { name: 'ECDSA' }).click();
      // 曲線選択トグルが表示される
      await expect(page.getByRole('button', { name: 'P-256' })).toBeVisible();

      // CN を入力して生成
      await page.getByLabel('CN（コモンネーム）').fill('ecdsa.example.jp');
      await page.getByRole('button', { name: 'CSR と鍵ペアを生成' }).click();

      await expect(page.getByLabel('CSR（PKCS#10 / PEM）')).not.toHaveValue('', {
        timeout: 15_000,
      });
      const csrValue = await page.getByLabel('CSR（PKCS#10 / PEM）').inputValue();
      expect(csrValue).toContain('-----BEGIN CERTIFICATE REQUEST-----');
    });
  });

  test('CN も SAN も空のとき生成ボタンが disabled になる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/csr-generator', async (page) => {
      // 初期状態では CN も SAN も空 → ボタン disabled
      const generateBtn = page.getByRole('button', { name: 'CSR と鍵ペアを生成' });
      await expect(generateBtn).toBeDisabled();
      // 案内テキストが表示される
      await expect(page.getByText('CN または SAN を1つ以上入力してください')).toBeVisible();
    });
  });

  test('解析モードに切り替えてサンプル CSR を解析できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/csr-generator', async (page) => {
      // 解析モードに切り替え
      await page.getByRole('button', { name: '既存 CSR を解析' }).click();

      // 入力欄が表示される
      await expect(page.getByLabel('CSR を貼り付け')).toBeVisible();

      // サンプルを入力ボタンをクリック
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      // 入力欄にサンプル CSR が入る
      const inputValue = await page.getByLabel('CSR を貼り付け').inputValue();
      expect(inputValue).toContain('BEGIN CERTIFICATE REQUEST');

      // 解析結果が表示される（サンプル CSR は onChange で自動解析）
      // Subject 表示の OutputField が現れるまで待機
      await expect(page.getByLabel('Subject')).not.toHaveValue('', { timeout: 10_000 });

      // Subject に CN が含まれる
      const subjectValue = await page.getByLabel('Subject').inputValue();
      expect(subjectValue).toContain('CN=sample.example.jp');

      // 署名検証 OK チップが表示される
      await expect(page.getByText('署名検証: OK')).toBeVisible();
    });
  });

  test('解析モードで不正な入力に error が表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/csr-generator', async (page) => {
      // 解析モードに切り替え
      await page.getByRole('button', { name: '既存 CSR を解析' }).click();

      // 不正なテキストを入力
      await page.getByLabel('CSR を貼り付け').fill('not a valid csr');

      // エラーが表示される
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 });
    });
  });

  test('モード切替で入力・結果がリセットされる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/csr-generator', async (page) => {
      // 生成モードで CN 入力して生成
      await page.getByLabel('CN（コモンネーム）').fill('reset.example.jp');
      await page.getByRole('button', { name: 'CSR と鍵ペアを生成' }).click();
      await expect(page.getByLabel('CSR（PKCS#10 / PEM）')).not.toHaveValue('', {
        timeout: 15_000,
      });

      // 解析モードに切り替え → 結果が消える
      await page.getByRole('button', { name: '既存 CSR を解析' }).click();
      await expect(page.getByLabel('CSR（PKCS#10 / PEM）')).not.toBeVisible();

      // 生成モードに戻す → 結果はリセットされたまま
      await page.getByRole('button', { name: 'CSR を生成' }).click();
      await expect(page.getByLabel('CSR（PKCS#10 / PEM）')).not.toBeVisible();
    });
  });
});
