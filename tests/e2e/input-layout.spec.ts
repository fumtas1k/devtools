import { test, expect, type Locator } from '@playwright/test';
import { waitForReactHydration } from './helpers';

/**
 * 入力欄の DADS 化（docs/decisions.md [143]）で残った表示の課題（#826、判断は [151]）。
 *
 * 陽性対照（いずれも変更前に戻すと失敗することを確認済み）:
 * - DSN ビルダー: スキームをユーザー名・パスワードと同じ 3 カラムに戻すと、長い選択肢が入りきらず fail
 * - ContrastMatrix: 削除ボタンを py-2 のみ（約 40px）に戻すと fail
 * - CharCount: 行の items-baseline を items-center / items-start にすると fail
 * - ToggleGroup: matchField を外すと（土台 46px）fail
 */

const box = (loc: Locator) =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height };
  });

for (const viewport of [
  { name: 'PC', width: 1280, height: 800 },
  { name: 'スマホ', width: 390, height: 844 },
]) {
  test.describe(`入力欄まわりの表示 (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('ContrastMatrix: 削除ボタンは 48px で、同じ行の入力欄と上端・下端がそろう', async ({
      page,
    }) => {
      await page.goto('/tools/contrast-matrix');
      await waitForReactHydration(page);
      const remove = await box(page.getByRole('button', { name: '削除' }).first());
      const input = await box(page.getByRole('textbox', { name: '色' }).first());
      expect(remove.height).toBeCloseTo(48, 0);
      expect(remove.top).toBeCloseTo(input.top, 0);
      expect(remove.bottom).toBeCloseTo(input.bottom, 0);
    });

    test('CharCount: 任意上限欄と「/」・件数のベースラインがそろう', async ({ page }) => {
      await page.goto('/tools/char-count');
      await waitForReactHydration(page);
      const limit = page.getByRole('spinbutton', { name: '任意上限' });
      const row = limit.locator('xpath=ancestor::div[contains(@class,"items-baseline")][1]');
      const result = await row.evaluate((rowEl) => {
        const input = rowEl.querySelector('input')!;
        const [current, slash] = Array.from(rowEl.querySelectorAll(':scope > span'));
        // 0 幅の inline-block を末尾に足すと、その下端が各 span のベースラインになる
        const baselineOf = (span: Element) => {
          const probe = document.createElement('i');
          probe.style.cssText = 'display:inline-block;width:0;height:0';
          span.appendChild(probe);
          const y = probe.getBoundingClientRect().bottom;
          probe.remove();
          return y;
        };
        return {
          currentBaseline: baselineOf(current),
          slashBaseline: baselineOf(slash),
          // 「/」の行ボックスの上端と、input 内の文字行の上端（枠 1px + 縦の余白 11px）の差
          slashTopFromInput: slash.getBoundingClientRect().top - input.getBoundingClientRect().top,
        };
      });
      expect(result.currentBaseline).toBeCloseTo(result.slashBaseline, 0);
      expect(result.slashTopFromInput).toBeCloseTo(12, 0);
    });

    test('SQL フォーマッタ: カンマ位置のトグルと SQL 方言のセレクトで上端・下端がそろう', async ({
      page,
    }) => {
      await page.goto('/tools/sql-formatter');
      await waitForReactHydration(page);
      const group = await box(page.getByRole('group', { name: 'カンマ位置' }));
      const select = await box(page.getByRole('combobox', { name: 'SQL 方言' }));
      expect(group.height).toBeCloseTo(48, 0);
      if (viewport.width >= 768) {
        expect(group.top).toBeCloseTo(select.top, 0);
        expect(group.bottom).toBeCloseTo(select.bottom, 0);
      }
    });
  });
}

test.describe('DSN ビルダー: スキームの選択中表示', () => {
  for (const width of [768, 1024, 1280]) {
    test(`幅 ${width}px: すべてのスキームの選択中表示が末尾まで入る`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/tools/dsn-builder');
      await waitForReactHydration(page);
      const select = page.getByLabel('スキーム');
      const values = await select.evaluate((el: HTMLSelectElement) =>
        Array.from(el.options).map((o) => o.value)
      );
      expect(values.length).toBeGreaterThan(5);
      for (const value of values) {
        await select.selectOption(value);
        const fit = await select.evaluate((el: HTMLSelectElement) => {
          const cs = getComputedStyle(el);
          const ctx = document.createElement('canvas').getContext('2d')!;
          ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const text = el.selectedOptions[0].text;
          const textWidth =
            ctx.measureText(text).width + parseFloat(cs.letterSpacing) * text.length;
          const available =
            el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          return { text, textWidth, available };
        });
        expect(fit.textWidth, `${fit.text} が ${fit.available}px に入る`).toBeLessThanOrEqual(
          fit.available
        );
      }
    });
  }
});

test.describe('ToggleGroup の matchField（入力欄・ボタンと横並び）', () => {
  test('日本語ダミーテキスト: 改行の「あり」/「なし」と間隔の入力欄で上端・下端がそろう', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/tools/dummy-text');
    await waitForReactHydration(page);
    await page.getByRole('button', { name: 'あり', exact: true }).click();
    const group = await box(page.getByRole('group', { name: '改行設定' }));
    const chunk = await box(page.locator('#chunk-size'));
    expect(group.height).toBeCloseTo(48, 0);
    expect(group.top).toBeCloseTo(chunk.top, 0);
    expect(group.bottom).toBeCloseTo(chunk.bottom, 0);
  });

  test('ダミー個人データ: 出力形式のトグルと「生成」ボタンで上端・下端がそろう', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/tools/dummy-personal-data');
    await waitForReactHydration(page);
    const group = await box(page.getByRole('group', { name: '出力形式' }));
    const generate = await box(page.getByRole('button', { name: '生成', exact: true }));
    expect(group.top).toBeCloseTo(generate.top, 0);
    expect(group.bottom).toBeCloseTo(generate.bottom, 0);
  });

  test('matchField を付けない ToggleGroup（md）は従来どおり 46px', async ({ page }) => {
    await page.goto('/tools/base64');
    await waitForReactHydration(page);
    const group = await box(page.getByRole('group').first());
    expect(group.height).toBeCloseTo(46, 0);
  });
});
