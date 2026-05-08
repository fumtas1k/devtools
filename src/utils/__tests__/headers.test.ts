import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PRODUCTION_CSP } from '../csp';

/**
 * public/_headers の内容を検証する。
 *
 * Cloudflare Pages / Netlify 互換のレスポンスヘッダ定義ファイル。
 * 採用根拠と各ディレクティブの判断は docs/decisions.md [054] を参照。
 *
 * Vitest はプロジェクトルートを `process.cwd()` として実行するため、
 * リポジトリ構造に依存しない `process.cwd()` 起点で解決する。
 */
const HEADERS_PATH = path.resolve(process.cwd(), 'public', '_headers');

const HEADERS_CONTENT = readFileSync(HEADERS_PATH, 'utf-8');

/**
 * `/*` ブロックから対象ヘッダ行を抽出するヘルパ。
 * 行頭スペースがあること（`_headers` フォーマット仕様）と、
 * `Header-Name:` で始まることを満たす最初の行を返す。
 */
function extractHeader(name: string): string {
  const lines = HEADERS_CONTENT.split('\n');
  const match = lines.find(
    (line) => /^\s+/.test(line) && line.trim().toLowerCase().startsWith(`${name.toLowerCase()}:`)
  );
  if (!match) {
    throw new Error(`Header "${name}" not found in public/_headers`);
  }
  return match.trim();
}

describe('public/_headers', () => {
  it('`/*` パスマッチブロックを含む', () => {
    expect(HEADERS_CONTENT).toMatch(/^\/\*\s*$/m);
  });

  describe('Content-Security-Policy', () => {
    const csp = extractHeader('Content-Security-Policy');

    it('default-src は self に限定', () => {
      expect(csp).toContain("default-src 'self'");
    });

    it('frame-ancestors none でクリックジャッキングを防止', () => {
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('base-uri none で <base> タグ経由の改ざんを防止', () => {
      expect(csp).toContain("base-uri 'none'");
    });

    it('object-src none で <object>/<embed> 経由の埋め込みを禁止', () => {
      expect(csp).toContain("object-src 'none'");
    });

    it('form-action は self に限定', () => {
      expect(csp).toContain("form-action 'self'");
    });

    it('img-src は data: と blob: を許可（QR/ファイル変換ツール用途）', () => {
      expect(csp).toContain('img-src');
      expect(csp).toMatch(/img-src[^;]*'self'/);
      expect(csp).toMatch(/img-src[^;]*data:/);
      expect(csp).toMatch(/img-src[^;]*blob:/);
    });

    it('media-src は blob: を許可（カメラ映像ストリーム用途）', () => {
      expect(csp).toContain('media-src');
      expect(csp).toMatch(/media-src[^;]*blob:/);
    });

    it('connect-src は self に限定（外部送信を排除）', () => {
      expect(csp).toContain("connect-src 'self'");
    });

    it("script-src は 'self' と 'unsafe-inline' を保持する (#176 — meta strict layer 採用後の設計)", () => {
      // #176 A-1: 'unsafe-inline' の "実質的な" 削減は Astro security.csp が生成する
      // <meta> CSP の script-src 'self' 'sha256-...' (hash-only) で達成している。
      // ヘッダ側 (本ファイル) は AND 評価成立のため permissive のままにし、
      // ブラウザの AND 評価で meta の strictness が支配する設計（[064]）。
      // <meta> 側の strictness は src/utils/__tests__/meta-csp.test.ts で別途検証する。
      expect(csp).toMatch(/script-src[^;]*'self'/);
      expect(csp).toMatch(/script-src[^;]*'unsafe-inline'/);
    });

    it("style-src は 'self' のみで 'unsafe-inline' を含まない (#176 B 案完了 / [068])", () => {
      // PR 1〜7b で React `style={{` / Astro `style="..."` 全廃 (PR 9 で setProperty
      // 経路も Constructable Stylesheets 化) + 本 PR (PR 10) で両層 strict 化。
      // 残る暗黙 inline style 経路は Astro island runtime のみで、当該 hash を取り込む。
      // CSP3 仕様で hash と 'unsafe-inline' 共存時に unsafe-inline は無効化されるため、
      // 'unsafe-inline' 不在を陽性 assert する。
      // 詳細: docs/decisions.md [068]
      expect(csp).toMatch(/style-src[^;]*'self'/);
      expect(csp).not.toMatch(/style-src[^;]*'unsafe-inline'/);
    });

    it('style-src に Astro island runtime hash が含まれる (#176 B 案完了 / [068])', () => {
      // Astro 島ランタイム injection の inline style:
      // <style>astro-island,astro-slot,astro-static-slot{display:contents}</style>
      // の sha256 hash を _headers の style-src に hardcode する handcoded
      // fingerprint 戦略。Astro が当該文字列を変更すると本テストは pass し続けるが、
      // meta-csp.test.ts の整合性メタテストが fail して検知する。
      // 詳細: docs/decisions.md [068]
      expect(csp).toMatch(/style-src[^;]*'sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L\/9Cfn2H6LMk7\/ow='/);
    });

    it('upgrade-insecure-requests を含む（混在コンテンツ防止）', () => {
      expect(csp).toContain('upgrade-insecure-requests');
    });

    it('src/utils/csp.ts の PRODUCTION_CSP と完全一致する', () => {
      // E2E テスト (tests/e2e/helpers.ts の applyProductionCsp) はこの定数を
      // 用いてレスポンスヘッダを注入し本番相当の CSP 環境を再現する。
      // _headers と PRODUCTION_CSP が乖離すると、E2E が本番と別ポリシーを
      // 評価することになりリグレッション検知ゲートが空回りする。両者を
      // 完全一致で固定し、片方更新の事故を Vitest で即時検出する。
      const headerValue = csp.replace(/^Content-Security-Policy:\s*/i, '');
      expect(headerValue).toBe(PRODUCTION_CSP);
    });
  });

  describe('追加のセキュリティヘッダ', () => {
    it('X-Content-Type-Options: nosniff を含む', () => {
      const header = extractHeader('X-Content-Type-Options');
      expect(header).toBe('X-Content-Type-Options: nosniff');
    });

    it('X-Frame-Options: DENY を含む（旧ブラウザ補完）', () => {
      // frame-ancestors 'none' でモダンブラウザはカバーされるが、
      // 業界慣習として X-Frame-Options も併記する。
      const header = extractHeader('X-Frame-Options');
      expect(header).toBe('X-Frame-Options: DENY');
    });

    it('Referrer-Policy: strict-origin-when-cross-origin を含む', () => {
      const header = extractHeader('Referrer-Policy');
      expect(header).toBe('Referrer-Policy: strict-origin-when-cross-origin');
    });

    it('Permissions-Policy で camera は self に限定', () => {
      const header = extractHeader('Permissions-Policy');
      expect(header).toMatch(/camera=\(self\)/);
    });

    it('Permissions-Policy で microphone は明示的に無効化', () => {
      const header = extractHeader('Permissions-Policy');
      expect(header).toMatch(/microphone=\(\)/);
    });

    it('Permissions-Policy で geolocation は明示的に無効化', () => {
      const header = extractHeader('Permissions-Policy');
      expect(header).toMatch(/geolocation=\(\)/);
    });
  });
});
