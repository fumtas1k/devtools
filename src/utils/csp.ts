/**
 * 本番 (Cloudflare Pages) で適用する Content-Security-Policy 文字列。
 *
 * `public/_headers` に書かれた値と完全一致させ、以下の用途で再利用する:
 * - E2E テスト (`tests/e2e/helpers.ts` の `applyProductionCsp`) で
 *   dev server レスポンスに本番相当の CSP を注入する。
 *   (Astro dev / preview は `_headers` を解釈しないため、これが無いと
 *    `unsafe-eval` 必須ライブラリの混入等を CI で検知できない)
 * - `src/utils/__tests__/headers.test.ts` で `_headers` 内の値と
 *   この定数が一致することをアサートし、片方更新の事故を防ぐ。
 *
 * 各ディレクティブの採用根拠は `docs/decisions.md` [054] を参照。
 */
export const PRODUCTION_CSP =
  "default-src 'self'; " +
  "img-src 'self' data: blob:; " +
  "media-src 'self' blob:; " +
  "style-src 'self' 'unsafe-inline'; " +
  "script-src 'self'; " +
  "connect-src 'self'; " +
  "worker-src 'self'; " +
  "object-src 'none'; " +
  "frame-ancestors 'none'; " +
  "base-uri 'none'; " +
  "form-action 'self'; " +
  'upgrade-insecure-requests';
