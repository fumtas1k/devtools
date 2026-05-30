/**
 * 404 ページ (src/pages/404.astro) の「よく使われるツール」shortcut に出す tool slug。
 *
 * UI から分離してデータ宣言にすることで `tests/meta/featured-404-coverage.test.ts` から
 * import して「全 slug が tools.ts に実在する」ことを機械的に検証できる。slug rename / typo で
 * shortcut が歯抜けになる silent regression を CI で fail させるための切り出し（PR #534 review）。
 */
export const FEATURED_404_SLUGS = [
  'base64',
  'json-xml',
  'qr-code',
  'jwt-decoder',
  'url-encode',
] as const;
