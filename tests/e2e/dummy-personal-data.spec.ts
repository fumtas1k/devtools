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
    await expect(page.getByRole('status')).toContainText('生成しました');
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
    await expect(page.getByRole('status')).toContainText('生成しました');
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
    await expect(page.getByRole('status')).toContainText('生成しました');
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
    await expect(page.getByRole('status')).toContainText('生成しました');
    // 出力の見せ方トグルは即時反映なので stale にならない
    await page.getByRole('button', { name: '連番ID列 (No.)' }).click();
    await expect(page.getByRole('columnheader', { name: 'No.' })).toBeVisible();
    await expect(page.getByText('生成条件が変更されました。再生成してください')).toHaveCount(0);
  });

  // 操作行のボタンサイズ回帰（issue #915）。クラス名ではなく実寸で見る。
  // 生成・ダウンロード・トグル内部ボタンは compact（36px）、トグル外枠は matchField の 48px。
  test.describe('操作行のボタンサイズ', () => {
    const BUTTON_HEIGHT = 36;
    const TOGGLE_GROUP_HEIGHT = 48;

    async function measureOperationRow(page: Page) {
      const box = async (loc: Locator) => {
        const b = await loc.boundingBox();
        if (b === null) throw new Error('要素の boundingBox を取得できません');
        return { height: b.height, centerY: b.y + b.height / 2 };
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
      expect(row.csv.height).toBeCloseTo(BUTTON_HEIGHT, 0);
      expect(row.json.height).toBeCloseTo(BUTTON_HEIGHT, 0);
      // ボタン本体と別に、トグル外枠（グループ）の高さを検証する
      expect(row.group.height).toBeCloseTo(TOGGLE_GROUP_HEIGHT, 0);
      // 生成とダウンロードは同じ高さ
      expect(Math.abs(row.generate.height - row.download.height)).toBeLessThanOrEqual(0.5);
    }

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

    test('PC: 生成前後・形式切替後も各ボタンが 36px で上下中央がそろう', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      // 生成前（ダウンロード disabled）
      await expect(page.getByRole('button', { name: 'ダウンロード' })).toBeDisabled();
      const before = await measureOperationRow(page);
      expectButtonHeights(before);
      expectSameRowCenters(before);

      // 生成後（ダウンロード enabled）
      await page.getByRole('button', { name: '生成', exact: true }).click();
      await expect(page.getByRole('button', { name: 'ダウンロード' })).toBeEnabled();
      const after = await measureOperationRow(page);
      expectButtonHeights(after);
      expectSameRowCenters(after);

      // CSV → JSON 切替後
      await page.getByRole('button', { name: 'JSON', exact: true }).click();
      await expect(page.getByRole('button', { name: 'JSON', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      const json = await measureOperationRow(page);
      expectButtonHeights(json);
      expectSameRowCenters(json);
    });

    test('スマホ: 生成前後・形式切替後も各ボタンが 36px で、生成はトグルと同じ行で中央がそろう', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });

      const before = await measureOperationRow(page);
      expectButtonHeights(before);
      // スマホ幅ではダウンロードが折り返すため、同じ行に残る生成・トグルだけで比べる
      expect(Math.abs(before.generate.centerY - before.csv.centerY)).toBeLessThanOrEqual(1);
      expect(Math.abs(before.generate.centerY - before.group.centerY)).toBeLessThanOrEqual(1);

      await page.getByRole('button', { name: '生成', exact: true }).click();
      await expect(page.getByRole('button', { name: 'ダウンロード' })).toBeEnabled();
      await page.getByRole('button', { name: 'JSON', exact: true }).click();
      const after = await measureOperationRow(page);
      expectButtonHeights(after);
      expect(Math.abs(after.generate.centerY - after.json.centerY)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.generate.centerY - after.group.centerY)).toBeLessThanOrEqual(1);
    });
  });
});
