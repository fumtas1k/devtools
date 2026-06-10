import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// update-visual-baseline.yml と test-baseline-audit.yml の audit grep パターンが
// 一字一句同一であることを assert する drift 検知 meta テスト。
//
// inline 複製したパターンが drift すると陽性対照が壊れて silent に通過し続けるため、
// この meta テストで CI から自動検知する（issue #334 / docs/decisions.md [100]）。
// test-baseline-audit.yml は pipeline を陽性対照 / 陰性対照の 2 step で複製しているため、
// 先頭 1 出現だけでなく **全出現** を抽出して相互一致を assert する（2 箇所目の drift 見逃し防止）。

const BASELINE_WORKFLOW_PATH = '.github/workflows/update-visual-baseline.yml';
const AUDIT_WORKFLOW_PATH = '.github/workflows/test-baseline-audit.yml';

/**
 * ワークフロー YAML のテキストから audit step で使われる grep パターンを全出現抽出する。
 * 抽出対象:
 *   - grep -iE の引数（suspicious env var の検出パターン）
 *   - grep -vE の引数（allow list パターン）
 *
 * 0 件マッチなら空配列を返す（呼び出し側で長さを assert して空回りを防止する）。
 */
export function extractAuditGrepPatterns(yamlText: string): {
  detectPatterns: string[];
  allowPatterns: string[];
} {
  // grep -iE '...' / grep -vE '...' のシングルクォート内を全出現抽出
  const detectPatterns = [...yamlText.matchAll(/grep -iE '([^']+)'/g)].map((m) => m[1]);
  const allowPatterns = [...yamlText.matchAll(/grep -vE '([^']+)'/g)].map((m) => m[1]);

  return { detectPatterns, allowPatterns };
}

describe('baseline audit grep パターンの drift 検知', () => {
  const baselineText = readFileSync(BASELINE_WORKFLOW_PATH, 'utf-8');
  const auditText = readFileSync(AUDIT_WORKFLOW_PATH, 'utf-8');

  const baselinePatterns = extractAuditGrepPatterns(baselineText);
  const auditPatterns = extractAuditGrepPatterns(auditText);

  it('update-visual-baseline.yml から detect / allow パターンを抽出できる（空回り防止）', () => {
    expect(
      baselinePatterns.detectPatterns.length,
      `${BASELINE_WORKFLOW_PATH} に grep -iE パターンが見つからない。audit step の構造が変わった可能性がある`
    ).toBeGreaterThan(0);
    expect(
      baselinePatterns.allowPatterns.length,
      `${BASELINE_WORKFLOW_PATH} に grep -vE パターンが見つからない。audit step の構造が変わった可能性がある`
    ).toBeGreaterThan(0);
  });

  it('test-baseline-audit.yml から detect / allow パターンを抽出できる（空回り防止）', () => {
    expect(
      auditPatterns.detectPatterns.length,
      `${AUDIT_WORKFLOW_PATH} に grep -iE パターンが見つからない。陽性対照 workflow の audit pipeline が欠落している可能性がある`
    ).toBeGreaterThan(0);
    expect(
      auditPatterns.allowPatterns.length,
      `${AUDIT_WORKFLOW_PATH} に grep -vE パターンが見つからない。陽性対照 workflow の audit pipeline が欠落している可能性がある`
    ).toBeGreaterThan(0);
  });

  it('全出現の detectPattern が両 workflow 間で完全一致する（drift 検知）', () => {
    const reference = baselinePatterns.detectPatterns[0];
    // 正本（update-visual-baseline.yml）内の全出現 + 陽性対照 workflow 内の全出現が
    // すべて同一文字列であることを assert。どれか 1 箇所だけ書き換わった drift も検知する。
    for (const p of [...baselinePatterns.detectPatterns, ...auditPatterns.detectPatterns]) {
      expect(p, 'detect パターンが workflow 間（または同一 workflow 内）で drift している').toBe(
        reference
      );
    }
  });

  it('全出現の allowPattern が両 workflow 間で完全一致する（drift 検知）', () => {
    const reference = baselinePatterns.allowPatterns[0];
    for (const p of [...baselinePatterns.allowPatterns, ...auditPatterns.allowPatterns]) {
      expect(p, 'allow パターンが workflow 間（または同一 workflow 内）で drift している').toBe(
        reference
      );
    }
  });
});

describe('[陽性対照] extractAuditGrepPatterns — パターン変異を検知できること', () => {
  it('detectPattern が変異した文字列を比較すると不一致を検知する', () => {
    // FAKE: 検出パターンを意図的に変異させた YAML 断片
    const mutatedYaml = `
      SUSPECT=$(env | grep -iE '^MUTATED_PATTERN_THAT_WONT_MATCH=' | grep -vE '^(GITHUB_TOKEN=|RUNNER_|GITHUB_RUN_|ACTIONS_|GH_|PIP_|PYPI_)' || true)
    `;

    const originalYaml = readFileSync(BASELINE_WORKFLOW_PATH, 'utf-8');
    const originalPatterns = extractAuditGrepPatterns(originalYaml);
    const mutatedPatterns = extractAuditGrepPatterns(mutatedYaml);

    // 変異させたパターンはオリジナルと一致しないことを assert。
    // この test が fail するなら extractAuditGrepPatterns が正しく動作していない
    expect(mutatedPatterns.detectPatterns).toHaveLength(1);
    expect(mutatedPatterns.detectPatterns[0]).not.toBe(originalPatterns.detectPatterns[0]);
  });

  it('allowPattern が変異した文字列を比較すると不一致を検知する', () => {
    const mutatedYaml = `
      SUSPECT=$(env | grep -iE '^[A-Z][A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)=' | grep -vE '^(MUTATED_ALLOW_LIST=)' || true)
    `;

    const originalYaml = readFileSync(BASELINE_WORKFLOW_PATH, 'utf-8');
    const originalPatterns = extractAuditGrepPatterns(originalYaml);
    const mutatedPatterns = extractAuditGrepPatterns(mutatedYaml);

    expect(mutatedPatterns.allowPatterns).toHaveLength(1);
    expect(mutatedPatterns.allowPatterns[0]).not.toBe(originalPatterns.allowPatterns[0]);
  });
});
