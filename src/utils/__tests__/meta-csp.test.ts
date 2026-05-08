import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import path from 'node:path';

/**
 * dist/*.html に Astro security.csp が注入する <meta http-equiv="content-security-policy">
 * の内容を検証する。`public/_headers` (src/utils/csp.ts:PRODUCTION_CSP) は AND 評価成立の
 * ための permissive 層であり、実質的な script-src strictness は本 meta が支配する設計
 * （docs/decisions.md [064]）。本 meta の strictness が壊れると本ファイルのテストが落ち、
 * 設計の前提崩れを CI で即時検知する。
 *
 * `<meta>` 側の style-src は #176 B 案完了 ([068]) で `'self'` + Astro island hash の
 * strict 形式に。stripMetaStyleSrc integration を撤去し Astro security.csp の自動 hash
 * 付与をそのまま活用。本テストで strict 形式 (`'unsafe-inline'` 不在) を陽性 assert +
 * Astro inline style 検出網 + sha256 整合性メタテストを併設する。
 *
 * 本テストは built dist/ を入力とするため、`npm run build` 後でないと走らない。
 * CI の test job では `npm run build` step を先に走らせる構成（`.github/workflows/test.yml` / #250 で追加）。
 * dist 不在時は `it.skip` で safe-fail するが、CI で skip 化が起きた場合は test job の build step 抜けを疑うこと。
 *
 * #250: DIST_PAGES を 2 ページ固定から dist/**\/*.html 全件の glob に拡張。
 * 将来ページ固有の inline script が追加された場合も自動で検出網に含まれる。
 */

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const META_CSP_REGEX = /<meta[^>]*http-equiv="content-security-policy"[^>]*content="([^"]+)"/i;

// top-level await: vitest は vite-node 経由で ESM として実行されるため利用可能。
// dist が無い場合 (build 前) は空配列のまま skip フローに進む。
const distPages: string[] = [];
if (existsSync(DIST_DIR)) {
  for await (const f of glob('**/*.html', { cwd: DIST_DIR })) {
    distPages.push(`${DIST_DIR}/${f}`);
  }
  distPages.sort();
}

describe('dist/*.html の <meta> CSP（Astro security.csp 由来 / #176 A-1 / #250 全ページ拡張）', () => {
  if (distPages.length === 0) {
    it.skip("dist/*.html が無い → 'npm run build' 後に再実行", () => {});
    return;
  }

  it(`build 出力の HTML 全ページ (${distPages.length} 件) を検査対象とする`, () => {
    expect(distPages.length).toBeGreaterThan(0);
  });

  for (const distPage of distPages) {
    const pageRel = path.relative(process.cwd(), distPage);

    describe(pageRel, () => {
      const html = readFileSync(distPage, 'utf-8');
      const match = html.match(META_CSP_REGEX);

      it('<meta http-equiv="content-security-policy"> が存在する', () => {
        expect(match, '<meta CSP> が dist HTML に注入されていない').not.toBeNull();
      });

      const cspContent = match?.[1] ?? '';

      it("script-src に 'self' が含まれる", () => {
        expect(cspContent).toMatch(/script-src[^;]*'self'/);
      });

      it('script-src に sha256- ハッシュが少なくとも 1 つ含まれる', () => {
        // Astro security.csp が inline script を auto-hash した結果。
        // 1 つも無い場合は security.csp が無効化されているか失敗している。
        expect(cspContent).toMatch(/script-src[^;]*'sha256-[A-Za-z0-9+/=]+'/);
      });

      it("script-src に 'unsafe-inline' が含まれない (meta strict layer の核心)", () => {
        // 本 PR の主目的: <meta> の script-src は hash-only の strict policy。
        // 万一 'unsafe-inline' が混入すると meta strictness が機能せず、
        // ブラウザの AND 評価で header policy の permissive が支配的になり XSS 緩和が後退する。
        expect(cspContent).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      });

      it("style-src は 'self' のみで 'unsafe-inline' を含まない (#176 B 案完了 / [068])", () => {
        // [068] B 案完了。React style={{ / Astro style="" / SVG inline style /
        // setProperty 経路が全廃された後、<meta> CSP も style-src 'self' で安全に
        // 運用可能。本 PR commit 2 で stripMetaStyleSrc integration を削除した
        // 結果、Astro security.csp 由来の <meta> に style-src がそのまま出力される。
        expect(cspContent).toMatch(/style-src[^;]*'self'/);
        expect(cspContent).not.toMatch(/style-src[^;]*'unsafe-inline'/);
      });

      it('style-src に sha256- ハッシュが少なくとも 1 つ含まれる (Astro auto-hash)', () => {
        // Astro security.csp が <style> ブロックを auto-hash した結果。
        // Astro island runtime の inline style (sha256-vv9I...) も auto-hash 対象に
        // 含まれる。1 つも無い場合は security.csp が無効化されているか失敗している。
        expect(cspContent).toMatch(/style-src[^;]*'sha256-[A-Za-z0-9+/=]+'/);
      });
    });
  }
});

/**
 * Astro island runtime の inline style hash 整合性検出網 (#176 B 案完了 / [068]).
 *
 * Astro が各ページに injection する固定 inline style:
 *   <style>astro-island,astro-slot,astro-static-slot{display:contents}</style>
 * の sha256 hash を `_headers` の style-src に hardcoded fingerprint として
 * 取り込む handcoded 戦略 (option α、`docs/decisions.md [068]` 参照)。
 *
 * 本検出網は以下を assert する:
 * 1. dist HTML 内に Astro island inline style literal が含まれること
 * 2. dist HTML inline style content の sha256 が `_headers` の hash 値と一致すること
 *
 * Astro が当該 inline style 文字列を変更すると検出 1 / 2 が連鎖的に fail し、
 * silent regression を防ぐ陽性対照メタテスト。
 */
describe('Astro island runtime style hash 整合性 (#176 B 案完了 / [068])', () => {
  if (distPages.length === 0) {
    it.skip("dist/*.html が無い → 'npm run build' 後に再実行", () => {});
    return;
  }

  const ASTRO_ISLAND_INLINE_STYLE =
    '<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>';
  const ASTRO_ISLAND_INLINE_CONTENT = 'astro-island,astro-slot,astro-static-slot{display:contents}';

  it('dist HTML 内に Astro island inline style literal が含まれる (React island ありページ)', () => {
    // Astro は React island を含むページにのみ astro-island inline style を注入する。
    // about / privacy 等の純 Astro ページには含まれないため、distPages 全体で
    // 少なくとも 1 ページに含まれることを assert (some パターン)。
    const hasInlineStyle = distPages.some((page) =>
      readFileSync(page, 'utf-8').includes(ASTRO_ISLAND_INLINE_STYLE)
    );
    expect(
      hasInlineStyle,
      'dist のどのページにも Astro island inline style literal が見つからない'
    ).toBe(true);
  });

  it('dist HTML inline style の sha256 が _headers の hash と一致する (陽性対照メタテスト)', async () => {
    const { createHash } = await import('node:crypto');
    const computedHash = createHash('sha256').update(ASTRO_ISLAND_INLINE_CONTENT).digest('base64');
    const expectedToken = `'sha256-${computedHash}'`;

    const headersPath = path.resolve(process.cwd(), 'public', '_headers');
    const headersContent = readFileSync(headersPath, 'utf-8');

    expect(headersContent).toContain(expectedToken);
  });
});
