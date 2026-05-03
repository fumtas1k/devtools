import { expect, test } from '@playwright/test';
import { waitForReactHydration } from './helpers';

/**
 * #176 B 案 visual regression baseline.
 *
 * 全 18 ページ × 主要 viewport (Desktop 1280×800 / Mobile 390×844) の screenshot を
 * 保存し、後続の style migration PR で見た目が崩れていないことを CI で gate する。
 *
 * 運用:
 * - baseline は CI Linux runner で生成（mac とのフォントレンダリング差で flake 回避）
 * - ローカル mac で diff が出ても `--update-snapshots` で更新せず CI で再 verify する
 * - flake 頻発時は `maxDiffPixels` 緩和や `mask` 適用で対処
 *
 * 詳細: docs/superpowers/specs/2026-05-03-issue-176-b-style-src-elimination-design.md
 */

const PAGES = [
  '/',
  '/about',
  '/privacy',
  '/tools/ulid-generator',
  '/tools/uuid-v7',
  '/tools/dummy-text',
  '/tools/qr-code',
  '/tools/jan-code',
  '/tools/gs1-databar',
  '/tools/qr-ticket',
  '/tools/qr-reader',
  '/tools/url-encode',
  '/tools/jwt-decoder',
  '/tools/base64',
  '/tools/json-xml',
  '/tools/json-csv',
  '/tools/encoding-converter',
  '/tools/config-converter',
] as const;

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`visual regression - ${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport });

    for (const url of PAGES) {
      test(`${url} の screenshot が baseline と一致`, async ({ page }) => {
        await page.goto(url);
        // ハイドレーション完了を待ってから screenshot（React island がある tools のみ意味あり、
        // 静的ページでも害はない）
        await waitForReactHydration(page).catch(() => {
          // about / privacy 等の静的ページは hydration 対象が無いため timeout する。
          // その場合は単にスキップして continue。
        });
        await expect(page).toHaveScreenshot({
          fullPage: true,
          maxDiffPixels: 100,
          // フォントレンダリングの微差を許容
          maxDiffPixelRatio: 0.001,
        });
      });
    }
  });
}
