import type { Page } from '@playwright/test';

/**
 * Astro の client:load island は SSR でも DOM に要素が現れるが、
 * React のイベントハンドラはハイドレーション後に初めて有効になる。
 * React がハイドレーション完了すると DOM 要素に __react* キーを付与するため、
 * その出現を待って「操作可能」を確認する。
 */
export async function waitForReactHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const el = document.querySelector('input, textarea, button');
    if (!el) return false;
    return Object.keys(el).some(k => k.startsWith('__react'));
  });
}
