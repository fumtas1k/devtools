import { test, expect } from '@playwright/test';

test('深くネストした DOM をスタックオーバーフローせずサニタイズする', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // jsdom 30 では 5000 段の DOM 構築が極端に遅いため、dev server の実モジュールを
    // ブラウザに読み込み、同じ深度・同じ sanitizeTree を native DOM で検証する。
    const modulePath = '/src/utils/sanitizeHtml.ts';
    const { sanitizeTree } = await import(modulePath);
    const script = document.createElement('script');
    script.textContent = 'alert(1)';
    const text = document.createTextNode('x');
    let cur = document.createElement('div');
    cur.append(script, text);
    for (let i = 0; i < 4999; i++) {
      const wrapper = document.createElement('div');
      wrapper.appendChild(cur);
      cur = wrapper;
    }
    const root = document.createElement('div');
    root.appendChild(cur);

    sanitizeTree(root);
    return { scriptRemoved: script.parentNode === null, textKept: text.parentNode !== null };
  });
  expect(result).toEqual({ scriptRemoved: true, textKept: true });
});
