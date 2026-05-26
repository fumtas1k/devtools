/**
 * VRT 対象ページ一覧。
 *
 * 新規ツール追加時は本配列に `/tools/<slug>` を追加すること。
 * baseline は CI Linux runner で `Update Visual Regression Baseline` workflow を
 * `workflow_dispatch` trigger して生成する (mac との font 描画差を回避)。
 *
 * `tests/meta/vrt-pages-coverage.test.ts` が `src/data/tools.ts` の全 slug と
 * 本配列の整合性を機械的に検証する (issue #355 で導入された再発防止策)。
 *
 * 切り出し理由: Playwright spec ファイルからの直接 import は spec 副作用 (test.describe 等) を
 * vitest 環境に持ち込むため、定数のみを別ファイルに分離。
 */
export const PAGES = [
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
  '/tools/char-count',
  '/tools/totp-hotp',
  '/tools/sql-formatter',
] as const;

export const STATIC_PAGES = new Set<string>(['/', '/about', '/privacy']);
