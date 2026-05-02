import type { Page } from '@playwright/test';

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
