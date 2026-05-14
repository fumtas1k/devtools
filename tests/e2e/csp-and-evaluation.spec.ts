/**
 * CSP AND 評価の runtime 検証 spec
 *
 * ## 何を検証するか
 * このプロジェクトでは CSP を 2 層 AND 評価で運用している (`docs/decisions.md [064]`):
 *  - HTTP ヘッダ (`public/_headers`): permissive `script-src 'self' 'unsafe-inline'`
 *  - `<meta>` (Astro `security.csp` 由来): strict `script-src 'self' 'sha256-...'`
 *
 * ブラウザは複数の CSP を AND 評価するため、`<meta>` 層が存在する限り
 * `'unsafe-inline'` スクリプトは実行できない。しかし `<meta>` が silent に
 * 消えると HTTP ヘッダ単独で `'unsafe-inline'` が実効力を持ち XSS 耐性が消失する。
 *
 * 本 spec は preview build (production) の実サーバーに対し、この AND 評価が
 * runtime で実際に効いているかを検証する。
 *
 * ## なぜ 2 ケース必要か (test-gates skill = 陽性対照必須)
 * - **(A) 陰性対照**: 通常の preview build で AND 評価が機能し、
 *   inline script が実行不能になることを確認する。
 * - **(B) 陽性対照**: `<meta>` CSP を route handler で剥がしたとき
 *   HTTP ヘッダ単独の `'unsafe-inline'` で inline script が実行可能になることを確認する。
 *   このケースが fail する = gate 検知能力ゼロ化 を意味し、
 *   `<meta>` 層の存在意義を runtime で証明する陽性対照として機能する。
 *
 * ## inline pattern を使う理由
 * `withProductionCsp` ラッパは終端で `assertNoViolations()` を呼ぶ設計のため、
 * 違反を期待する陽性対照テストには整合しない。
 * `browser.newContext()` + `try/finally context.close()` の inline pattern を使う
 * (`tests/e2e/helpers.ts:31-72` のコメント参照)。
 *
 * ## runtime AND 評価検証
 * 静的 assert (`src/utils/__tests__/meta-csp.test.ts`) が `<meta>` の内容を
 * ビルド生成物に対して検証するのに対し、本 spec は実 preview server 上での
 * runtime 動作を確認する補完テストである。
 */

import { test, expect } from '@playwright/test';
import { applyProductionCsp, waitForReactHydration } from './helpers';
import { PRODUCTION_CSP } from '../../src/utils/csp';

/**
 * inline script 注入プローブ:
 * `<script>` 要素を動的に DOM へ挿入し、document.title を書き換えようとする。
 * CSP が inline script を block すれば title は変わらず、許可すれば 'XSS_OK' になる。
 *
 * 設計メモ:
 * `page.evaluate()` は Playwright の CDP Runtime.evaluate 経由で実行されるため
 * CSP `unsafe-eval` 制約を回避してしまうが、DOM 操作で `<script>` 要素を挿入する
 * 経路はブラウザの通常の CSP チェックを受ける。この手法で inline script の
 * CSP 制御を検証する (uuid-v7.spec.ts 陽性対照の外部 script src 経路とは異なる probe)。
 */
const XSS_PROBE_TITLE = 'XSS_OK';

/** `<script>` 要素を DOM に挿入して document.title を書き換える inline script probe */
async function injectInlineScriptProbe(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate((title) => {
    const s = document.createElement('script');
    s.text = `document.title='${title}'`;
    document.head.appendChild(s);
  }, XSS_PROBE_TITLE);
}

test.describe('CSP AND 評価 runtime 検証', () => {
  /**
   * (A) 陰性対照 — 通常の preview build で AND 評価が効く
   *
   * preview build では `<meta>` strict CSP と HTTP ヘッダ permissive CSP の
   * AND 評価が成立し、`'unsafe-inline'` inline script は実行不能になることを確認する。
   */
  test('陰性対照: AND 評価が効き inline script は実行できない', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();

      // permissive HTTP ヘッダ (PRODUCTION_CSP) を注入し、CSP 違反を収集するガードを設置
      const guard = await applyProductionCsp(page);

      await page.goto('/tools/uuid-v7');
      await waitForReactHydration(page);

      // 前提検証: <meta> strict CSP が存在することを確認
      const metaCsp = await page.$eval(
        'meta[http-equiv="content-security-policy"]',
        (el) => el.getAttribute('content') ?? ''
      );
      expect(metaCsp).toContain("script-src 'self'");
      // <meta> strict CSP には 'unsafe-inline' が含まれないこと (hash-only)
      expect(metaCsp).not.toContain("'unsafe-inline'");

      // inline script probe を挿入 (AND 評価が効いていれば block される)
      await injectInlineScriptProbe(page);

      // CSP 違反が捕捉されること (AND 評価で meta strict 層が block している証拠)
      await expect.poll(() => guard.violations.length).toBeGreaterThan(0);

      // script が実際に execute されていないこと (title が変わっていない)
      expect(await page.title()).not.toBe(XSS_PROBE_TITLE);
    } finally {
      await context.close();
    }
  });

  /**
   * (B) 陽性対照 — `<meta>` を剥がすと standalone `'unsafe-inline'` が効力を持つ
   *
   * `<meta>` CSP を route handler で除去し HTTP ヘッダ permissive CSP のみにしたとき、
   * `'unsafe-inline'` が単独で実効力を持ち inline script が実行可能になることを確認する。
   * これは「`<meta>` 層が消えた瞬間に XSS 耐性が消失する」ことを runtime で証明し、
   * AND 評価設計の前提を陽性対照として担保する。
   */
  test('陽性対照: <meta> を剥がすと standalone unsafe-inline で inline script が実行される', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();

      // CSP 違反を収集するリスナーを手動設置 (applyProductionCsp は使わず
      // 独自の route handler で <meta> を除去した上で permissive ヘッダを注入する)
      const violations: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) {
          violations.push(msg.text());
        }
      });
      page.on('pageerror', (err) => {
        if (/Content Security Policy/i.test(err.message)) {
          violations.push(err.message);
        }
      });

      // route handler: document リクエストのみ介入し
      //   1. <meta http-equiv="content-security-policy" ...> タグを正規表現で除去
      //   2. permissive HTTP CSP ヘッダ (PRODUCTION_CSP) を付与して返す
      // JS/CSS/画像 等は素通し
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        const bodyText = await response.text();
        // <meta http-equiv="content-security-policy" ...> タグを除去
        const strippedBody = bodyText.replace(
          /<meta\s+http-equiv=["']content-security-policy["'][^>]*>/gi,
          ''
        );
        await route.fulfill({
          status: response.status(),
          headers: {
            ...response.headers(),
            'content-security-policy': PRODUCTION_CSP,
          },
          body: strippedBody,
        });
      });

      await page.goto('/tools/uuid-v7');
      await waitForReactHydration(page);

      // 前提検証: <meta> CSP が存在しないこと (strip が成功していること)
      const metaEl = await page.$('meta[http-equiv="content-security-policy"]');
      expect(metaEl).toBeNull();

      // inline script probe を挿入
      await injectInlineScriptProbe(page);

      // ヘッダ単独 'unsafe-inline' が実効力を持つため script が execute される
      expect(await page.title()).toBe(XSS_PROBE_TITLE);

      // <meta> が無い状態では CSP 違反は観測されない
      // (permissive ヘッダが standalone で 'unsafe-inline' を許可するため)
      expect(violations.length).toBe(0);
    } finally {
      await context.close();
    }
  });
});
