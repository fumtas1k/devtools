/**
 * 陽性対照テスト用 attribute mismatch fixture (issue #414 由来)。
 *
 * SSR (server) では `data-rendered="server"` を出し、CSR (client hydration) では
 * `data-rendered="client"` を出すことで <div> 要素の attribute mismatch を再現する。
 *
 * React 18 の hydration mismatch 仕様:
 * - attribute mismatch は dev で console.error (`A tree hydrated but some
 *   attributes of the server rendered HTML didn't match the client properties.`)
 *   を発火する一方、production build では silent recovery (warning なし) になる。
 * - PR #408 の text content mismatch fixture (HydrationMismatch.tsx) は
 *   production でも `Minified React error #418` を pageerror で throw するが、
 *   attribute mismatch はこのルートを通らない。
 *
 * したがって本 fixture は dev mode 専用 (`hydration-check-dev.gate.spec.ts`)
 * の陽性対照として、 `watchHydrationWarnings` の検知能力を attribute mismatch
 * についても保証する役割を持つ。
 */
export function AttrMismatchFixture() {
  const rendered = typeof window === 'undefined' ? 'server' : 'client';
  return <div data-testid="attr-hydration-fixture" data-rendered={rendered} />;
}
