import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * `astro.config.mjs` から `security.csp` 設定が削除されると `<meta>` CSP が
 * 出力されず、`<meta>` strict layer + `_headers` permissive layer の AND 評価
 * 設計（[064]）の前提が崩れる。
 *
 * 本テストは `astro.config.mjs` を文字列として読み込み、必須要素の存在を
 * 直接 assert することで設定削除を CI で即時検知する陽性対照ゲート。
 *
 * 同種の検知は `meta-csp.test.ts` でも `<meta>` 不在として間接的に検出されるが、
 * 本テストは「config レベルで何が壊れたか」を明示するために併設する。
 *
 * 参照: docs/decisions.md [064]、メモリ feedback_positive_control_for_gates.md
 *
 * #250 I-3 / PR #249 レビュー M (defensive replace callback 形式) 対応。
 */

const ASTRO_CONFIG_PATH = path.resolve(process.cwd(), 'astro.config.mjs');
const ASTRO_CONFIG_CONTENT = readFileSync(ASTRO_CONFIG_PATH, 'utf-8');

describe('astro.config.mjs の CSP 関連設定（#176 A-1 / [064] 陽性対照 / #250 I-3）', () => {
  it('`security` ブロックが存在する', () => {
    expect(ASTRO_CONFIG_CONTENT).toMatch(/security\s*:\s*\{/);
  });

  it('`security.csp` ブロックが存在する', () => {
    expect(ASTRO_CONFIG_CONTENT).toMatch(/csp\s*:\s*\{/);
  });

  it("`security.csp.algorithm` が 'SHA-256' に設定されている", () => {
    expect(ASTRO_CONFIG_CONTENT).toMatch(/algorithm\s*:\s*['"]SHA-256['"]/);
  });

  it('`stripMetaStyleSrc()` integration が integrations 配列に含まれる', () => {
    // <meta> CSP の style-src は CSP3 の hash + unsafe-inline 共存制約により
    // strip integration で削除する設計。integration 関数自体の定義と
    // integrations 配列での呼び出しの両方を確認。
    expect(ASTRO_CONFIG_CONTENT).toMatch(/function\s+stripMetaStyleSrc\s*\(/);
    expect(ASTRO_CONFIG_CONTENT).toMatch(/stripMetaStyleSrc\s*\(\s*\)/);
  });

  it('`vite.build.assetsInlineLimit` が 0 に設定されている (data:font CSP 違反防止 / [063])', () => {
    expect(ASTRO_CONFIG_CONTENT).toMatch(/assetsInlineLimit\s*:\s*0/);
  });

  it('stripMetaStyleSrc の full.replace は callback 形式で $ 特殊解釈を回避している (PR #249 review M / #250)', () => {
    // String.prototype.replace(string, string) の semantics で第二引数が string だと
    // $&/$1/$$ などが特殊解釈される。CSP 値に $ が混入した場合の安全網として
    // callback 形式 (() => newAttrs) で渡す実装を維持する。
    expect(ASTRO_CONFIG_CONTENT).toMatch(/full\.replace\(attrs,\s*\(\)\s*=>\s*newAttrs\)/);
  });
});
