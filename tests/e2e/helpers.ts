import type { Page } from '@playwright/test';
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
 * CI で確実に検知する（issue #176 / decisions.md [061] 参照）。
 *
 * 使い方:
 * ```ts
 * const guard = await applyProductionCsp(page);
 * await page.goto('/path');
 * // ... 操作 ...
 * guard.assertNoViolations();
 * ```
 *
 * route は HTML ドキュメントのみ書き換え、JS/CSS/画像は素通しする
 * （無関係なリソースを proxy するとレイテンシが増えてテストが不安定になるため）。
 */
export interface CspGuard {
  readonly violations: readonly string[];
  assertNoViolations(): void;
}

export async function applyProductionCsp(page: Page): Promise<CspGuard> {
  const violations: string[] = [];

  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const headers = { ...response.headers(), 'content-security-policy': PRODUCTION_CSP };
    await route.fulfill({ response, headers });
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Content Security Policy/i.test(text)) {
      violations.push(text);
    }
  });

  page.on('pageerror', (err) => {
    if (/Content Security Policy/i.test(err.message)) {
      violations.push(err.message);
    }
  });

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
  };
}
