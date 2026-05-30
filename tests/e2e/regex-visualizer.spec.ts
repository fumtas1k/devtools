import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';
import { ATTACK_STRING_DISPLAY_MAX } from '../../src/utils/regex-visualizer/format';

test.describe('正規表現ビジュアライザ', () => {
  test('フラグの凡例が表示される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await expect(page.getByText('大小区別なし')).toBeVisible();
    });
  });

  // a11y 回帰ガード: フラグボタンの aria-label / title（説明）付与を検証。
  // 属性が外れる（旧実装相当）と name 解決・属性 assert が fail する陽性対照を兼ねる。
  test('フラグボタンに説明の aria-label / title が付与される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      const iFlag = page.getByRole('button', { name: 'i: 大文字小文字を区別しない' });
      await expect(iFlag).toBeVisible();
      await expect(iFlag).toHaveAttribute('title', '大文字小文字を区別しない');
    });
  });

  test('有効な正規表現で構造ツリーが表示される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(ab)+');
      await expect(page.getByText(/1 回以上の繰り返し/)).toBeVisible();
    });
  });

  test('脆弱な正規表現で危険判定と攻撃文字列が出る（CSP 下で checkSync 動作）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(a+)+$');
      // ReDoS 判定セクション内の「脆弱：ReDoS のリスク」テキスト（ページ説明文の「脆弱性」と区別）
      await expect(
        page.getByRole('region', { name: 'ReDoS 判定' }).getByText(/脆弱：ReDoS/)
      ).toBeVisible();
      // ボタンのアクセシブル名は説明的な「攻撃文字列をコピー」（aria-label）のまま、
      // 可視テキストはスマホ向けに「コピー」へ短縮されていること（label/ariaLabel 分離の陽性対照）
      const copyBtn = page
        .getByRole('region', { name: 'ReDoS 判定' })
        .getByRole('button', { name: '攻撃文字列をコピー', exact: true });
      await expect(copyBtn).toBeVisible();
      await expect(copyBtn).toHaveText('コピー');
    });
  });

  // issue #500 の回帰ガード（陽性対照）: 多項式時間で長大な pump 攻撃文字列を返すパターンで、
  // 表示が ATTACK_STRING_DISPLAY_MAX 文字 + 省略記号へ truncate されること。
  // truncate を外した旧実装では textContent が数千文字になりこの上限 assert が fail する。
  test('長大な攻撃文字列は表示が truncate される（#500）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(\\w+)@(\\w+)');
      const region = page.getByRole('region', { name: 'ReDoS 判定' });
      // 多項式時間で脆弱判定されるまで待つ
      await expect(region.getByText(/脆弱：ReDoS/)).toBeVisible();
      // 表示用 <code> の文字数が上限近傍（先頭 N 文字 + 省略記号「…」の 1 文字）に収まる
      const code = region.locator('code');
      await expect
        .poll(async () => ((await code.textContent()) ?? '').length)
        .toBeLessThanOrEqual(ATTACK_STRING_DISPLAY_MAX + 1);
      // truncate 発生時の文字数キャプションが表示される
      await expect(region.getByText(/全 \d+ 文字/)).toBeVisible();
      // 全文取得用のコピーボタンは従来どおり存在する（アクセシブル名は説明的・可視は短縮）
      const copyBtn = region.getByRole('button', { name: '攻撃文字列をコピー', exact: true });
      await expect(copyBtn).toBeVisible();
      await expect(copyBtn).toHaveText('コピー');
    });
  });

  test('安全な正規表現で安全判定が出る', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('^[a-z]+$');
      // ReDoS 判定セクション内の「安全：」テキスト
      await expect(
        page.getByRole('region', { name: 'ReDoS 判定' }).getByText(/安全：/)
      ).toBeVisible();
    });
  });

  test('不正な正規表現でエラーが出る', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(');
      // ErrorMessage コンポーネントは role="alert" で描画される
      const alert = page.getByRole('alert').first();
      await expect(alert).toBeVisible();
      // #489: engine の英語メッセージそのままではなく日本語見出しで表示される
      await expect(alert).toContainText('正規表現が不正です');
      await expect(alert).not.toContainText('Invalid regular expression:');
    });
  });

  test('鉄道図タブに切り替えると SVG が表示される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(abc)');
      await expect(page.getByText('キャプチャグループ #1')).toBeVisible(); // 構造ツリー側で解析完了を待つ
      await page.getByRole('button', { name: '鉄道図' }).click();
      await expect(page.getByRole('img', { name: '正規表現の鉄道図' })).toBeVisible();
    });
  });

  test('選択肢 a|b|c が鉄道図で分岐表示される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('a|b|c');
      await expect(page.getByText('選択肢 (|)').first()).toBeVisible(); // 構造ツリー側で解析完了を待つ（a|b|c は Disjunction が2段ネストするため複数要素に解決される）
      await page.getByRole('button', { name: '鉄道図' }).click();
      await expect(page.getByRole('img', { name: '正規表現の鉄道図' })).toBeVisible();
    });
  });

  test('量指定子 a+ が鉄道図で表示される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('a+b');
      await expect(page.getByText(/1 回以上の繰り返し/)).toBeVisible(); // 構造ツリーで解析完了待ち
      await page.getByRole('button', { name: '鉄道図' }).click();
      await expect(page.getByRole('img', { name: '正規表現の鉄道図' })).toBeVisible();
    });
  });

  test('safe な正規表現でマッチが集計される（g なし=1件 + ヒント）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('\\d+');
      await page.getByLabel('テスト文字列').fill('a1 b22 c333');
      await expect(page.getByText(/1 件マッチ/)).toBeVisible();
      await expect(page.getByText(/g フラグを付けると/)).toBeVisible();
    });
  });

  test('g フラグありで全マッチが集計される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('\\d+');
      await page.getByRole('button', { name: 'g: 全マッチ（グローバル）' }).click();
      await page.getByLabel('テスト文字列').fill('a1 b22 c333');
      await expect(page.getByText(/3 件マッチ/)).toBeVisible();
    });
  });

  // ReDoS ゲートの陽性対照（本番 CSP 下・実 recheck 経路）: 既知の脆弱パターンで
  // マッチ実行が無効化されることを確認する。ゲートが空回りすると入力欄が出てこの assert が落ちる。
  test('vulnerable な正規表現ではマッチ実行が無効化される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(a+)+$');
      await expect(page.getByText(/マッチ実行を無効化/)).toBeVisible();
    });
  });
});
