import { expect, test } from '@playwright/test';
import { waitForReactHydration } from './helpers';
import { PAGES, STATIC_PAGES } from './visual-regression-pages';

/**
 * Visual Regression Test (VRT) — `#176` B 案 ui migration の visual change を CI で検出する。
 *
 * 全 18 ページ × 2 viewport (Desktop 1280×800 / Mobile 390×844) = 36 screenshot を
 * baseline 比較する。production code には一切手を入れず、`addInitScript` で
 * `Math.random` / `Date.now` を deterministic に固定して non-determinism を排除。
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
          // localStorage / sessionStorage を sterile に保つ（baseline 再生成時の secret 混入予防）
          // 将来 spec に setItem('apiKey', ...) 等が誤って追加された場合でも、init script で
          // 直前に clear することで永続化前の baseline 撮影を保証する (issue #255 I-2)。
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch {
            // 静的ページ等で storage 未許可の context では無視
          }

          // Seeded LCG: Math.random を固定 seed (42) から再現可能な乱数列に
          let seed = 42;
          Math.random = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
          };

          // Fixed Date: 2026-01-01T00:00:00Z で固定
          // Date.now() に加え `new Date()` (引数なし) も FIXED_NOW を返すよう constructor も mock
          // （qr-ticket の getDefaultExpiry が `new Date()` で today+7 を計算するため）
          const FIXED_NOW = 1767225600000;
          const OriginalDate = Date;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const PatchedDate: any = function (this: unknown, ...args: unknown[]) {
            // `Date(...)` のような関数呼び出しは spec 上 string を返す。引数の有無を問わず
            // 元 Date と同じ挙動を維持する。
            if (!(this instanceof PatchedDate)) {
              return OriginalDate(...(args as []));
            }
            // `new Date()` (引数なし) のみ FIXED_NOW で固定。それ以外は元の挙動を保持。
            const dateArgs = args.length === 0 ? [FIXED_NOW] : args;
            return new (OriginalDate as unknown as new (...a: unknown[]) => Date)(
              ...(dateArgs as [])
            );
          };
          PatchedDate.prototype = OriginalDate.prototype;
          PatchedDate.now = () => FIXED_NOW;
          PatchedDate.parse = OriginalDate.parse.bind(OriginalDate);
          PatchedDate.UTC = OriginalDate.UTC.bind(OriginalDate);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (globalThis as any).Date = PatchedDate;
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
