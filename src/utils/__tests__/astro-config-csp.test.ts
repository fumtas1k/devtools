import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * `astro.config.mjs` から `security.csp` 設定が削除されると `<meta>` CSP が
 * 出力されず、両層 strict 化 (#176 B 案完了 [068]) の設計が崩れる。
 *
 * 本テストは `astro.config.mjs` を文字列として読み込み、必須要素の存在を
 * 直接 assert することで設定削除を CI で即時検知する陽性対照ゲート。
 *
 * 同種の検知は `meta-csp.test.ts` でも `<meta>` 不在として間接的に検出されるが、
 * 本テストは「config レベルで何が壊れたか」を明示するために併設する。
 *
 * 参照: docs/decisions.md [064] / [068]、メモリ feedback_positive_control_for_gates.md
 *
 * #250 I-3 / PR #249 レビュー M (defensive replace callback 形式) は
 * stripMetaStyleSrc 自体が #176 B 案完了で撤去されたため対応不要 ([068])。
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

  it('`vite.build.assetsInlineLimit` が 0 に設定されている (data:font CSP 違反防止 / [063])', () => {
    expect(ASTRO_CONFIG_CONTENT).toMatch(/assetsInlineLimit\s*:\s*0/);
  });
});
