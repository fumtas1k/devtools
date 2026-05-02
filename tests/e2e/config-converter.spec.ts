import { test, expect } from '@playwright/test';
import { applyProductionCsp, waitForReactHydration } from './helpers';

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

    await expect(page.getByText('/age')).toBeVisible();
  });

  test('JSON Schema検証パネル: to=YAML 出力に対してもスキーマ検証が動作する', async ({ page }) => {
    // 初期状態: from=JSON, to=YAML（デフォルト）
    await page.getByLabel('JSON').fill('{"name": "太郎", "age": 30}');

    await expect(page.getByLabel('YAML')).not.toHaveValue('');

    await page.getByRole('button', { name: 'JSON Schema で検証する' }).click();

    await page
      .getByLabel('JSON Schema (貼り付け)')
      .fill(
        '{"type": "object", "required": ["name", "age"], "properties": {"name": {"type": "string"}, "age": {"type": "number"}}}'
      );

    await page.getByRole('button', { name: '検証する', exact: true }).click();

    await expect(page.getByText('スキーマ検証成功')).toBeVisible();
  });

  test('変換先のみ変更しても入力テキストが保持される', async ({ page }) => {
    const fromGroup = page.getByRole('group', { name: '変換元フォーマット' });
    const toGroup = page.getByRole('group', { name: '変換先フォーマット' });

    // YAML → JSON にセット
    await fromGroup.getByRole('button', { name: 'YAML' }).click();
    await toGroup.getByRole('button', { name: 'JSON' }).click();

    // YAML テキストを入力
    const inputTextarea = page.getByLabel(/^YAML/);
    await inputTextarea.fill('host: localhost\nport: 8080');

    // 出力が JSON になるまで待機
    await expect(page.getByLabel('JSON')).toHaveValue(/\{/);

    // 変換先を TOML に切り替え
    await toGroup.getByRole('button', { name: 'TOML' }).click();

    // 入力が保持されていること
    await expect(inputTextarea).toHaveValue('host: localhost\nport: 8080');

    // 出力が TOML 形式に更新されること
    await expect(page.getByLabel('TOML')).toHaveValue(/host/);
  });

  test('変換先切り替え直後はダウンロードボタンが disabled になる', async ({ page }) => {
    // from=JSON, to=YAML（デフォルト）で入力して出力を得る
    await page.getByLabel('JSON').fill('{"host": "localhost", "port": 8080}');

    // デバウンス完了を待って出力が反映される
    await expect(page.getByLabel('YAML')).toHaveValue(/host: localhost/);

    // ダウンロードボタンが有効であることを確認
    const downloadBtn = page.getByRole('button', { name: 'ダウンロード' });
    await expect(downloadBtn).toBeEnabled();

    // 変換先を TOML に切り替え（デバウンス中は disabled になるはず）
    await page
      .getByRole('group', { name: '変換先フォーマット' })
      .getByRole('button', { name: 'TOML' })
      .click();

    // 切り替え直後（デバウンス中）はボタンが disabled になること
    await expect(downloadBtn).toBeDisabled();

    // デバウンス完了後（出力が TOML に更新されたあと）は有効化されること
    await expect(page.getByLabel('TOML')).toHaveValue(/host/);
    await expect(downloadBtn).toBeEnabled();
  });

  test('変換元を変更すると入力テキストがクリアされる（回帰テスト）', async ({ page }) => {
    const fromGroup = page.getByRole('group', { name: '変換元フォーマット' });

    // JSON テキストを入力
    const inputTextarea = page.getByLabel(/^JSON/);
    await inputTextarea.fill('{"host":"localhost"}');

    // 変換元を YAML に切り替え
    await fromGroup.getByRole('button', { name: 'YAML' }).click();

    // 入力がクリアされること
    await expect(page.getByLabel('YAML (整形)')).toHaveValue('');
  });

  test('JSON Schema 検証パネル: 本番相当 CSP 下でも検証が成功し違反が出ない（リグレッション防止）', async ({
    browser,
  }) => {
    // 過去に Ajv (`new Function` JIT) を採用していた時期は本ボタンが
    // 本番 (Cloudflare Pages) で `unsafe-eval` 違反となり機能不全に陥ったが、
    // dev server は _headers を読まないため CI が素通りしていた。
    // 本テストは PRODUCTION_CSP を Playwright で注入することで同種の事故を
    // CI で検知する。詳細は docs/decisions.md [061] 参照。
    //
    // 注意: describe の `context` / `page` fixture (baseURL 設定) では Astro
    // dev server 経路で page.route の介入が成立しない事象を確認したため、
    // browser.newContext() で完全に新規のコンテキストを作る。これにより
    // applyProductionCsp の route 注入が初回ナビゲーションから確実に効く。
    // （後続の meta-test「applyProductionCsp は実際に CSP 違反を捕捉する」が
    //   ゲート自体の動作を陽性対照で保証する）
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      await page.goto('/tools/config-converter');
      await page.getByLabel('JSON').waitFor();
      await waitForReactHydration(page);

      // 出力が同 JSON になるよう to=JSON にしてから入力 → 検証
      await page
        .getByRole('group', { name: '変換先フォーマット' })
        .getByRole('button', { name: 'JSON' })
        .click();

      await page.getByLabel('JSON (整形)').fill('{"name": "太郎", "age": 30}');
      await expect(page.getByLabel('JSON', { exact: true })).not.toHaveValue('');

      await page.getByRole('button', { name: 'JSON Schema で検証する' }).click();
      await page
        .getByLabel('JSON Schema (貼り付け)')
        .fill(
          '{"type": "object", "required": ["name", "age"], "properties": {"name": {"type": "string"}, "age": {"type": "number"}}}'
        );

      await page.getByRole('button', { name: '検証する', exact: true }).click();

      await expect(page.getByText('スキーマ検証成功')).toBeVisible();
      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });

  test('applyProductionCsp は実際に CSP 違反を捕捉する（ゲート自体の動作確認）', async ({
    browser,
  }) => {
    // helper の組み合わせが将来壊れたとき「ゲートが空回りしているのに green」
    // になる事故を防ぐメタテスト。意図的に CSP 違反を発生させ guard.violations
    // が確実に増えることを確認する。
    //
    // 設計メモ:
    // - browser から新規 context + 新規 page を作る。describe の beforeEach は
    //   default page fixture を使うため、本テストはそれと完全に独立させる。
    // - page.evaluate(() => eval(...)) は Playwright が CDP Runtime.evaluate
    //   経由でコードを評価するため CSP `unsafe-eval` を回避してしまう。代わりに
    //   「外部 origin の <script src>」を DOM に挿入する経路で違反を起こす。
    //   PRODUCTION_CSP は `script-src 'self' 'unsafe-inline'` のため
    //   example.com の外部スクリプトは確実に block され Chromium が
    //   "Refused to load the script ... because it violates the following
    //    Content Security Policy directive ..." を console error に出す。
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      const response = await page.goto('/tools/config-converter');
      // 前提検証: route 注入によって本番 CSP がレスポンスヘッダに乗っていること
      expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = 'https://example.com/violates-csp.js';
        document.head.appendChild(script);
      });
      await expect.poll(() => guard.violations.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test('JSON Schema 検証パネル: Cmd/Ctrl+Enter でスキーマ検証が実行される', async ({ page }) => {
    // from=JSON, to=JSON（同一のとき "JSON (整形)" ラベル）にセット
    // デフォルトが from=JSON なので to=JSON になるよう設定
    const toGroup = page.getByRole('group', { name: '変換先フォーマット' });
    await toGroup.getByRole('button', { name: 'JSON' }).click();

    // JSON を入力して出力を得る
    const inputTextarea = page.getByLabel('JSON (整形)');
    await inputTextarea.fill('{"name":"Alice","age":30}');

    // 出力が更新されるまで待機
    await expect(page.getByLabel('JSON', { exact: true })).toHaveValue(/"name"/);

    // スキーマパネルを開く
    await page.getByRole('button', { name: /json schema/i }).click();

    // スキーマを入力
    const schemaTextarea = page.getByLabel(/json schema/i);
    await schemaTextarea.fill(
      JSON.stringify({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      })
    );

    // スキーマ textarea にフォーカスした状態で Cmd/Ctrl+Enter
    await schemaTextarea.focus();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Enter`);

    // 検証成功メッセージが表示されること
    await expect(page.getByText('スキーマ検証成功')).toBeVisible();
  });
});
