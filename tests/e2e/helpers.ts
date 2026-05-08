import type { Browser, ConsoleMessage, Page, Route } from '@playwright/test';
import { PRODUCTION_CSP } from '../../src/utils/csp';

/**
 * PR 9 (#304) verification 専用定数、PR 10 で削除候補。
 *
 * `PRODUCTION_CSP` から `style-src` の `'unsafe-inline'` のみ除いた形。
 * PR 10 で `PRODUCTION_CSP` 自体を strict 化したら本定数は冗長になり、削除する。
 */
const STRICT_STYLE_SRC_CSP =
  "default-src 'self'; " +
  "img-src 'self' data: blob:; " +
  "media-src 'self' blob:; " +
  "style-src 'self'; " + // 'unsafe-inline' を削除した PR 10 想定形 (test 専用 / 暫定値)
  "script-src 'self' 'unsafe-inline'; " +
  "connect-src 'self'; " +
  "worker-src 'self'; " +
  "object-src 'none'; " +
  "frame-ancestors 'none'; " +
  "base-uri 'none'; " +
  "form-action 'self'; " +
  'upgrade-insecure-requests';

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
 * **low-level primitive — 通常テストは {@link withProductionCsp} を使うこと。**
 *
 * 本関数は `page` に対して以下を直接設定する:
 * - dev server (`npm run dev`) は public/_headers を解釈しないため、Cloudflare
 *   Pages 本番と同じ CSP 文字列 (PRODUCTION_CSP) を Playwright `page.route` で
 *   HTML 文書のレスポンスヘッダに注入する
 * - 副次効果として、ページ内で発生した CSP 違反を console error / pageerror
 *   経由で収集し、`assertNoViolations()` で集計検査できるようにする
 *   （採用根拠は `docs/decisions.md` [061] を参照）
 *
 * **使い分けの方針**:
 *
 * - **通常の「本番 CSP 下で機能が動作する」系テスト**:
 *   {@link withProductionCsp} で包む (1 行で記述、context の cleanup と
 *   `assertNoViolations` 自動呼び出しが含まれる)
 * - **陽性対照メタテスト** (ゲート自体の動作確認):
 *   本関数を直接呼ぶ inline pattern を使う。`withProductionCsp` は終端で
 *   `assertNoViolations()` を呼ぶ設計のため、`guard.violations.length` を
 *   fn 内で polling して「違反 0 件以上」を期待する用途には整合しない。
 *
 * **inline pattern (陽性対照メタテスト専用)**:
 *
 * default の `page` / `context` test fixture では `page.route` 介入が成立せず
 * ゲートが空回りする事象を確認した（本リポジトリの Astro dev server 経路で
 * 再現）。必ず `browser` fixture を受け取り `browser.newContext()` で完全に
 * 新規のコンテキストを作ってその上の page に対して呼ぶこと。
 *
 * ```ts
 * // 陽性対照メタテストの canonical pattern
 * test('applyProductionCsp は実際に CSP 違反を捕捉する', async ({ browser }) => {
 *   const context = await browser.newContext();
 *   try {
 *     const page = await context.newPage();
 *     const guard = await applyProductionCsp(page);
 *     await page.goto('/path');
 *     // 意図的に違反を発生させる ...
 *     await expect.poll(() => guard.violations.length).toBeGreaterThan(0);
 *   } finally {
 *     await context.close();
 *   }
 * });
 * ```
 *
 * route は HTML ドキュメントのみ書き換え、JS/CSS/画像は素通しする
 * （無関係なリソースを proxy するとレイテンシが増えてテストが不安定になるため）。
 *
 * **ゲート自体の動作確認**: 陽性対照メタテストの実例として
 * `tests/e2e/uuid-v7.spec.ts` / `tests/e2e/config-converter.spec.ts` 各々の
 * 「applyProductionCsp は実際に CSP 違反を捕捉する」が陽性対照を提供する。
 * helper を修正したときは必ずこれらのメタテストが通ることを確認する。
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

async function applyCspOverride(page: Page, csp: string): Promise<CspGuard> {
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
      headers: { ...response.headers(), 'content-security-policy': csp },
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

export async function applyProductionCsp(page: Page): Promise<CspGuard> {
  return applyCspOverride(page, PRODUCTION_CSP);
}

/**
 * **PR 9 (#304) verification 専用 helper、PR 10 で削除候補。**
 *
 * `style-src 'self'` (PR 10 で flip 予定の strict 形) を強制注入し、
 * Constructable Stylesheets / setProperty 経路の挙動を実機検証する。
 *
 * `STRICT_STYLE_SRC_CSP` は `PRODUCTION_CSP` から `style-src` の
 * `'unsafe-inline'` のみ除いた形。PR 10 で `PRODUCTION_CSP` 自体を
 * strict 化したら本 helper は冗長になり、削除する。
 */
export async function applyStrictStyleSrcCsp(page: Page): Promise<CspGuard> {
  return applyCspOverride(page, STRICT_STYLE_SRC_CSP);
}

/**
 * `applyProductionCsp` + `browser.newContext` + `goto` + `waitForReactHydration`
 * + 終端 `guard.assertNoViolations()` + `context.close` を一括で集約するラッパ。
 *
 * 通常の「本番 CSP 下で機能が動作する」系テストは本ラッパで包めば 1 行で済む:
 *
 * ```ts
 * test('UUIDを生成できる', async ({ browser }) => {
 *   await withProductionCsp(browser, '/tools/uuid-v7', async (page) => {
 *     await page.getByRole('button', { name: '生成' }).click();
 *     await expect(page.getByText('10 件生成')).toBeVisible();
 *   });
 * });
 * ```
 *
 * **陽性対照メタテスト (ゲート自体の動作確認) には使わないこと**:
 * メタテストは `guard.violations.length` を fn 内で polling する必要があり、
 * ラッパが終端で `assertNoViolations()` を呼ぶ設計と整合しない (違反を期待
 * するテストなのに「違反 0」を assert してしまう)。これらは inline pattern を
 * 維持する (`tests/e2e/uuid-v7.spec.ts` / `tests/e2e/config-converter.spec.ts`
 * に各 1 件存在)。
 *
 * **`fn` への引数**: 通常テストでは `page` のみ使う。`guard` は fn 内で違反
 * 件数を観測したい高度な用途のために第 2 引数として露出するが、終端の
 * `assertNoViolations()` 呼び出しはラッパが行うため、利用側で再度呼ぶ必要は
 * ない。
 *
 * **fn throw 時の挙動**: `fn` が例外を投げると `assertNoViolations` は呼ばれず、
 * `finally` で `context.close()` のみ実行される。元の例外が伝播しテストが
 * 失敗する (inline pattern と等価)。
 */
export async function withProductionCsp(
  browser: Browser,
  path: string,
  fn: (page: Page, guard: CspGuard) => Promise<void>
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const guard = await applyProductionCsp(page);
    await page.goto(path);
    await waitForReactHydration(page);
    await fn(page, guard);
    guard.assertNoViolations();
  } finally {
    await context.close();
  }
}
