import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('設定ファイル相互変換', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/config-converter');
    // 初期状態: from=json → InputField の label は "JSON"
    await page.getByLabel('JSON').waitFor();
    await waitForReactHydration(page);
  });

  test('YAML→JSON変換: サンプルを投入して変換できる', async ({ page }) => {
    // 変換元を YAML に変更
    await page
      .getByRole('group', { name: '変換元フォーマット' })
      .getByRole('button', { name: 'YAML' })
      .click();
    // 変換先を JSON に変更
    await page
      .getByRole('group', { name: '変換先フォーマット' })
      .getByRole('button', { name: 'JSON' })
      .click();

    await page.getByRole('button', { name: 'サンプルを入力' }).click();

    // 出力エリアのラベルは変換先フォーマット名 "JSON"
    await expect(page.getByLabel('JSON')).not.toHaveValue('');
    await expect(page.getByLabel('JSON')).toHaveValue(/{/);
    await expect(page.getByLabel('JSON')).toHaveValue(/server/);
  });

  test('JSON→YAML変換: 手動入力して変換できる', async ({ page }) => {
    // 初期状態: from=JSON, to=YAML
    await page.getByLabel('JSON').fill('{"host": "localhost", "port": 8080}');

    await expect(page.getByLabel('YAML')).not.toHaveValue('');
    await expect(page.getByLabel('YAML')).toHaveValue(/host: localhost/);
    await expect(page.getByLabel('YAML')).toHaveValue(/port/);
  });

  test('JSON→.env変換: ネストされたオブジェクトでエラーを表示する', async ({ page }) => {
    // 変換先を .env に変更
    await page
      .getByRole('group', { name: '変換先フォーマット' })
      .getByRole('button', { name: '.env' })
      .click();

    await page.getByLabel('JSON').fill('{"nested": {"key": "value"}}');

    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('クリアボタンで入出力がリセットされる', async ({ page }) => {
    await page.getByLabel('JSON').fill('{"key": "value"}');

    await expect(page.getByLabel('YAML')).not.toHaveValue('');

    await page.getByRole('button', { name: 'クリア' }).click();

    await expect(page.getByLabel('JSON')).toHaveValue('');
    await expect(page.getByLabel('YAML')).toHaveValue('');
  });

  test('JSON Schema検証パネル: スキーマに適合するデータで検証成功を表示する', async ({ page }) => {
    // from=JSON, to=JSON にすることで出力も JSON になる（Schema検証はJSON出力を対象にする）
    await page
      .getByRole('group', { name: '変換先フォーマット' })
      .getByRole('button', { name: 'JSON' })
      .click();

    // from=to=json のとき InputField の label は "JSON (整形)"
    await page.getByLabel('JSON (整形)').fill('{"name": "太郎", "age": 30}');

    await expect(page.getByLabel('JSON', { exact: true })).not.toHaveValue('');

    await page.getByRole('button', { name: 'JSON Schema で検証する' }).click();

    await page
      .getByLabel('JSON Schema (貼り付け)')
      .fill(
        '{"type": "object", "required": ["name", "age"], "properties": {"name": {"type": "string"}, "age": {"type": "number"}}}'
      );

    await page.getByRole('button', { name: '検証する', exact: true }).click();

    // 動的インポートを伴う非同期処理のため少し待つ
    await page.waitForTimeout(500);

    await expect(page.getByText('スキーマ検証成功')).toBeVisible();
  });

  test('JSON Schema検証パネル: スキーマ違反のデータで検証エラーを表示する', async ({ page }) => {
    // from=JSON, to=JSON
    await page
      .getByRole('group', { name: '変換先フォーマット' })
      .getByRole('button', { name: 'JSON' })
      .click();

    await page.getByLabel('JSON (整形)').fill('{"name": "太郎", "age": "not-a-number"}');

    await expect(page.getByLabel('JSON', { exact: true })).not.toHaveValue('');

    await page.getByRole('button', { name: 'JSON Schema で検証する' }).click();

    await page
      .getByLabel('JSON Schema (貼り付け)')
      .fill('{"type": "object", "properties": {"age": {"type": "number"}}}');

    await page.getByRole('button', { name: '検証する', exact: true }).click();

    // 動的インポートを伴う非同期処理のため少し待つ
    await page.waitForTimeout(500);

    await expect(page.getByText('/age')).toBeVisible();
  });
});
