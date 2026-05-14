import { test, expect } from '@playwright/test';

/**
 * issue #387: prefers-reduced-motion グローバルリセットの E2E。
 *
 * `src/styles/global.css` の `@media (prefers-reduced-motion: reduce)` で
 * すべての要素の transition-duration を 0.01ms に抑止していることを検証する。
 *
 * 陽性 / 陰性対照を **同一スペック内に併設** することで「セレクタが
 * transition 持ちの要素を選べていない / CSS が無効化されていない」事故を防ぐ:
 *  - 陽性対照: 通常モードでは btn-copy に transition-duration > 0 が残ること
 *  - 検知側:   reduced-motion 強制時に transition-duration が 0.01ms 以下に抑止されること
 *
 * 旧 develop（@media ルール削除）にこのテストを当てると検知側が fail する想定。
 */

// .btn-toggle はページ初期描画時から visible で transition 持ち (0.15s)。
// .btn-copy は value=空時に visibility:hidden になるため初期 visible で取得できない。
const TARGET_SELECTOR = '.btn-toggle';
// 0.15s = 150ms (btn-toggle の transition)。reset 適用後は 0.01ms。
const REDUCED_THRESHOLD_MS = 1;

function parseDurationToMs(value: string): number {
  // computed style は "0.2s" / "200ms" / "0s, 0.2s, ..." 等を返す。
  // transition プロパティは複数値の場合 comma 区切りで返るため、最初の値を採用する。
  const first = value.split(',')[0]?.trim() ?? '';
  if (first.endsWith('ms')) return parseFloat(first);
  if (first.endsWith('s')) return parseFloat(first) * 1000;
  return Number.NaN;
}

async function readTransitionDuration(page: import('@playwright/test').Page) {
  const btn = page.locator(TARGET_SELECTOR).first();
  await btn.waitFor({ state: 'visible' });
  const duration = await btn.evaluate((el) => getComputedStyle(el).transitionDuration);
  return parseDurationToMs(duration);
}

test.describe('prefers-reduced-motion (issue #387)', () => {
  test('陽性対照: 通常モードでは btn-toggle に transition-duration が残る', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/tools/encoding-converter');
    const ms = await readTransitionDuration(page);
    expect(ms).toBeGreaterThan(REDUCED_THRESHOLD_MS);
  });

  test('reduced-motion 強制時は transition-duration がほぼ 0 に抑止される', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/tools/encoding-converter');
    const ms = await readTransitionDuration(page);
    expect(ms).toBeLessThanOrEqual(REDUCED_THRESHOLD_MS);
  });
});
