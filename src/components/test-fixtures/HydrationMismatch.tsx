/**
 * 陽性対照テスト用 fixture component。
 *
 * SSR (server) では `typeof window === 'undefined'` のため "SERVER" を出力し、
 * CSR (client hydration) では "CLIENT" を出力する。React 18 はこの text mismatch を
 * 検出して console.error / pageerror で hydration warning を出す。
 *
 * `tests/e2e/hydration-check.gate.spec.ts` から `/test-fixtures/hydration-broken`
 * を訪問することで watchHydrationWarnings の検知能力を保証する陽性対照
 * (test-gates skill の要件)。
 *
 * **prod に何故残すか**: Playwright preview server は `npm run build` 出力を配信
 * するため、Astro `_` prefix 除外を使うと preview からも到達不能になる。fixture
 * page 側で noindex meta を付け、tools.ts にも登録しないことで実害を最小化する。
 */
export function HydrationMismatchFixture() {
  const renderedOn = typeof window === 'undefined' ? 'SERVER' : 'CLIENT';
  return <div data-testid="hydration-fixture">rendered on: {renderedOn}</div>;
}
