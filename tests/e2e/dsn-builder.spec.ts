import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

const PG_URI = 'postgresql://app:s3cret@db.example.com:5432/app_db?sslmode=require';

test.describe('DSN/接続文字列ビルダ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/dsn-builder');
    // fill → React onChange パースが hydration 完了前に走ると DOM のみ更新され
    // flaky になるため、island の hydration 完了を待つ (issue #750)
    await waitForReactHydration(page);
  });

  test('URI 貼り付けでフォームに分解される', async ({ page }) => {
    await page.getByLabel('接続 URI').fill(PG_URI);
    await expect(page.getByLabel('ユーザー名')).toHaveValue('app');
    await expect(page.getByLabel('パスワード')).toHaveValue('s3cret');
    await expect(page.getByLabel('ホスト 1', { exact: true })).toHaveValue('db.example.com');
    await expect(page.getByLabel('ポート 1', { exact: true })).toHaveValue('5432');
    await expect(page.getByLabel('データベース名')).toHaveValue('app_db');
    await expect(page.getByLabel('パラメータ名 1')).toHaveValue('sslmode');
    await expect(page.getByLabel('パラメータ値 1')).toHaveValue('require');
  });

  test('フォーム編集が URI に反映される（記号は percent-encode）', async ({ page }) => {
    await page.getByLabel('接続 URI').fill(PG_URI);
    await page.getByLabel('パスワード').fill('p@ss/w0rd');
    await expect(page.getByLabel('接続 URI')).toHaveValue(
      'postgresql://app:p%40ss%2Fw0rd@db.example.com:5432/app_db?sslmode=require'
    );
  });

  test('マスク済み URI が表示されコピーできる', async ({ page }) => {
    await page.getByLabel('接続 URI').fill(PG_URI);
    await expect(page.getByLabel('マスク済み URI（共有用）')).toHaveValue(
      'postgresql://app:****@db.example.com:5432/app_db?sslmode=require'
    );
  });

  test('サンプルを入力ボタンで現在スキームのサンプルが入る', async ({ page }) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.getByLabel('接続 URI')).not.toHaveValue('');
    await expect(page.getByLabel('ホスト 1', { exact: true })).toHaveValue('db.example.com');
  });

  test('陽性対照: 未対応スキームでエラーが表示される', async ({ page }) => {
    const uriField = page.getByLabel('接続 URI');
    await uriField.fill('oracle://user:pass@host:1521/SID');
    // onChange → parseDsn → setError のサイクルが完了するまで待機
    await expect(uriField).toHaveValue('oracle://user:pass@host:1521/SID');
    await expect(page.getByRole('alert')).toContainText('未対応のスキーム');
  });

  test('陽性対照: mongodb+srv にポートを指定するとエラーが表示される', async ({ page }) => {
    await page.getByLabel('接続 URI').fill('mongodb+srv://u:p@cluster0.example.net:27017/db');
    await expect(page.getByRole('alert')).toContainText('ポート');
  });

  test('mongodb 複数ホストでホスト行が追加表示される', async ({ page }) => {
    await page
      .getByLabel('接続 URI')
      .fill('mongodb://admin:s3cret@mongo1.example.com:27017,mongo2.example.com:27018/app_db');
    await expect(page.getByLabel('ホスト 2', { exact: true })).toHaveValue('mongo2.example.com');
    await expect(page.getByLabel('ポート 2', { exact: true })).toHaveValue('27018');
  });

  test('複数ホスト→単一ホストスキーム切替で 2 件目以降が自動で除去されエラーが出ない', async ({
    page,
  }) => {
    await page
      .getByLabel('接続 URI')
      .fill('mongodb://admin:s3cret@mongo1.example.com:27017,mongo2.example.com:27018/app_db');
    await expect(page.getByLabel('ホスト 2', { exact: true })).toHaveValue('mongo2.example.com');

    await page.getByLabel('スキーム').selectOption('mysql');

    // 2 件目のホスト行が消え、エラーは出ず URI が単一ホストで再生成される
    await expect(page.getByLabel('ホスト 2', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel('接続 URI')).toHaveValue(
      'mysql://admin:s3cret@mongo1.example.com:27017/app_db'
    );
  });

  test('JDBC URL を貼り付けると user/password プロパティがフォームに分解される', async ({
    page,
  }) => {
    await page
      .getByLabel('接続 URI')
      .fill(
        'jdbc:postgresql://db.example.com:5432/app_db?user=app&password=s3cret&sslmode=require'
      );
    await expect(page.getByLabel('ユーザー名')).toHaveValue('app');
    await expect(page.getByLabel('パスワード')).toHaveValue('s3cret');
    await expect(page.getByLabel('ホスト 1', { exact: true })).toHaveValue('db.example.com');
    await expect(page.getByLabel('データベース名')).toHaveValue('app_db');
    // credential は params から除去され、残りのみ表示される
    await expect(page.getByLabel('パラメータ名 1')).toHaveValue('sslmode');
    await expect(page.getByLabel('パラメータ値 1')).toHaveValue('require');
  });

  test('JDBC スキームではフォーム編集が credential を property として URI 化する', async ({
    page,
  }) => {
    await page.getByLabel('スキーム').selectOption('jdbc:mysql');
    await page.getByLabel('ユーザー名').fill('root');
    await page.getByLabel('パスワード').fill('p@ss/w0rd');
    await page.getByLabel('ホスト 1', { exact: true }).fill('db.example.com');
    await page.getByLabel('ポート 1', { exact: true }).fill('3306');
    await page.getByLabel('データベース名').fill('app_db');
    await expect(page.getByLabel('接続 URI')).toHaveValue(
      'jdbc:mysql://db.example.com:3306/app_db?user=root&password=p%40ss%2Fw0rd'
    );
  });

  test('JDBC のマスク済み URI は password プロパティのみ伏せる', async ({ page }) => {
    await page
      .getByLabel('接続 URI')
      .fill('jdbc:postgresql://db.example.com:5432/app_db?user=app&password=s3cret');
    await expect(page.getByLabel('マスク済み URI（共有用）')).toHaveValue(
      'jdbc:postgresql://db.example.com:5432/app_db?user=app&password=****'
    );
  });

  test('ポート入力済み→mongodb+srv 切替でポートが自動クリアされエラーが出ない', async ({
    page,
  }) => {
    await page.getByLabel('接続 URI').fill('mongodb://admin:s3cret@cluster0.example.net:27017/db');
    await expect(page.getByLabel('ポート 1', { exact: true })).toHaveValue('27017');

    await page.getByLabel('スキーム').selectOption('mongodb+srv');

    await expect(page.getByLabel('ポート 1', { exact: true })).toHaveValue('');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel('接続 URI')).toHaveValue(
      'mongodb+srv://admin:s3cret@cluster0.example.net/db'
    );
  });
});
