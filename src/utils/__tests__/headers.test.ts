import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

    it('script-src は self を含む', () => {
      expect(csp).toMatch(/script-src[^;]*'self'/);
    });

    it("style-src は 'unsafe-inline' を許可（React/Astro のインラインスタイル運用上必要）", () => {
      // 219+ 箇所の React `style={{...}}` と Astro `style="..."` が存在するため許可。
      // 中期的には CSS Modules / nonce 化を検討（docs/decisions.md [054] 参照）。
      expect(csp).toMatch(/style-src[^;]*'self'/);
      expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
    });

    it('upgrade-insecure-requests を含む（混在コンテンツ防止）', () => {
      expect(csp).toContain('upgrade-insecure-requests');
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
