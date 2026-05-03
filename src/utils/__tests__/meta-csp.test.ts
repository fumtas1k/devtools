import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * dist/*.html に Astro security.csp が注入する <meta http-equiv="content-security-policy">
 * の内容を検証する。`public/_headers` (src/utils/csp.ts:PRODUCTION_CSP) は AND 評価成立の
 * ための permissive 層であり、実質的な script-src strictness は本 meta が支配する設計
 * （docs/decisions.md [064]）。本 meta の strictness が壊れると本ファイルのテストが落ち、
 * 設計の前提崩れを CI で即時検知する。
 *
 * astro.config.mjs の `stripMetaStyleSrc()` integration で <meta> から style-src は除去
 * している（CSP3 仕様で hash と 'unsafe-inline' が共存するとブラウザが unsafe-inline を
 * 無視するため、style-src の strict 化は B 案 PR で React style="..." 200+ 箇所の段階移行
 * と合わせて行う）。本テストでは style-src の不在も検証する。
 *
 * 本テストは built dist/ を入力とするため、`npm run build` 後でないと走らない。
 * CI の e2e job では既に build step があるためその前後に走らせれば pass する。
 */

const DIST_PAGES = [
  path.resolve(process.cwd(), 'dist', 'index.html'),
  path.resolve(process.cwd(), 'dist', 'tools', 'qr-code', 'index.html'),
];

const META_CSP_REGEX = /<meta[^>]*http-equiv="content-security-policy"[^>]*content="([^"]+)"/i;

describe('dist/*.html の <meta> CSP（Astro security.csp 由来 / #176 A-1）', () => {
  for (const distPage of DIST_PAGES) {
    const pageRel = path.relative(process.cwd(), distPage);

    describe(pageRel, () => {
      if (!existsSync(distPage)) {
        it.skip(`${pageRel} が無い → 'npm run build' 後に再実行`, () => {
          // dist が無い時は skip 表示。CI は build → vitest の順で走るため必ずある。
        });
        return;
      }

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

      it('style-src は meta から除去されている (stripMetaStyleSrc integration)', () => {
        // astro.config.mjs の stripMetaStyleSrc() で <meta> CSP から style-src を除く。
        // CSP3 仕様で hash と 'unsafe-inline' 共存時にブラウザが unsafe-inline を無視するため、
        // style-src は header 側 (`'self' 'unsafe-inline'`) のみで制御する。
        // B 案 (#176 アプローチ B) で React style="..." 200+ 箇所を移行後、
        // この strip integration 自体を削除して meta side でも strict 化する。
        expect(cspContent).not.toMatch(/style-src/);
      });
    });
  }
});
