import { test, expect, type Locator, type Page } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('日本語ダミー個人データ生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/dummy-personal-data');
    // click → React handler が hydration 完了前に走ると無反応になり
    // flaky になるため、island の hydration 完了を待つ (issue #750)
    await waitForReactHydration(page);
  });

  test('生成するとプレビュー表が表示される', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText('生成しました');
    // ヘッダに氏名列
    await expect(page.getByRole('columnheader', { name: '氏名' })).toBeVisible();
    // 先頭行が存在
    const rows = page.getByRole('row');
    expect(await rows.count()).toBeGreaterThan(1);
  });

  test('項目 OFF でプレビュー列が消える', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('columnheader', { name: 'メールアドレス' })).toBeVisible();
    await page.getByRole('button', { name: 'メールアドレス' }).click(); // ToggleChips OFF
    await expect(page.getByRole('columnheader', { name: 'メールアドレス' })).toHaveCount(0);
  });

  test('生成前はダウンロードが無効', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'ダウンロード' })).toBeDisabled();
  });

  test('連番ID列トグルでプレビューに No. 列が出る', async ({ page }) => {
    await page.getByRole('button', { name: '連番ID列 (No.)' }).click();
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('columnheader', { name: 'No.' })).toBeVisible();
  });

  test('一意化トグルでメールが重複しない', async ({ page }) => {
    await page.getByRole('button', { name: 'メール・電話番号を一意化' }).click();
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText('生成しました');
    // プレビュー（先頭 20 件）のメール列セルを集めて重複がないことを確認
    const cells = await page.getByRole('cell').filter({ hasText: '@example.' }).allInnerTexts();
    expect(cells.length).toBeGreaterThan(1);
    expect(new Set(cells).size).toBe(cells.length);
  });

  test('セクション見出し「生成条件」「出力の見せ方」が表示される', async ({ page }) => {
    await expect(page.getByText('生成条件', { exact: true })).toBeVisible();
    await expect(page.getByText('出力の見せ方', { exact: true })).toBeVisible();
  });

  test('生成条件を変更すると未反映インジケータが出て、再生成で消える', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText('生成しました');
    // 陰性対照: 生成直後は出ていない
    await expect(page.getByText('生成条件が変更されました。再生成してください')).toHaveCount(0);

    // 陽性対照: 生成条件（人数）を変更すると出る
    const count = page.getByLabel('出力する人数');
    await count.fill('200');
    await count.blur();
    await expect(page.getByText('生成条件が変更されました。再生成してください')).toBeVisible();

    // 陰性対照: 再生成すると消える
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByText('生成条件が変更されました。再生成してください')).toHaveCount(0);
  });

  test('即時反映トグル（連番ID列）では未反映インジケータが出ない', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText('生成しました');
    // 出力の見せ方トグルは即時反映なので stale にならない
    await page.getByRole('button', { name: '連番ID列 (No.)' }).click();
    await expect(page.getByRole('columnheader', { name: 'No.' })).toBeVisible();
    await expect(page.getByText('生成条件が変更されました。再生成してください')).toHaveCount(0);
  });

  // 操作行のボタンサイズ回帰（issue #915、docs/decisions.md [168]）。クラス名ではなく実寸で見る。
  // 生成・ダウンロードは compact（36px）、トグル内部ボタンは sm（28px）、トグル外枠は 28px + 余白と枠で 38px。
  test.describe('操作行のボタンサイズ', () => {
    const BUTTON_HEIGHT = 36;
    const TOGGLE_BUTTON_HEIGHT = 28;
    const TOGGLE_GROUP_HEIGHT = 38;

    async function measureOperationRow(page: Page) {
      const box = async (loc: Locator) => {
        const b = await loc.boundingBox();
        if (b === null) throw new Error('要素の boundingBox を取得できません');
        return { height: b.height, top: b.y, bottom: b.y + b.height, centerY: b.y + b.height / 2 };
      };
      return {
        generate: await box(page.getByRole('button', { name: '生成', exact: true })),
        download: await box(page.getByRole('button', { name: 'ダウンロード' })),
        csv: await box(page.getByRole('button', { name: 'CSV', exact: true })),
        json: await box(page.getByRole('button', { name: 'JSON', exact: true })),
        group: await box(page.getByRole('group', { name: '出力形式' })),
      };
    }

    type Row = Awaited<ReturnType<typeof measureOperationRow>>;

    function expectButtonHeights(row: Row) {
      expect(row.generate.height).toBeCloseTo(BUTTON_HEIGHT, 0);
      expect(row.download.height).toBeCloseTo(BUTTON_HEIGHT, 0);
      expect(row.csv.height).toBeCloseTo(TOGGLE_BUTTON_HEIGHT, 0);
      expect(row.json.height).toBeCloseTo(TOGGLE_BUTTON_HEIGHT, 0);
      // ボタン本体と別に、トグル外枠（グループ）の高さを検証する
      expect(row.group.height).toBeCloseTo(TOGGLE_GROUP_HEIGHT, 0);
      // 生成とダウンロードは同じ高さ
      expect(Math.abs(row.generate.height - row.download.height)).toBeLessThanOrEqual(0.5);
    }

    function expectCenterAligned(a: { centerY: number }, b: { centerY: number }) {
      expect(Math.abs(a.centerY - b.centerY)).toBeLessThanOrEqual(1);
    }

    // PC: 4 要素すべてが 1 行に並び、上下中央がそろう
    function expectSameRowCenters(row: Row) {
      const centers = [
        row.generate.centerY,
        row.download.centerY,
        row.csv.centerY,
        row.json.centerY,
        row.group.centerY,
      ];
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
    }

    // スマホ: ダウンロードは折り返す。生成・トグルは同じ行に残り中央がそろう
    function expectMobileLayout(row: Row) {
      expectCenterAligned(row.generate, row.csv);
      expectCenterAligned(row.generate, row.json);
      expectCenterAligned(row.generate, row.group);
      // ダウンロードは次の行（トグル外枠の下端より下）に折り返している
      expect(row.download.top).toBeGreaterThanOrEqual(row.group.bottom);
      expect(row.download.centerY).toBeGreaterThan(row.generate.centerY);
    }

    async function switchToJson(page: Page) {
      await page.getByRole('button', { name: 'JSON', exact: true }).click();
      await expect(page.getByRole('button', { name: 'JSON', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    }

    for (const viewport of [
      { name: 'PC', width: 1280, height: 800, expectLayout: expectSameRowCenters },
      { name: 'スマホ', width: 390, height: 844, expectLayout: expectMobileLayout },
    ]) {
      test(`${viewport.name}: 生成前後・形式切替後も寸法が保たれ、レイアウトが崩れない`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        // 生成前（ダウンロード disabled）
        await expect(page.getByRole('button', { name: 'ダウンロード' })).toBeDisabled();
        const before = await measureOperationRow(page);
        expectButtonHeights(before);
        viewport.expectLayout(before);

        // 生成後（ダウンロード enabled、CSV のまま）
        await page.getByRole('button', { name: '生成', exact: true }).click();
        await expect(page.getByRole('button', { name: 'ダウンロード' })).toBeEnabled();
        const after = await measureOperationRow(page);
        expectButtonHeights(after);
        viewport.expectLayout(after);

        // CSV → JSON 切替後
        await switchToJson(page);
        const json = await measureOperationRow(page);
        expectButtonHeights(json);
        viewport.expectLayout(json);
      });
    }
  });
});
