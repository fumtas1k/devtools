import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// security-audit.yml の gate（npm-audit）と陽性対照（npm-audit-positive-control）が
// 同じ閾値・同じコマンドで audit していることを assert する drift 検知 meta テスト。
// 片方だけ閾値が変わると、陽性対照が green のまま gate の検知能力が落ちる。

const WORKFLOW_PATH = '.github/workflows/security-audit.yml';
const AUDIT_COMMAND = 'npm audit --audit-level="$AUDIT_LEVEL"';
const EXPECTED_AUDIT_LEVEL = 'high';

type StepDoc = { run?: unknown; 'continue-on-error'?: unknown };
type JobDoc = { steps?: unknown; 'continue-on-error'?: unknown };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getSteps(job: JobDoc | null): StepDoc[] {
  return Array.isArray(job?.steps) ? (job.steps as StepDoc[]) : [];
}

function findAuditSteps(job: JobDoc | null): StepDoc[] {
  return getSteps(job).filter(
    (step) => typeof step.run === 'string' && step.run.includes(AUDIT_COMMAND)
  );
}

export function collectSecurityAuditViolations(workflowText: string): string[] {
  const parsed = asRecord(parse(workflowText));
  if (!parsed) {
    return ['workflow document must be a mapping'];
  }

  const violations: string[] = [];
  const env = asRecord(parsed.env);
  if (env?.AUDIT_LEVEL !== EXPECTED_AUDIT_LEVEL) {
    violations.push(`workflow env AUDIT_LEVEL must be ${EXPECTED_AUDIT_LEVEL}`);
  }

  const jobs = asRecord(parsed.jobs);
  const gate = asRecord(jobs?.['npm-audit']) as JobDoc | null;
  const positive = asRecord(jobs?.['npm-audit-positive-control']) as JobDoc | null;

  const gateSteps = findAuditSteps(gate);
  if (gateSteps.length === 0) {
    violations.push(`npm-audit job must run \`${AUDIT_COMMAND}\``);
  }
  if (
    gate?.['continue-on-error'] === true ||
    gateSteps.some((s) => s['continue-on-error'] === true)
  ) {
    violations.push('npm-audit gate must not use continue-on-error');
  }

  const positiveSteps = findAuditSteps(positive);
  if (positiveSteps.length === 0) {
    violations.push(`npm-audit-positive-control job must run \`${AUDIT_COMMAND}\``);
  }
  const positiveRun = positiveSteps.map((s) => s.run as string).join('\n');
  if (!/\[ "\$code" = "0" \]/.test(positiveRun)) {
    violations.push('positive control must fail when npm audit exits 0');
  }
  if (!/grep -q 'GHSA-[\w-]+' audit\.txt/.test(positiveRun)) {
    violations.push('positive control must assert the expected advisory id is reported');
  }

  return violations;
}

describe('collectSecurityAuditViolations', () => {
  it('production workflow には違反がない', () => {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
    expect(collectSecurityAuditViolations(workflow)).toEqual([]);
  });
});

describe('[陽性対照] collectSecurityAuditViolations', () => {
  it('閾値の drift・gate の continue-on-error・陽性対照の欠落を検出する', () => {
    const unsafeWorkflow = `
name: Security Audit
env:
  AUDIT_LEVEL: critical
jobs:
  npm-audit:
    steps:
      - name: npm audit
        run: npm audit --audit-level="$AUDIT_LEVEL"
        continue-on-error: true
`;

    const violations = collectSecurityAuditViolations(unsafeWorkflow);

    expect(violations).toContain('workflow env AUDIT_LEVEL must be high');
    expect(violations).toContain('npm-audit gate must not use continue-on-error');
    expect(violations).toContain(`npm-audit-positive-control job must run \`${AUDIT_COMMAND}\``);
  });

  it('gate が別コマンドに変わり、陽性対照が exit 0 を見逃す形になると検出する', () => {
    const driftedWorkflow = `
name: Security Audit
env:
  AUDIT_LEVEL: high
jobs:
  npm-audit:
    steps:
      - name: npm audit
        run: npm audit --audit-level=critical
  npm-audit-positive-control:
    steps:
      - name: 陽性対照
        run: |
          npm audit --audit-level="$AUDIT_LEVEL" > audit.txt 2>&1 || true
`;

    const violations = collectSecurityAuditViolations(driftedWorkflow);

    expect(violations).toContain(`npm-audit job must run \`${AUDIT_COMMAND}\``);
    expect(violations).toContain('positive control must fail when npm audit exits 0');
    expect(violations).toContain(
      'positive control must assert the expected advisory id is reported'
    );
  });
});
