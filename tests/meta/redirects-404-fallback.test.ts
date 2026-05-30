import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * meta test: public/_redirects の 404 fallback ルールを検証する (PR #534 review follow-up)。
 *
 * 背景: 本番 (Cloudflare Pages) では `/test-fixtures/*` を 404 化するため _redirects に
 * `/test-fixtures/*  /404  404` を置いている。astro preview (Playwright webServer) は
 * _redirects を解釈しないため、この destination 整合性は E2E では守れない。
 * 本 test で「destination が /404 を指す 404 ルールが存在する」ことを string 検査し、
 * 行が消えたり destination が書き換わった regression を CI で fail させる。
 */

const redirectsPath = fileURLToPath(new URL('../../public/_redirects', import.meta.url));

/** _redirects テキストから「destination /404・status 404」のルール行を抽出する純粋関数 */
function findFallback404Rules(redirectsText: string): string[] {
  return redirectsText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .filter((line) => {
      const cols = line.split(/\s+/);
      // 形式: <from> <to> [status]  → to が /404 かつ status が 404
      return cols[1] === '/404' && cols[2] === '404';
    });
}

describe('public/_redirects 404 fallback', () => {
  it('destination が /404 を指す 404 ステータスのルールが存在する', () => {
    const text = readFileSync(redirectsPath, 'utf8');
    const rules = findFallback404Rules(text);
    expect(rules.length).toBeGreaterThan(0);
  });

  it('test-fixtures の 404 化ルールが維持されている', () => {
    const text = readFileSync(redirectsPath, 'utf8');
    expect(text).toMatch(/^\/test-fixtures\/\*\s+\/404\s+404\s*$/m);
  });
});

// 陽性対照: 検知機構が空回りしていないことを保証 (test-gates skill 準拠)。
describe('[陽性対照] _redirects 404 fallback 検知機構', () => {
  it('404 ルールを含まない fixture では検出ゼロ', () => {
    const fixture = '# comment only\n/old  /new  301\n';
    expect(findFallback404Rules(fixture)).toEqual([]);
  });

  it('destination が /404 でないルールは fallback として検出しない (過検知なし)', () => {
    // status は 404 だが destination が別ページ → fallback ではない
    const fixture = '/foo/*  /bar  404\n';
    expect(findFallback404Rules(fixture)).toEqual([]);
  });

  it('正しい 404 fallback ルールは検出する', () => {
    const fixture = '/test-fixtures/*  /404  404\n';
    expect(findFallback404Rules(fixture)).toEqual(['/test-fixtures/*  /404  404']);
  });
});
