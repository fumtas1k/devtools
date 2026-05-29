import { test, expect, devices } from '@playwright/test';
import { withProductionCsp, waitForReactHydration } from './helpers';

test.describe('JSON整形・ビューア（production CSP 適用）', () => {
  test('サンプルを整形し、大きな整数の精度を保持する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      const output = page.getByRole('textbox', { name: '整形結果' });
      await expect(output).toHaveValue(/"name": "東京タワー"/);
      // 整形（2スペース）でインデントされる
      await expect(output).toHaveValue(/\n {2}"name"/);
      // 大きな整数が欠落しない（JS number 化なら 1234567890123456800 になる）
      await expect(output).toHaveValue(/1234567890123456789/);
    });
  });

  test('最小化モードで空白を除去する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill('{\n  "a": 1,\n  "b": [2, 3]\n}');
      await page.getByRole('button', { name: '最小化' }).click();
      await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue(
        '{"a":1,"b":[2,3]}'
      );
    });
  });

  test('インデントを4スペースに変更できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill('{"a":1}');
      await page.getByRole('button', { name: '4', exact: true }).click();
      await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue('{\n    "a": 1\n}');
    });
  });

  // 陽性対照（E2E）: 不正 JSON は行・列付きのエラーとして表示される。
  // 検知が空回りしていれば alert が出ず fail する。
  test('不正な JSON を行・列付きエラーで表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill('{"a":}');
      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible();
      await expect(alert).toContainText('行');
      await expect(alert).toContainText('列');
    });
  });

  test('ツリー表示に切り替えてキー・値を表示し、折りたたみ/展開できる（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await page.getByRole('button', { name: 'ツリー' }).click();

      const tree = page.getByRole('group', { name: 'JSON ツリー' });
      await expect(tree).toBeVisible();
      await expect(tree.getByText('"name"')).toBeVisible();
      await expect(tree.getByText('東京タワー')).toBeVisible();

      // 全折りたたみで子が隠れ、折りたたみサマリ（項目数）が出る
      await page.getByRole('button', { name: '全折りたたみ' }).click();
      await expect(tree.getByText('"name"')).toHaveCount(0);
      await expect(tree.getByText(/項目/)).toBeVisible();

      // 全展開で再び子が見える
      await page.getByRole('button', { name: '全展開' }).click();
      await expect(tree.getByText('"name"')).toBeVisible();
    });
  });

  test('クエリ抽出: ナビゲーションで値を取り出す（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await page.getByLabel('クエリ (JMESPath)').fill('location.lat');
      await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue('35.6586');
    });
  });

  // 陽性対照（CSP）: フィルタ式（式評価を伴う）を実行しても CSP 違反が出ないこと。
  // eval/Function を使うエンジンに差し替えると withProductionCsp の guard が違反を検知して fail する。
  test('クエリ抽出: フィルタ式が production CSP 下で動く（eval 非使用の証明）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page
        .getByLabel('入力')
        .fill('{"items":[{"name":"A","price":5},{"name":"B","price":20}]}');
      await page.getByLabel('クエリ (JMESPath)').fill('items[?price > `10`].name');
      await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue(/"B"/);
      // withProductionCsp が fn 終了後に guard.assertNoViolations() を実行する。
    });
  });

  test('クエリ抽出: 不正式はクエリ欄下にエラー表示（入力エラーと分離・CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill('{"a":1}');
      await page.getByLabel('クエリ (JMESPath)').fill('items[?(');
      await expect(page.getByRole('alert')).toContainText('クエリ式が不正です');
      // #510: クエリ式エラー表示中も構文ヒントが消えず併存する
      await expect(
        page.getByText('JMESPath 構文（フィルタ・射影対応）', { exact: false })
      ).toBeVisible();
    });
  });

  test('クエリ抽出: クエリを空にすると全体表示に戻る（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      const query = page.getByLabel('クエリ (JMESPath)');
      await query.fill('location.lat');
      await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue('35.6586');
      await query.fill('');
      await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue(
        /"name": "東京タワー"/
      );
    });
  });

  test('クエリ抽出: 入力 JSON が不正な間はクエリ欄で修正を案内（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill('{ broken');
      await page.getByLabel('クエリ (JMESPath)').fill('location.lat');
      await expect(page.getByText('入力 JSON を修正するとクエリを実行できます')).toBeVisible();
    });
  });

  // 陽性対照（最重要）: マスク後に原値が DOM に一切残らないこと。
  // 検知が空回り（無変換）なら原値が残り fail する。
  test('マスク: 機密値を伏字化し原値が画面に出ない（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill('{"mail":"taro@example.com","password":"hunter2"}');
      await page.getByRole('button', { name: 'マスク' }).click();

      const out = page.getByRole('textbox', { name: 'マスク済み結果' });
      await expect(out).toHaveValue(/\[REDACTED:EMAIL\]/);
      await expect(out).toHaveValue(/\[REDACTED:SECRET\]/);
      // 原値が出力に残っていない（検知が空回りなら fail）
      await expect(out).not.toHaveValue(/taro@example\.com/);
      await expect(out).not.toHaveValue(/hunter2/);
      // 検出内訳が出る
      await expect(page.getByText(/検出:/)).toBeVisible();
    });
  });

  test('マスク: 種別 off で該当種別が素通りする（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill('{"mail":"taro@example.com"}');
      await page.getByRole('button', { name: 'マスク' }).click();
      const out = page.getByRole('textbox', { name: 'マスク済み結果' });
      await expect(out).toHaveValue(/\[REDACTED:EMAIL\]/);
      // メール種別を外すと原値が戻る
      await page.getByRole('checkbox', { name: 'メール' }).uncheck();
      await expect(out).toHaveValue(/taro@example\.com/);
    });
  });

  // サンプルはマスクの意義が伝わるよう、検出対象を含む必要がある（役目の回帰ガード）。
  test('マスク: サンプルは検出対象を含む（メール・電話番号）（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await page.getByRole('button', { name: 'マスク' }).click();

      const out = page.getByRole('textbox', { name: 'マスク済み結果' });
      await expect(out).toHaveValue(/\[REDACTED:EMAIL\]/);
      await expect(out).toHaveValue(/\[REDACTED:PHONE_JP\]/);
      await expect(out).not.toHaveValue(/info@tokyo-tower\.jp/);
      await expect(page.getByText(/検出:/)).toBeVisible();
    });
  });

  // PC（md:flex-row）でマスクモードの入力欄と結果欄の textarea 上端が揃うことの回帰ガード。
  // 操作部が結果カラム内に積まれると上端がずれる（本 PR で修正した不具合）。
  test('マスク: PC で入力と結果の textarea 上端が揃う（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await page.getByRole('button', { name: 'マスク' }).click();

      const inputBox = await page.getByLabel('入力').boundingBox();
      const resultBox = await page.getByRole('textbox', { name: 'マスク済み結果' }).boundingBox();
      expect(inputBox).not.toBeNull();
      expect(resultBox).not.toBeNull();
      expect(Math.abs(inputBox!.y - resultBox!.y)).toBeLessThan(2);
    });
  });

  test('型生成: サンプルから TypeScript interface を生成する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await page.getByRole('button', { name: '型', exact: true }).click();

      const out = page.getByRole('textbox', { name: '生成された型' });
      await expect(out).toHaveValue(/interface Root \{/);
      await expect(out).toHaveValue(/name: string;/);
      await expect(out).toHaveValue(/open: boolean;/);
      // ネスト location が別 interface に切り出される
      await expect(out).toHaveValue(/interface Location \{/);
    });
  });

  test('型生成: クエリ抽出結果から型を生成する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill('{"items":[{"id":1,"name":"A"}]}');
      await page.getByLabel('クエリ (JMESPath)').fill('items');
      await page.getByRole('button', { name: '型', exact: true }).click();
      const out = page.getByRole('textbox', { name: '生成された型' });
      await expect(out).toHaveValue(/type Root = RootItem\[\];/);
      await expect(out).toHaveValue(/id: number;/);
    });
  });

  test('型生成: ダウンロードファイル名が types.ts（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await page.getByRole('button', { name: '型', exact: true }).click();
      await expect(page.getByRole('textbox', { name: '生成された型' })).toHaveValue(
        /interface Root/
      );

      // 型モードの DL は types.ts（JSON/マスクモードの data.json と区別）
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'ダウンロード' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('types.ts');
    });
  });

  // タッチ端末（hover 不可）ではツリー行のコピーアクションが hover で出せないため、
  // @media (hover: none) で常時表示する（issue #508）。モバイル端末を emulate して
  // .json-row-actions の opacity が 1 であることを確認する。旧 CSS（hover/focus のみ）
  // では opacity 0 のままで fail する回帰ガード。CSP 非依存のため独自 context で検証。
  test('ツリー: タッチ端末では行コピーアクションが常時表示される（issue #508）', async ({
    browser,
  }) => {
    const context = await browser.newContext({ ...devices['Pixel 5'] });
    try {
      const page = await context.newPage();
      await page.goto('/tools/json-formatter');
      await waitForReactHydration(page); // hydration 前のクリックは no-op になるため待つ
      // hover:none が効いていることを前提確認（emulation 健全性）
      expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);

      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await page.getByRole('button', { name: 'ツリー' }).click();
      await expect(page.getByRole('group', { name: 'JSON ツリー' })).toBeVisible();

      // hover していない状態でも行アクションが可視（opacity:1）かつタップ可能（pointer-events:auto）
      const style = await page
        .locator('.json-row-actions')
        .first()
        .evaluate((el) => {
          const s = getComputedStyle(el);
          return { opacity: s.opacity, pointerEvents: s.pointerEvents };
        });
      expect(style.opacity).toBe('1');
      expect(style.pointerEvents).toBe('auto');
    } finally {
      await context.close();
    }
  });

  test('ツリー: テキスト→ツリー切替で遅延構築されたツリーが表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      // テキスト表示の時点ではツリー group は構築されていない（遅延）
      await expect(page.getByRole('group', { name: 'JSON ツリー' })).toHaveCount(0);
      await page.getByRole('button', { name: 'ツリー' }).click();
      const tree = page.getByRole('group', { name: 'JSON ツリー' });
      await expect(tree).toBeVisible();
      await expect(tree.getByText('"name"')).toBeVisible();
    });
  });

  test('ツリー: 大入力はツリーを保留し、明示ボタンで表示する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      // 整形済み長 > 500KB になる大きな（しかし構造は単純な）JSON
      const big = '{"x":"' + 'a'.repeat(520000) + '"}';
      await page.getByLabel('入力').fill(big);
      await page.getByRole('button', { name: 'ツリー' }).click();

      // 自動構築は保留され、案内＋ボタンが出る
      await expect(page.getByText('ツリー描画を保留しています', { exact: false })).toBeVisible();
      await expect(page.getByRole('group', { name: 'JSON ツリー' })).toHaveCount(0);

      // 「ツリーを表示」で構築される
      await page.getByRole('button', { name: 'ツリーを表示' }).click();
      const tree = page.getByRole('group', { name: 'JSON ツリー' });
      await expect(tree).toBeVisible();
      await expect(tree.getByText('"x"')).toBeVisible();
    });
  });
});
