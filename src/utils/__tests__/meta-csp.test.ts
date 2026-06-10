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
 * dist HTML 全ページの inline style hash と `_headers` の完全同期検証 (#316 / #176 B 案完了 / [068]).
 *
 * ### 設計変更 (#316)
 * 旧実装は定数 ASTRO_ISLAND_INLINE_CONTENT を hardcode して hash していたため、
 * Astro が inline style の文字列を変更しても旧 hash を `_headers` に残すと陰性対照で素通りしていた。
 *
 * 新実装は dist HTML から `<style>...</style>` の中身を全件抽出して sha256 を計算し、
 * **全 hash** が `public/_headers` の style-src に含まれることを 1 段で直接 assert する。
 * さらに逆方向（_headers の style-src 内 sha256 token ⊆ dist の hash 集合）も assert し、
 * 旧 hash の残置（CSP 許可面の不要な広がり）も検知する完全同期検証とする。
 * dist と _headers の「直接同期検証」であり、定数の二重管理を排除する。
 *
 * ### 陽性対照の維持
 * - dist のどこかに inline style が少なくとも 1 件存在することを assert（抽出 regex が 0 件で
 *   空回りして全 hash assert が偽 green になるのを防止）。
 * - 空 `<style></style>` が将来出現した場合、空文字列の hash (47DEQpj...) が _headers に
 *   無いため自動 fail する（意図しない空 style 追加を能動検知）。
 *
 * Astro が inline style 文字列を変更すると新 hash が _headers に存在せず fail → silent regression を防ぐ。
 */
describe('dist HTML 全 inline style hash の _headers 含有検証 (#316 / #176 B 案完了 / [068])', () => {
  if (distPages.length === 0) {
    it.skip("dist/*.html が無い → 'npm run build' 後に再実行", () => {});
    return;
  }

  // dist 全 HTML から inline style の中身を全件収集（重複含む）。
  // `[^<]*` ではなく `[\s\S]*?` を使う: CSS が `<` を含む場合（content: "<" 等）に
  // その <style> が抽出から漏れて hash 未検証のまま素通りするのを防ぐ（PR #616 review 指摘）。
  const INLINE_STYLE_REGEX = /<style[^>]*>([\s\S]*?)<\/style>/g;

  // 全ページから inline style content を収集し、distinct set にまとめる
  const allInlineStyleContents = new Set<string>();
  for (const page of distPages) {
    const html = readFileSync(page, 'utf-8');
    for (const match of html.matchAll(INLINE_STYLE_REGEX)) {
      allInlineStyleContents.add(match[1]);
    }
  }

  it('dist HTML に inline style が少なくとも 1 件存在する（陽性対照の空回り防止）', () => {
    // Astro は React island を含むページに astro-island inline style を注入する。
    // 0 件の場合は抽出 regex がマッチしておらず、下記の全 hash assert が偽 green になる。
    // このチェックで「テスト自体が機能しているか」を保証する（test-gates 陽性対照原則）。
    expect(
      allInlineStyleContents.size,
      'dist のどのページにも inline style が見つからない。Astro の出力構造が変わった可能性がある'
    ).toBeGreaterThan(0);
  });

  it('dist の全 inline style sha256 hash が _headers の style-src に含まれる（dist と _headers の直接同期検証）', async () => {
    const { createHash } = await import('node:crypto');
    const headersPath = path.resolve(process.cwd(), 'public', '_headers');
    const headersContent = readFileSync(headersPath, 'utf-8');

    for (const content of allInlineStyleContents) {
      const hash = createHash('sha256').update(content).digest('base64');
      const token = `'sha256-${hash}'`;
      expect(
        headersContent,
        `inline style content の hash ${token} が _headers の style-src に含まれない。\n` +
          `対象 content (先頭 80 文字): ${content.slice(0, 80)}`
      ).toContain(token);
    }
  });

  it('_headers の style-src 内 sha256 token がすべて dist の inline style hash に対応する（逆方向同期 / 旧 hash 残置検知）', async () => {
    // dist → _headers の片方向だけでは、Astro の inline style 変更後に旧 hash が
    // _headers に残置されても検知できない（CSP 許可面が不要に広いまま残る）。
    // 逆方向も assert して dist ⇔ _headers の完全同期にする（PR #616 review 指摘）。
    const { createHash } = await import('node:crypto');
    const headersPath = path.resolve(process.cwd(), 'public', '_headers');
    const headersContent = readFileSync(headersPath, 'utf-8');

    // コメント行にも "style-src" の語が出現するため、実ヘッダ行に限定してから抽出する
    const cspLineMatch = headersContent.match(/^\s*Content-Security-Policy:(.*)$/m);
    expect(
      cspLineMatch,
      '_headers に Content-Security-Policy ヘッダ行が見つからない'
    ).not.toBeNull();
    const styleSrcMatch = (cspLineMatch?.[1] ?? '').match(/style-src ([^;]*)/);
    expect(styleSrcMatch, '_headers に style-src ディレクティブが見つからない').not.toBeNull();

    const headerTokens = [
      ...(styleSrcMatch?.[1] ?? '').matchAll(/'sha256-([A-Za-z0-9+/=]+)'/g),
    ].map((m) => m[1]);
    // _headers 側に hash が 1 件も無い場合は token 抽出の空回りを疑って明示 fail
    expect(
      headerTokens.length,
      '_headers の style-src に sha256 token が 1 件も無い'
    ).toBeGreaterThan(0);

    const distHashes = new Set(
      [...allInlineStyleContents].map((content) =>
        createHash('sha256').update(content).digest('base64')
      )
    );
    for (const token of headerTokens) {
      expect(
        distHashes.has(token),
        `_headers の style-src にある 'sha256-${token}' に対応する inline style が dist に存在しない（旧 hash の残置）`
      ).toBe(true);
    }
  });
});
