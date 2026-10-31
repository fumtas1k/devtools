import { test, expect, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { waitForReactHydration } from './helpers';

/**
 * タップ領域 44×44px（docs/decisions.md [152]、DADS のチェックリスト、issue #662）。
 *
 * 見た目が 44px 未満の操作要素は、透明な ::after（global.css の `.hit-area` 系）で
 * 操作できる範囲だけを中心から 44×44px に広げている。全ツールの PC / スマホで、次の 2 つを hit-test で調べる。
 *   1. 奪わない: 各操作要素の見た目の範囲の内側（四隅・辺の中点・中心）をクリックすると、その要素自身に当たる
 *      （隣の要素の ::after が食い込んでいない）
 *   2. 届く: 44px 未満の辺は、中心から 22px 手前の点が、操作要素ではない場所（余白・文字）に当たらない
 *
 * 陽性対照（検知器が機能することの確認）: 末尾の 2 テストで、::after を無効化すると「届く」が、
 * 大きく広げると「奪わない」が、それぞれ違反を検出する。
 */

const SLUGS = readdirSync('src/pages/tools')
  .filter((f) => f.endsWith('.astro'))
  .map((f) => f.replace('.astro', ''));

const INTERACTIVE =
  'button, a[href], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), label:has(input[type=checkbox]), label:has(input[type=radio]), select, textarea, summary, [role=button], [role=tab], [role=checkbox], [role=switch], label:has(input[type=file])';

/** タップ領域を広げている系統（`.hit-area` 系）。陽性対照で、系統ごとに検知器が機能することを確認する */
const CATEGORIES = [
  'btn-toggle',
  'toggle-chip',
  'btn-copy',
  'btn-action',
  'btn-link-plain',
  'btn-row-remove',
  'btn-remove-card',
  'json-toggle',
  'footer-link',
  'hit-area',
];

/** 44px に満たなくても、理由を docs/decisions.md [152] に残して除外するもの */
const EXEMPT: { match: string; reason: string }[] = [];

/** 縦だけ 44px にしない操作要素（JSON ツリーの行が密で、縦に広げると隣の行に食い込む。[152]）。横は 44px を確認する */
const VERTICAL_EXEMPT = '.json-toggle, .json-row-actions .btn-copy';

interface Violation {
  kind: 'stolen' | 'unreachable';
  target: string;
  detail: string;
}

/** ページ内で、全操作要素の hit-test を行い違反を返す */
async function detect(page: Page): Promise<Violation[]> {
  return page.evaluate(
    ({ selector, exempt, verticalExempt, categories }) => {
      const describe = (el: Element) => {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 16);
        const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 3).join('.');
        const category = categories.find((c) => el.matches(`.${c}`)) ?? '';
        return `${el.tagName.toLowerCase()}.${cls}{${category}}[${name}]`;
      };
      // 閉じた <details> の中身は、矩形を持っていても操作できない
      const inClosedDetails = (el: Element) => {
        for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) {
          if (!d.open && !el.closest('summary')) return true;
        }
        return false;
      };
      const isVisible = (el: Element) => {
        if (inClosedDetails(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      };
      const targets = Array.from(document.querySelectorAll(selector)).filter(
        (el) =>
          isVisible(el) &&
          // hover で初めて操作できるもの（JSON ツリーの行末コピー）は、出ている間だけ対象
          getComputedStyle(el).pointerEvents !== 'none' &&
          !el.closest('.sr-only') &&
          !exempt.some((e) => el.matches(e.match)) &&
          // 画面外へ固定されている skip-link は、フォーカス時だけ現れる
          !(el.matches('.skip-link') && el.getBoundingClientRect().bottom <= 0)
      );
      const violations: { kind: 'stolen' | 'unreachable'; target: string; detail: string }[] = [];
      const owns = (target: Element, hit: Element | null) =>
        hit !== null && (target === hit || target.contains(hit) || hit.contains(target));

      for (const el of targets) {
        // 内側のスクロール領域（JSON ツリー等）に隠れた要素を出してから、ウィンドウを要素が中央に来る位置へ動かす。
        // scrollIntoView は CSS の scroll-behavior の影響で同期しないことがあるため、ウィンドウは scrollTo で動かす
        el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
        const box = el.getBoundingClientRect();
        window.scrollTo({
          // 内側のスクロール領域を中央に寄せた影響でページが横にずれないよう、左端へ戻す
          left: 0,
          top: window.scrollY + box.top + box.height / 2 - window.innerHeight / 2,
          behavior: 'instant',
        });
        // 仮想スクロールで描き直された要素は対象外
        if (!el.isConnected) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        // 1. 奪わない: 見た目の範囲の内側 1px の 9 点
        const xs = [r.left + 1, r.left + r.width / 2, r.right - 1];
        const ys = [r.top + 1, r.top + r.height / 2, r.bottom - 1];
        for (const x of xs) {
          for (const y of ys) {
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
            const hit = document.elementFromPoint(x, y);
            const thief = hit?.closest(selector) ?? null;
            if (thief && !owns(el, thief) && !owns(thief, el)) {
              violations.push({
                kind: 'stolen',
                target: describe(el),
                detail: `${describe(thief)} が (${Math.round(x)}, ${Math.round(y)}) を奪っている`,
              });
            }
          }
        }
        // 2. 届く: 44px 未満の辺は、中心から 22px 手前の点まで当たる
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const probes: [number, number, string][] = [];
        if (r.width < 44) probes.push([cx - 21.5, cy, '左'], [cx + 21.5, cy, '右']);
        if (r.height < 44 && !el.matches(verticalExempt))
          probes.push([cx, cy - 21.5, '上'], [cx, cy + 21.5, '下']);
        for (const [x, y, side] of probes) {
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          const hit = document.elementFromPoint(x, y);
          // 隣の操作要素の範囲（見た目・タップ領域とも）に当たる場合は、境界を分け合っているだけ。
          // 食い込みは「奪わない」で見ているので、ここでは操作要素ではない場所に当たったものだけを違反にする
          if (hit?.closest(selector)) continue;
          violations.push({
            kind: 'unreachable',
            target: describe(el),
            detail: `${side}（${Math.round(r.width)}x${Math.round(r.height)}）で 44px に届かない（${describe(hit ?? document.body)} に当たる）`,
          });
        }
      }
      return violations;
    },
    {
      selector: INTERACTIVE,
      exempt: EXEMPT,
      verticalExempt: VERTICAL_EXEMPT,
      categories: CATEGORIES,
    }
  );
}

const click = async (page: Page, name: string | RegExp) => {
  const button = page.getByRole('button', { name }).first();
  if ((await button.count()) > 0 && (await button.isEnabled())) {
    await button.click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(100);
  }
};

/** 結果・表・ツリー・行の追加ボタンなど、状態で現れる操作要素を出す */
async function prepare(page: Page, slug: string) {
  await click(page, 'サンプルを入力');
  for (const name of [
    /^生成$/,
    /^変換$/,
    /^整形$/,
    /^デコード$/,
    /^計算$/,
    /ツリー/,
    /を追加$/,
    /フィールド追加/,
  ]) {
    await click(page, name);
  }
  if (slug === 'gs1-databar') await click(page, /バーコードを追加/);
}

const summarize = (violations: Violation[]) =>
  Array.from(new Set(violations.map((v) => `[${v.kind}] ${v.target}: ${v.detail}`))).slice(0, 25);

for (const viewport of [
  { name: 'PC', width: 1280, height: 800 },
  { name: 'スマホ', width: 390, height: 844 },
]) {
  test.describe(`タップ領域 (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const slug of ['', ...SLUGS.map((s) => `tools/${s}`)]) {
      test(`/${slug}: 隣の操作要素を奪わず、44px まで届く`, async ({ page }) => {
        await page.goto(`/${slug}`);
        await waitForReactHydration(page).catch(() => undefined);
        if (slug.startsWith('tools/')) await prepare(page, slug.replace('tools/', ''));
        expect(summarize(await detect(page))).toEqual([]);
      });
    }
  });
}

test.describe('検知器の陽性対照', () => {
  // 本番 CSP は inline style を拒否するため、検知器の確認用に注入する style だけ通す
  test.use({ viewport: { width: 1280, height: 800 }, bypassCSP: true });

  test('::after を無効にすると「届かない」を検出する', async ({ page }) => {
    await page.goto('/tools/dsn-builder');
    await waitForReactHydration(page);
    await page.addStyleTag({ content: '*::after { content: none !important; }' });
    const violations = await detect(page);
    expect(violations.filter((v) => v.kind === 'unreachable').length).toBeGreaterThan(0);
  });

  test('::after を無効にすると、系統ごとに「届かない」を検出する', async ({ page }) => {
    const found = new Set<string>();
    const pages: [string, string[]][] = [
      ['/', []],
      ['/tools/dsn-builder', ['ホストを追加']],
      ['/tools/json-formatter', ['サンプルを入力', 'ツリー']],
      ['/tools/dummy-personal-data', []],
      ['/tools/ulid-generator', ['生成']],
      ['/tools/gs1-databar', ['サンプルを入力', 'バーコードを追加']],
      ['/tools/qr-ticket', []],
      ['/tools/csr-generator', []],
    ];
    for (const [path, clicks] of pages) {
      await page.goto(path);
      await waitForReactHydration(page).catch(() => undefined);
      for (const name of clicks) await click(page, name);
      if (path === '/tools/json-formatter') await page.locator('.json-toggle').first().waitFor();
      await page.addStyleTag({ content: '*::after { content: none !important; }' });
      for (const v of await detect(page)) {
        const category = /\{([^}]*)\}/.exec(v.target)?.[1];
        if (v.kind === 'unreachable' && category) found.add(category);
      }
    }
    expect([...found].sort()).toEqual([...CATEGORIES].sort());
  });

  test('::after を大きく広げると「奪う」を検出する', async ({ page }) => {
    await page.goto('/tools/dsn-builder');
    await waitForReactHydration(page);
    await click(page, 'ホストを追加');
    await page.addStyleTag({
      content: '.btn-action::after { width: 300px !important; height: 300px !important; }',
    });
    const violations = await detect(page);
    expect(violations.filter((v) => v.kind === 'stolen').length).toBeGreaterThan(0);
  });
});

/**
 * 実寸を 44px にした箇所（hit area ではなく見た目も広げたもの）。
 * 陽性対照: 各箇所の min-h-11 / min-w-11 / min-height を外すと fail することを確認済み。
 */
test.describe('見た目の寸法も 44px にした箇所', () => {
  const size = (locator: import('@playwright/test').Locator) =>
    locator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });

  test('トップのカテゴリタブは高さ 44px 以上', async ({ page }) => {
    await page.goto('/');
    for (const tab of await page.getByRole('tab').all()) {
      expect((await size(tab)).height).toBeGreaterThanOrEqual(44);
    }
  });

  test('skip-link は高さ 44px 以上', async ({ page }) => {
    await page.goto('/');
    expect((await size(page.locator('.skip-link'))).height).toBeGreaterThanOrEqual(44);
  });

  test('チェックボックスはラベルごと 44px 以上の高さで押せる', async ({ page }) => {
    await page.goto('/tools/jwt-decoder');
    await waitForReactHydration(page);
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    const label = page.locator('label', { hasText: '有効期限（exp）チェックを行う' });
    expect((await size(label)).height).toBeGreaterThanOrEqual(44);
  });

  test('CSR ジェネレータの SAN 削除は 44x44px 以上', async ({ page }) => {
    await page.goto('/tools/csr-generator');
    await waitForReactHydration(page);
    await click(page, '＋ SAN を追加');
    const remove = await size(page.getByRole('button', { name: 'SAN 1 を削除' }));
    expect(remove.width).toBeGreaterThanOrEqual(44);
    expect(remove.height).toBeGreaterThanOrEqual(44);
  });

  test('ToggleGroup sm のボタンは幅 44px 以上（隣のボタンに食い込まない）', async ({ page }) => {
    await page.goto('/tools/json-formatter');
    await waitForReactHydration(page);
    const group = page
      .getByRole('group')
      .filter({ has: page.getByRole('button', { name: '2', exact: true }) });
    for (const button of await group.getByRole('button').all()) {
      expect((await size(button)).width).toBeGreaterThanOrEqual(44);
    }
  });
});
