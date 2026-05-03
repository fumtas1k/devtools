import { expect, test } from '@playwright/test';
import { waitForReactHydration } from './helpers';

/**
 * Visual Regression Test (VRT) — `#176` B 案 ui migration の visual change を CI で検出する。
 *
 * 全 18 ページ × 2 viewport (Desktop 1280×800 / Mobile 390×844) = 36 screenshot を
 * baseline 比較する。production code には一切手を入れず、`addInitScript` で
 * `Math.random` / `crypto.randomUUID` / `Date.now` を deterministic に固定して non-determinism を排除。
 *
 * 運用:
 * - baseline は CI Linux runner で生成（mac とのフォントレンダリング差を回避）
 * - diff が出たら専用 workflow が PR comment で reviewer に報告
 * - 意図的な visual 変更なら `update-visual-baseline.yml` を workflow_dispatch で trigger して baseline 更新
 * - 意図しない regression なら該当変更を fix
 * - VRT は **required check に含めない**（意図的変更が merge を block しない設計）
 *
 * 詳細: docs/superpowers/specs/2026-05-03-vrt-setup-design.md
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

const STATIC_PAGES = new Set(['/', '/about', '/privacy']);

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`visual regression - ${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport });

    for (const url of PAGES) {
      test(`${url} の screenshot が baseline と一致`, async ({ page }) => {
        // navigation 前に deterministic mock を注入（production code 無変更）
        await page.addInitScript(() => {
          // Seeded LCG: Math.random を固定 seed (42) から再現可能な乱数列に
          let seed = 42;
          Math.random = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
          };

          // Incremental UUID counter: 00000000-0000-0000-0000-NNNNNNNNNNNN 形式に
          let uuidCounter = 0;
          if (window.crypto) {
            const fixedUuid = (): `${string}-${string}-${string}-${string}-${string}` => {
              uuidCounter++;
              const n = uuidCounter.toString().padStart(12, '0');
              return `00000000-0000-0000-0000-${n}` as `${string}-${string}-${string}-${string}-${string}`;
            };
            window.crypto.randomUUID = fixedUuid;
          }

          // Fixed Date.now: 2026-01-01T00:00:00Z で固定
          const FIXED_NOW = 1767225600000;
          Date.now = () => FIXED_NOW;
        });

        await page.goto(url);
        // 静的ページ (about / privacy / index) は React island 不在のため hydration 待ち不要。
        // それ以外は hydration 完了を待つ — timeout した場合は real bug として test を fail させる
        // （旧設計の `.catch(() => {})` は hydration バグを silent に baseline 化するリスクがあった）
        if (!STATIC_PAGES.has(url)) {
          await waitForReactHydration(page);
        }

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
