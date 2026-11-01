import { test, expect, type Page } from '@playwright/test';
import { withProductionCsp } from './helpers';

const expectedRows = [
  ['ネットワークアドレス', '192.168.1.0/24', 'ネットワークアドレスをコピー'],
  ['ブロードキャストアドレス', '192.168.1.255', 'ブロードキャストアドレスをコピー'],
  ['最初のホスト', '192.168.1.1', '最初のホストアドレスをコピー'],
  ['最後のホスト', '192.168.1.254', '最後のホストアドレスをコピー'],
  ['総アドレス数', '256', '総アドレス数をコピー'],
  ['利用可能ホスト数', '254', '利用可能ホスト数をコピー'],
  ['サブネットマスク', '255.255.255.0', 'サブネットマスクをコピー'],
  ['ワイルドカードマスク', '0.0.0.255', 'ワイルドカードマスクをコピー'],
  ['2 進表記', '11000000.10101000.00000001.00000000', '2 進表記をコピー'],
] as const;

async function prepareResult(page: Page, viewport: { width: number; height: number }) {
  // withProductionCsp は新しい context を作るため、その page に viewport を設定する。
  await page.setViewportSize(viewport);
  await page.getByLabel('CIDR', { exact: true }).fill('192.168.1.0/24');
  const result = page.getByRole('region', { name: '計算結果' });
  await expect(result).toBeVisible();
  const rows = result.locator('dl > div');
  await expect(rows).toHaveCount(expectedRows.length);
  for (const [index, [label, value, copyLabel]] of expectedRows.entries()) {
    const row = rows.nth(index);
    await expect(row.locator('dt')).toHaveText(label);
    await expect(row.locator('dd')).toHaveCount(1);
    await expect(row.locator('dd > span')).toHaveText(value);
    await expect(row.getByRole('button', { name: copyLabel, exact: true })).toHaveCount(1);
  }
  await page.evaluate(() => document.fonts.ready);
  return result;
}

// 一度の evaluate で全要素を計測し、折り返した値も span 全体の矩形で扱う。
async function layoutViolations(page: Page, desktop: boolean): Promise<string[]> {
  return page.getByRole('region', { name: '計算結果' }).evaluate((region, isDesktop) => {
    const violations: string[] = [];
    const rows = Array.from(region.querySelectorAll('dl > div'));
    if (rows.length !== 9) violations.push(`rows: expected 9, got ${rows.length}`);
    rows.forEach((row, index) => {
      const elements = [
        row,
        row.querySelector('dt'),
        row.querySelector('dd'),
        row.querySelector('dd > span'),
        row.querySelector('dd > button'),
      ];
      const names = ['row', 'dt', 'dd', 'value', 'button'];
      const rects = elements.map((element, i) => {
        if (!element) {
          violations.push(`${index}:${names[i]} missing`);
          return null;
        }
        const rect = element.getBoundingClientRect();
        if (
          ![rect.left, rect.right, rect.top, rect.bottom, rect.width, rect.height].every(
            Number.isFinite
          ) ||
          rect.width <= 0 ||
          rect.height <= 0
        ) {
          violations.push(`${index}:${names[i]} invalid rectangle`);
          return null;
        }
        return rect;
      });
      const [rowRect, dt, dd, value, button] = rects;
      if (!rowRect || !dt || !dd || !value || !button) return;
      const centerY = (rect: DOMRect) => (rect.top + rect.bottom) / 2;
      if (Math.abs(centerY(value) - centerY(button)) > 1)
        violations.push(`${index}:value-copy-center`);
      if (value.right > button.left + 1) violations.push(`${index}:value-copy-order`);
      for (const [name, rect] of [
        ['dt', dt],
        ['dd', dd],
        ['value', value],
        ['button', button],
      ] as const) {
        if (
          rect.left < rowRect.left - 1 ||
          rect.right > rowRect.right + 1 ||
          rect.left < -1 ||
          rect.right > window.innerWidth + 1
        ) {
          violations.push(`${index}:${name}-containment`);
        }
      }
      if (rowRect.left < -1 || rowRect.right > window.innerWidth + 1)
        violations.push(`${index}:row-containment`);
      if (isDesktop) {
        if (Math.abs(centerY(dt) - centerY(dd)) > 1)
          violations.push(`${index}:label-definition-center`);
        if (dt.right > dd.left + 1) violations.push(`${index}:label-definition-order`);
      } else {
        if (dt.bottom > dd.top + 1) violations.push(`${index}:label-definition-stack`);
        if (Math.abs(dt.left - dd.left) > 1 || Math.abs(dt.left - value.left) > 1)
          violations.push(`${index}:left-alignment`);
      }
    });
    return violations;
  }, desktop);
}

for (const [name, viewport, desktop] of [
  ['PC', { width: 1280, height: 800 }, true],
  ['スマホ', { width: 390, height: 844 }, false],
] as const) {
  test(`${name}: 入力後のネットワーク情報の各行が整列する`, async ({ browser }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      await prepareResult(page, viewport);
      await expect.poll(() => layoutViolations(page, desktop)).toEqual([]);
    });
  });

  test(`${name}: 旧配置を行の整列違反として検出する（陽性対照）`, async ({ browser }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      const result = await prepareResult(page, viewport);
      const row = result.locator('dl > div').first();
      const original = await row.evaluate((element) => {
        const dd = element.querySelector('dd');
        if (!dd) throw new Error('dd がない');
        return { row: element.getAttribute('class') ?? '', dd: dd.className };
      });
      try {
        await row.evaluate((element) => {
          const dd = element.querySelector('dd');
          if (!dd) throw new Error('dd がない');
          if (
            !element.classList.replace('md:items-center', 'md:items-start') ||
            !dd.classList.replace('items-center', 'items-start')
          )
            throw new Error('旧配置への変更に失敗');
        });
        const alignment = await row.evaluate((element) => ({
          row: getComputedStyle(element).alignItems,
          dd: getComputedStyle(element.querySelector('dd')!).alignItems,
        }));
        expect(alignment.dd).toBe('flex-start');
        if (desktop) expect(alignment.row).toBe('flex-start');
        await expect.poll(() => layoutViolations(page, desktop)).toContain('0:value-copy-center');
        if (desktop)
          await expect
            .poll(() => layoutViolations(page, desktop))
            .toContain('0:label-definition-center');
      } finally {
        await row.evaluate((element, classes) => {
          element.setAttribute('class', classes.row);
          const dd = element.querySelector('dd');
          if (!dd) throw new Error('dd がない');
          dd.className = classes.dd;
        }, original);
      }
    });
  });
}

test.describe('CIDR/サブネット計算機（production CSP 適用）', () => {
  test('計算モード: 有効な CIDR を入力するとネットワーク情報が表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      await page.getByLabel('CIDR').fill('192.168.1.0/24');
      await expect(page.getByRole('heading', { name: 'ネットワーク情報' })).toBeVisible();
    });
  });

  test('計算モード: 不正な入力でエラーメッセージを表示する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      await page.getByLabel('CIDR').fill('not-valid');
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });

  test('分割モード: 192.168.1.0/24 を /26 に分割すると 4 行表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      // 分割モードに切り替え
      await page.getByRole('button', { name: '分割' }).click();

      // CIDR と分割先 prefix を入力
      await page.getByLabel('CIDR').fill('192.168.1.0/24');
      await page.getByLabel('分割先 prefix 長').fill('26');

      // 見出しの確認
      await expect(page.getByRole('heading', { name: 'サブネット一覧' })).toBeVisible();

      // 4 件のサブネット CIDR が表示されていることを確認
      await expect(page.getByText('192.168.1.0/26')).toBeVisible();
      await expect(page.getByText('192.168.1.64/26')).toBeVisible();
      await expect(page.getByText('192.168.1.128/26')).toBeVisible();
      await expect(page.getByText('192.168.1.192/26')).toBeVisible();
    });
  });

  test('分割モード: CIDR 入力は計算モードと共有される（切替時にクリアしない）（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      // 計算モードで CIDR を入力
      await page.getByLabel('CIDR').fill('10.0.0.0/8');
      await expect(page.getByRole('heading', { name: 'ネットワーク情報' })).toBeVisible();

      // 分割モードに切り替えても CIDR は保持される
      await page.getByRole('button', { name: '分割' }).click();
      await expect(page.getByLabel('CIDR')).toHaveValue('10.0.0.0/8');
    });
  });

  test('分割モード: 上限超過でエラーメッセージを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      await page.getByRole('button', { name: '分割' }).click();
      await page.getByLabel('CIDR').fill('10.0.0.0/8');
      await page.getByLabel('分割先 prefix 長').fill('24');
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('分割数が多すぎます');
    });
  });

  // 陽性対照: 旧実装（parseInt('26abc',10) → 26 として通過）に当てると fail する
  // 修正後は /^\d+$/ バリデーションで弾かれ alert が表示される
  test('分割モード: 不正な prefix 文字列でバリデーションエラーを表示する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      await page.getByRole('button', { name: '分割' }).click();
      await page.getByLabel('CIDR').fill('192.168.1.0/24');
      await page.getByLabel('分割先 prefix 長').fill('26abc');
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('alert')).toContainText(
        '分割先 prefix は 0 以上の整数で入力してください'
      );
    });
  });

  // ─── 重複検出モード ───────────────────────────────────────────────────────

  // 陽性対照: 重複する CIDR を入力したときに重複ペアと関係が表示される
  test('重複検出モード: 重複する CIDR を入力すると包含関係が表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      await page.getByRole('button', { name: '重複検出' }).click();

      // 10.0.0.0/8 は 10.1.0.0/16 を包含する
      await page.getByLabel('CIDR 一覧（1 行 1 CIDR）').fill('10.0.0.0/8\n10.1.0.0/16');

      await expect(page.getByRole('heading', { name: '重複ペア一覧' })).toBeVisible();
      // 包含を示す文字列が表示される（テーブルセル内）
      await expect(page.getByRole('cell', { name: /包含/ })).toBeVisible();
      // CIDR がテーブルセルに表示される
      await expect(page.getByRole('cell', { name: '10.0.0.0/8' })).toBeVisible();
      await expect(page.getByRole('cell', { name: '10.1.0.0/16' })).toBeVisible();
    });
  });

  // 陰性対照: 独立する CIDR では「重複なし」メッセージが表示される
  test('重複検出モード: 独立した CIDR では重複なしメッセージを表示する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      await page.getByRole('button', { name: '重複検出' }).click();

      await page.getByLabel('CIDR 一覧（1 行 1 CIDR）').fill('10.0.0.0/8\n192.168.0.0/16');

      await expect(page.getByText('重複は検出されませんでした')).toBeVisible();
    });
  });

  // a11y 陽性対照: 解析エラーになる不正 CIDR を入力したとき、行エラー一覧が role="alert" で
  // 取得できることを検証。role="alert" が外れると getByRole('alert') が取得できず fail する。
  test('重複検出モード: 不正な CIDR を入力すると role="alert" でエラー一覧が表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      await page.getByRole('button', { name: '重複検出' }).click();

      // 不正な CIDR（prefix 長が範囲外）を入力して解析エラーを発生させる
      await page.getByLabel('CIDR 一覧（1 行 1 CIDR）').fill('10.0.0.0/99');

      // role="alert" のエラーコンテナが表示され、エラー文言を含むことを確認
      const alertEl = page.getByRole('alert');
      await expect(alertEl).toBeVisible();
      await expect(alertEl).toContainText('解析エラーがある行');
    });
  });

  // 陽性対照: 有効 CIDR 上限超過時に警告が表示される（O(n²) 爆発防止ガード）
  // 旧実装（limitExceeded ガードなし）に当てると警告が表示されず fail する設計
  test('重複検出モード: 上限超過（257 件）で件数超過の警告を表示する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/cidr-calculator', async (page) => {
      await page.getByRole('button', { name: '重複検出' }).click();

      // 257 件の一意な CIDR（/24）を \n 連結で生成
      const cidrs = Array.from(
        { length: 257 },
        (_, i) => `10.${Math.floor(i / 256)}.${i % 256}.0/24`
      ).join('\n');

      await page.getByLabel('CIDR 一覧（1 行 1 CIDR）').fill(cidrs);

      // 「多すぎます」を含む警告が表示されること
      await expect(page.getByText(/多すぎます/)).toBeVisible();
      // 重複ペア一覧の見出しは表示されないこと（テーブルを出さない）
      await expect(page.getByRole('heading', { name: '重複ペア一覧' })).not.toBeVisible();
    });
  });
});
