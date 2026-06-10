import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// update-visual-baseline.yml と test-baseline-audit.yml の audit grep パターンが
// 一字一句同一であることを assert する drift 検知 meta テスト。
//
// inline 複製したパターンが drift すると陽性対照が壊れて silent に通過し続けるため、
// この meta テストで CI から自動検知する（issue #334 / docs/decisions.md [100]）。

const BASELINE_WORKFLOW_PATH = '.github/workflows/update-visual-baseline.yml';
const AUDIT_WORKFLOW_PATH = '.github/workflows/test-baseline-audit.yml';

/**
 * ワークフロー YAML のテキストから audit step で使われる grep パターン 2 本を抽出する。
 * 抽出対象:
 *   - grep -iE の引数（suspicious env var の検出パターン）
 *   - grep -vE の引数（allow list パターン）
 *
 * 0 件マッチなら明示 fail させるため、配列を返す（呼び出し側で長さを assert）。
 */
export function extractAuditGrepPatterns(yamlText: string): {
  detectPattern: string | null;
  allowPattern: string | null;
} {
  // grep -iE '...' のシングルクォート内を抽出
  const detectMatch = yamlText.match(/grep -iE '([^']+)'/);
  // grep -vE '...' のシングルクォート内を抽出
  const allowMatch = yamlText.match(/grep -vE '([^']+)'/);

  return {
    detectPattern: detectMatch ? detectMatch[1] : null,
    allowPattern: allowMatch ? allowMatch[1] : null,
  };
}

describe('baseline audit grep パターンの drift 検知', () => {
  const baselineText = readFileSync(BASELINE_WORKFLOW_PATH, 'utf-8');
  const auditText = readFileSync(AUDIT_WORKFLOW_PATH, 'utf-8');

  const baselinePatterns = extractAuditGrepPatterns(baselineText);
  const auditPatterns = extractAuditGrepPatterns(auditText);

  it('update-visual-baseline.yml から detectPattern を抽出できる（空回り防止）', () => {
    expect(
      baselinePatterns.detectPattern,
      `${BASELINE_WORKFLOW_PATH} に grep -iE パターンが見つからない。audit step の構造が変わった可能性がある`
    ).not.toBeNull();
  });

  it('update-visual-baseline.yml から allowPattern を抽出できる（空回り防止）', () => {
    expect(
      baselinePatterns.allowPattern,
      `${BASELINE_WORKFLOW_PATH} に grep -vE パターンが見つからない。audit step の構造が変わった可能性がある`
    ).not.toBeNull();
  });

  it('test-baseline-audit.yml から detectPattern を抽出できる（空回り防止）', () => {
    expect(
      auditPatterns.detectPattern,
      `${AUDIT_WORKFLOW_PATH} に grep -iE パターンが見つからない。陽性対照 workflow の audit pipeline が欠落している可能性がある`
    ).not.toBeNull();
  });

  it('test-baseline-audit.yml から allowPattern を抽出できる（空回り防止）', () => {
    expect(
      auditPatterns.allowPattern,
      `${AUDIT_WORKFLOW_PATH} に grep -vE パターンが見つからない。陽性対照 workflow の audit pipeline が欠落している可能性がある`
    ).not.toBeNull();
  });

  it('両 workflow の detectPattern が完全一致する（drift 検知）', () => {
    // どちらかが null の場合は上記 it で既に fail しているが、安全のため両方確認
    expect(auditPatterns.detectPattern).toBe(baselinePatterns.detectPattern);
  });

  it('両 workflow の allowPattern が完全一致する（drift 検知）', () => {
    expect(auditPatterns.allowPattern).toBe(baselinePatterns.allowPattern);
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

    // 変異させたパターンはオリジナルと一致しないことを assert
    // この test が fail するなら extractAuditGrepPatterns が正しく動作していない
    expect(mutatedPatterns.detectPattern).not.toBeNull();
    expect(mutatedPatterns.detectPattern).not.toBe(originalPatterns.detectPattern);
  });

  it('allowPattern が変異した文字列を比較すると不一致を検知する', () => {
    const mutatedYaml = `
      SUSPECT=$(env | grep -iE '^[A-Z][A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)=' | grep -vE '^(MUTATED_ALLOW_LIST=)' || true)
    `;

    const originalYaml = readFileSync(BASELINE_WORKFLOW_PATH, 'utf-8');
    const originalPatterns = extractAuditGrepPatterns(originalYaml);
    const mutatedPatterns = extractAuditGrepPatterns(mutatedYaml);

    expect(mutatedPatterns.allowPattern).not.toBeNull();
    expect(mutatedPatterns.allowPattern).not.toBe(originalPatterns.allowPattern);
  });
});
