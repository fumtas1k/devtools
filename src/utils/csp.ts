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
 *
 * AND 評価が runtime で実際に効くことの E2E 検証は
 * `tests/e2e/csp-and-evaluation.spec.ts` を参照。
 *
 * #176 A-1 以降、script-src の 'unsafe-inline' は意図的に維持している。Astro
 * `security.csp` が生成する `<meta>` CSP が `script-src 'self' 'sha256-...'` で
 * hash-only の strict layer を提供し、ブラウザの AND 評価で実質的な strictness は
 * meta が支配する。ヘッダ側 (本定数) は AND 評価成立のための permissive 層で、
 * defense-in-depth fallback としても機能する。詳細は `docs/decisions.md` [064]。
 *
 * #176 B 案完了 ([068]) で style-src は両層 strict 化。Astro island runtime の
 * inline style (`<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>`)
 * の sha256 hash を handcoded fingerprint で取り込む。検出網は `meta-csp.test.ts` /
 * `headers.test.ts`、Astro 文字列変更時は CI fail で能動検知される。
 */
export const PRODUCTION_CSP =
  "default-src 'self'; " +
  "img-src 'self' data: blob:; " +
  "media-src 'self' blob:; " +
  "style-src 'self' 'sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow='; " +
  "script-src 'self' 'unsafe-inline'; " +
  "connect-src 'self'; " +
  "worker-src 'self'; " +
  "object-src 'none'; " +
  "frame-ancestors 'none'; " +
  "base-uri 'none'; " +
  "form-action 'self'; " +
  'upgrade-insecure-requests';
