import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// AWS 公式例示キー（実在しないダミー値）
const DUMMY_AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const DUMMY_EMAIL = 'admin@example.com';

test.describe('シークレットスクラバー（production CSP 適用）', () => {
  // ─── 陽性対照: 実際に検出・マスクされることを確認 ───────────────────────

  test('陽性対照: AWS ダミーキー貼付 → [REDACTED: が表示され元の値が出力に存在しない（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/secret-scrubber', async (page) => {
      await page.getByLabel('テキストを貼り付け').fill(DUMMY_AWS_KEY);

      // 出力エリアにプレースホルダが表示されるまで待つ（debounce 300ms + レンダリングを考慮）
      await expect(page.getByRole('textbox', { name: 'マスク済みテキスト' })).toContainText(
        '[REDACTED:',
        { timeout: 5000 }
      );

      // 元のキーが出力に含まれていないことを確認
      const outputText = await page
        .getByRole('textbox', { name: 'マスク済みテキスト' })
        .inputValue();
      expect(outputText).not.toContain(DUMMY_AWS_KEY);
    });
  });

  test('陽性対照: メールアドレス貼付 → [REDACTED:EMAIL_1] が表示され元の値が出力に存在しない（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/secret-scrubber', async (page) => {
      await page.getByLabel('テキストを貼り付け').fill(`contact: ${DUMMY_EMAIL}`);

      await expect(page.getByRole('textbox', { name: 'マスク済みテキスト' })).toContainText(
        '[REDACTED:EMAIL_1]',
        { timeout: 5000 }
      );

      const outputText = await page
        .getByRole('textbox', { name: 'マスク済みテキスト' })
        .inputValue();
      expect(outputText).not.toContain(DUMMY_EMAIL);
    });
  });

  test('陽性対照: サンプル入力 → 複数の [REDACTED: プレースホルダが表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/secret-scrubber', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      // 出力にプレースホルダが出現する
      await expect(page.getByRole('textbox', { name: 'マスク済みテキスト' })).toContainText(
        '[REDACTED:',
        { timeout: 5000 }
      );

      const outputText = await page
        .getByRole('textbox', { name: 'マスク済みテキスト' })
        .inputValue();
      // AWS ダミーキーはサンプルに含まれており、マスクされていること
      expect(outputText).not.toContain(DUMMY_AWS_KEY);
    });
  });

  // ─── 陰性対照: 平文では「検出なし」メッセージが表示される ───────────────

  test('陰性対照: 平文テキスト → 検出された機密データはありません と表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/secret-scrubber', async (page) => {
      await page.getByLabel('テキストを貼り付け').fill('Hello, World! This is plain text.');

      // 「検出された機密データはありません」が表示される（visible な aria-hidden 要素で確認）
      await expect(page.getByTestId('scrubber-no-detect')).toBeVisible({ timeout: 5000 });

      // 出力は入力と同じ
      const outputText = await page
        .getByRole('textbox', { name: 'マスク済みテキスト' })
        .inputValue();
      expect(outputText).toBe('Hello, World! This is plain text.');
    });
  });

  // ─── トグル OFF: カテゴリ OFF でマスク解除される ────────────────────────

  test('EMAIL トグル OFF → メールが素通しになる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/secret-scrubber', async (page) => {
      await page.getByLabel('テキストを貼り付け').fill(`contact: ${DUMMY_EMAIL}`);

      // 先に検出されることを確認（陽性対照として機能）
      await expect(page.getByRole('textbox', { name: 'マスク済みテキスト' })).toContainText(
        '[REDACTED:EMAIL_1]',
        { timeout: 5000 }
      );

      // メールチップを OFF に切り替え
      await page.getByRole('button', { name: /メール/ }).click();

      // OFF 後はメールが素通し
      await expect(page.getByRole('textbox', { name: 'マスク済みテキスト' })).toContainText(
        DUMMY_EMAIL,
        { timeout: 5000 }
      );

      const outputText = await page
        .getByRole('textbox', { name: 'マスク済みテキスト' })
        .inputValue();
      expect(outputText).not.toContain('[REDACTED:EMAIL');
    });
  });

  // ─── コピーボタン確認 ────────────────────────────────────────────────────

  test('コピーボタンが表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/secret-scrubber', async (page) => {
      await page.getByLabel('テキストを貼り付け').fill(`key: ${DUMMY_AWS_KEY}`);

      // 出力が表示された後にコピーボタンが見える
      await expect(page.getByRole('textbox', { name: 'マスク済みテキスト' })).toContainText(
        '[REDACTED:',
        { timeout: 5000 }
      );

      await expect(page.getByRole('button', { name: '出力テキストをコピー' })).toBeVisible();
    });
  });

  // ─── クリアボタン ────────────────────────────────────────────────────────

  test('クリアボタンで入力・出力がリセットされる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/secret-scrubber', async (page) => {
      await page.getByLabel('テキストを貼り付け').fill(`key: ${DUMMY_AWS_KEY}`);

      await expect(page.getByRole('textbox', { name: 'マスク済みテキスト' })).toContainText(
        '[REDACTED:',
        { timeout: 5000 }
      );

      await page.getByRole('button', { name: 'クリア' }).click();

      const inputText = await page.getByLabel('テキストを貼り付け').inputValue();
      expect(inputText).toBe('');

      // クリア後は出力エリアが非表示になる
      await expect(page.getByRole('textbox', { name: 'マスク済みテキスト' })).not.toBeVisible();
    });
  });
});
