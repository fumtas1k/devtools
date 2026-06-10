import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// VRT PR comment build step の陽性対照スクリプトの健全性検証
// issue #324 参照: visual-regression.yml の失敗 spec 抽出 pipeline は
// VRT 失敗時のみ通る経路で CI 実証手段がないため、スクリプトで再現して検証する。
//
// さらにスクリプトは workflow の pipeline（grep + awk）を inline 複製しているため、
// 複製元 workflow との drift を検知する meta テストを併設する（PR #616 review 指摘）。
// workflow 側の抽出ロジックだけが修正されると、スクリプトは旧 pipeline を検証し続けて
// green のまま — 「検知機構が壊れても green」クラスの残存を防ぐ。

const SCRIPT_PATH = 'scripts/test-vrt-comment-build.sh';
const WORKFLOW_PATH = '.github/workflows/visual-regression.yml';

/**
 * テキストから失敗 spec 抽出 pipeline の構成要素を全出現抽出する。
 * 抽出対象:
 *   - grep -E の引数（✘ 行の検出パターン）
 *   - grep -v の引数（retry 行の除外パターン）
 *   - awk -F'›' の program body（spec 名 / viewport の抽出ロジック）
 *
 * awk body は表記揺れを吸収するため正規化する:
 *   - heredoc エスケープ `\$` → `$`（スクリプト側は bash heredoc 内で `$` をエスケープしている）
 *   - 連続空白 / 改行 → 単一スペース（インデント差を無視）
 *
 * 0 件マッチなら空配列を返す（呼び出し側で長さを assert して空回りを防止する）。
 */
export function extractPipelineParts(text: string): {
  detectGreps: string[];
  retryGreps: string[];
  awkBodies: string[];
} {
  const detectGreps = [...text.matchAll(/grep -E '([^']+)'/g)].map((m) => m[1]);
  const retryGreps = [...text.matchAll(/grep -v '([^']+)'/g)].map((m) => m[1]);
  const awkBodies = [...text.matchAll(/awk -F'›' '(\{[\s\S]*?\})'/g)].map((m) =>
    normalizeAwkBody(m[1])
  );
  return { detectGreps, retryGreps, awkBodies };
}

function normalizeAwkBody(body: string): string {
  return body.replace(/\\\$/g, '$').replace(/\s+/g, ' ').trim();
}

describe('scripts/test-vrt-comment-build.sh', () => {
  it('スクリプトが bash で解釈できる構文を持つ', () => {
    // bash -n で構文チェックのみ実行（副作用なし）
    expect(() => execFileSync('bash', ['-n', SCRIPT_PATH], { cwd: process.cwd() })).not.toThrow();
  });

  it('3 ケース（陰性 A・陰性 B・陽性 C）が全て pass する', () => {
    // スクリプト本体実行。exit 0 = 全ケース green。
    // タイムアウトは 30 秒（bash サブプロセスが複数起動するため余裕を持たせる）。
    const result = spawnSync('bash', [SCRIPT_PATH], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 30000,
    });

    // 失敗時に stdout/stderr を表示してデバッグしやすくする
    if (result.status !== 0) {
      console.error('stdout:', result.stdout);
      console.error('stderr:', result.stderr);
    }

    expect(result.status, 'スクリプトが非 0 で終了した').toBe(0);
  });
});

describe('スクリプトと visual-regression.yml の pipeline drift 検知', () => {
  const scriptText = readFileSync(SCRIPT_PATH, 'utf-8');
  const workflowText = readFileSync(WORKFLOW_PATH, 'utf-8');

  const scriptParts = extractPipelineParts(scriptText);
  const workflowParts = extractPipelineParts(workflowText);

  it('workflow から pipeline 構成要素を抽出できる（空回り防止）', () => {
    expect(
      workflowParts.detectGreps.length,
      `${WORKFLOW_PATH} に grep -E パターンが見つからない。comment build step の構造が変わった可能性がある`
    ).toBeGreaterThan(0);
    expect(workflowParts.retryGreps.length).toBeGreaterThan(0);
    expect(workflowParts.awkBodies.length).toBeGreaterThan(0);
  });

  it('スクリプトから pipeline 構成要素を抽出できる（空回り防止）', () => {
    // スクリプトはケース A / B / C で pipeline を 3 回複製している
    expect(
      scriptParts.detectGreps.length,
      `${SCRIPT_PATH} に grep -E パターンが見つからない。再現 pipeline が欠落している可能性がある`
    ).toBeGreaterThan(0);
    expect(scriptParts.retryGreps.length).toBeGreaterThan(0);
    expect(scriptParts.awkBodies.length).toBeGreaterThan(0);
  });

  it('全出現の grep 検出パターンが workflow と一致する（drift 検知）', () => {
    const reference = workflowParts.detectGreps[0];
    for (const p of [...workflowParts.detectGreps, ...scriptParts.detectGreps]) {
      expect(p, '✘ 行検出の grep -E パターンが workflow とスクリプト間で drift している').toBe(
        reference
      );
    }
  });

  it('全出現の grep retry 除外パターンが workflow と一致する（drift 検知）', () => {
    const reference = workflowParts.retryGreps[0];
    for (const p of [...workflowParts.retryGreps, ...scriptParts.retryGreps]) {
      expect(p, 'retry 除外の grep -v パターンが workflow とスクリプト間で drift している').toBe(
        reference
      );
    }
  });

  it('全出現の awk body が workflow と一致する（drift 検知 / 正規化後比較）', () => {
    const reference = workflowParts.awkBodies[0];
    for (const b of [...workflowParts.awkBodies, ...scriptParts.awkBodies]) {
      expect(b, 'awk 抽出ロジックが workflow とスクリプト間で drift している').toBe(reference);
    }
  });
});

describe('[陽性対照] extractPipelineParts — pipeline 変異を検知できること', () => {
  it('awk body が変異した断片を比較すると不一致を検知する', () => {
    // FAKE: spec 抽出の awk body を意図的に変異させた断片
    const mutatedFragment = `
      | awk -F'›' '{ print "MUTATED" }' \\
    `;

    const workflowText = readFileSync(WORKFLOW_PATH, 'utf-8');
    const original = extractPipelineParts(workflowText);
    const mutated = extractPipelineParts(mutatedFragment);

    // この test が fail するなら extractPipelineParts が正しく動作していない
    expect(mutated.awkBodies).toHaveLength(1);
    expect(mutated.awkBodies[0]).not.toBe(original.awkBodies[0]);
  });

  it('grep 検出パターンが変異した断片を比較すると不一致を検知する', () => {
    const mutatedFragment = `
      ( grep -E '^MUTATED_PATTERN' "\$LOG_FILE" | grep -v '(retry' ) || true
    `;

    const workflowText = readFileSync(WORKFLOW_PATH, 'utf-8');
    const original = extractPipelineParts(workflowText);
    const mutated = extractPipelineParts(mutatedFragment);

    expect(mutated.detectGreps).toHaveLength(1);
    expect(mutated.detectGreps[0]).not.toBe(original.detectGreps[0]);
  });
});
