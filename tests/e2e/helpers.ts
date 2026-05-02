import type { ConsoleMessage, Page, Route } from '@playwright/test';
import { PRODUCTION_CSP } from '../../src/utils/csp';

/**
 * Astro の client:load island は SSR でも DOM に要素が現れるが、
 * React のイベントハンドラはハイドレーション後に初めて有効になる。
 * React がハイドレーション完了すると DOM 要素に __react* キーを付与するため、
 * その出現を待って「操作可能」を確認する。
 *
 * timeout を明示しないと per-test timeout (30s) を全消費しうるため、
 * デフォルト 10s で打ち切って早期に失敗を顕在化させる。呼び出し側で
 * `waitForReactHydration(page, { timeout: 20_000 })` のように override 可能。
 */
export async function waitForReactHydration(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? 10_000;
  await page.waitForFunction(
    () => {
      const els = document.querySelectorAll('input, textarea, button');
      if (!els.length) return false;
      return [...els].some((el) => Object.keys(el).some((k) => k.startsWith('__react')));
    },
    null,
    { timeout }
  );
}

/**
 * dev server (`npm run dev`) は public/_headers を解釈しないため、Cloudflare
 * Pages 本番と同じ CSP 文字列 (PRODUCTION_CSP) を Playwright `page.route` で
 * HTML 文書のレスポンスヘッダに注入し、本番相当の CSP 制約下で E2E を回す。
 *
 * 副次効果として、ページ内で発生した CSP 違反を console error / pageerror
 * 経由で収集し、テスト終端で `assertNoViolations()` を呼ぶことで
 * 「機能的には動いているように見えるが CSP で本番が壊れる」種のデグレを
 * CI で確実に検知する（採用根拠は `docs/decisions.md` [061] を参照）。
 *
 * **重要 — 使い方**:
 *
 * default の `page` / `context` test fixture では `page.route` 介入が成立せず
 * ゲートが空回りする事象を確認した（本リポジトリの Astro dev server 経路で
 * 再現）。必ず `browser` fixture を受け取り `browser.newContext()` で完全に
 * 新規のコンテキストを作ってその上の page に対して呼ぶこと。
 *
 * ```ts
 * test('...', async ({ browser }) => {
 *   const context = await browser.newContext();
 *   try {
 *     const page = await context.newPage();
 *     const guard = await applyProductionCsp(page);
 *     await page.goto('/path');
 *     // ... 操作 ...
 *     guard.assertNoViolations();
 *   } finally {
 *     await context.close();
 *   }
 * });
 * ```
 *
 * route は HTML ドキュメントのみ書き換え、JS/CSS/画像は素通しする
 * （無関係なリソースを proxy するとレイテンシが増えてテストが不安定になるため）。
 *
 * **ゲート自体の動作確認**: 同種のメタテストとして
 * `tests/e2e/config-converter.spec.ts` の
 * 「applyProductionCsp は実際に CSP 違反を捕捉する」が陽性対照を提供する。
 * helper を修正したときは必ずこのメタテストが通ることを確認する。
 *
 * **検出メッセージの依存性**: 違反検出は Chromium のメッセージ表現
 * （`Refused to ... because it violates the following Content Security Policy
 * directive ...`）の "Content Security Policy" 部分に対する正規表現マッチに
 * 依存している。`playwright.config.ts` は現在 chromium プロジェクトのみを
 * 定義しているため問題ないが、Firefox / WebKit を追加する場合は
 * 各ブラウザのメッセージ形式に合わせて regex を拡張する必要がある
 * （未対応のままでは違反が捕捉されず本ゲートが空回りする）。
 *
 * **後始末**: 戻り値の `dispose()` を呼ぶと `page.unroute` / `page.off` で
 * リスナーを解除する。`page` は test ごとに再生成されるため呼ばなくても
 * 副作用は累積しないが、将来 fixture / `beforeEach` で再利用する設計に
 * 拡張するときの hook として提供する。
 */
export interface CspGuard {
  readonly violations: readonly string[];
  assertNoViolations(): void;
  dispose(): Promise<void>;
}

export async function applyProductionCsp(page: Page): Promise<CspGuard> {
  const violations: string[] = [];

  const routeHandler = async (route: Route): Promise<void> => {
    if (route.request().resourceType() !== 'document') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    // route.fulfill に { response, headers } 並列指定すると Playwright 1.59 では
    // headers の上書きが反映されない事象を確認したため、status / headers / body を
    // 個別に組み立てて確実に CSP が乗るようにする。
    await route.fulfill({
      status: response.status(),
      headers: { ...response.headers(), 'content-security-policy': PRODUCTION_CSP },
      body: await response.body(),
    });
  };

  const consoleHandler = (msg: ConsoleMessage): void => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Content Security Policy/i.test(text)) {
      violations.push(text);
    }
  };

  const pageErrorHandler = (err: Error): void => {
    if (/Content Security Policy/i.test(err.message)) {
      violations.push(err.message);
    }
  };

  await page.route('**/*', routeHandler);
  page.on('console', consoleHandler);
  page.on('pageerror', pageErrorHandler);

  return {
    get violations() {
      return violations.slice();
    },
    assertNoViolations() {
      if (violations.length > 0) {
        throw new Error(
          `CSP 違反が ${violations.length} 件検知されました:\n` + violations.join('\n')
        );
      }
    },
    async dispose() {
      await page.unroute('**/*', routeHandler);
      page.off('console', consoleHandler);
      page.off('pageerror', pageErrorHandler);
    },
  };
}
