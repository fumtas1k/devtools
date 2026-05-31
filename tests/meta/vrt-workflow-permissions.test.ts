import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type JobDoc = {
  permissions?: unknown;
  steps?: unknown;
};

const REPORT_STEP_NAMES = [
  'スライダーレポートを GitHub Pages へ deploy',
  '既存の VRT comment を検索（dedup 用）',
  'PR comment 本文を組み立て（失敗 spec 名込み）',
  '結果を PR comment で報告',
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function getJob(workflow: Record<string, unknown>, name: string): JobDoc | null {
  const jobs = asRecord(workflow.jobs);
  return jobs ? (asRecord(jobs[name]) as JobDoc | null) : null;
}

function getStepNames(job: JobDoc | null): string[] {
  const steps = Array.isArray(job?.steps) ? job?.steps : [];
  return steps
    .map((step) => asString(asRecord(step)?.name))
    .filter((name): name is string => name !== null);
}

function getPermissions(job: JobDoc | null): Record<string, unknown> | null {
  return asRecord(job?.permissions);
}

function collectVrtPermissionViolations(workflowText: string): string[] {
  const parsed = asRecord(parse(workflowText));
  if (!parsed) {
    return ['workflow document must be a mapping'];
  }

  const violations: string[] = [];
  const visualRegression = getJob(parsed, 'visual-regression');
  const visualRegressionReport = getJob(parsed, 'visual-regression-report');
  const visualRegressionPermissions = getPermissions(visualRegression);
  const reportPermissions = getPermissions(visualRegressionReport);
  const visualRegressionStepNames = getStepNames(visualRegression);
  const reportStepNames = getStepNames(visualRegressionReport);

  if ('permissions' in parsed) {
    violations.push('top-level permissions must not be declared');
  }

  if (visualRegressionPermissions?.contents === 'write') {
    violations.push('visual-regression job must not have contents: write');
  }

  if (visualRegressionPermissions?.contents !== 'read') {
    violations.push('visual-regression job must declare contents: read');
  }

  if (reportPermissions?.contents !== 'write') {
    violations.push('visual-regression-report job must declare contents: write');
  }

  if (reportPermissions?.['pull-requests'] !== 'write') {
    violations.push('visual-regression-report job must declare pull-requests: write');
  }

  const reportStepSet = new Set(reportStepNames);
  const forbiddenStepInTestJob = visualRegressionStepNames.some((stepName) =>
    REPORT_STEP_NAMES.includes(stepName as (typeof REPORT_STEP_NAMES)[number])
  );
  const missingReportStep = REPORT_STEP_NAMES.some((stepName) => !reportStepSet.has(stepName));

  if (forbiddenStepInTestJob || missingReportStep) {
    violations.push('write/comment/deploy steps must run in visual-regression-report');
  }

  return violations;
}

describe('collectVrtPermissionViolations', () => {
  it('production workflow には違反がない', () => {
    const workflow = readFileSync('.github/workflows/visual-regression.yml', 'utf8');
    expect(collectVrtPermissionViolations(workflow)).toEqual([]);
  });
});

describe('[陽性対照] collectVrtPermissionViolations', () => {
  it('top-level permissions と test job の write step を検出する', () => {
    const unsafeWorkflow = `
name: Visual Regression
permissions:
  contents: write
  pull-requests: write
jobs:
  visual-regression:
    permissions:
      contents: write
    steps:
      - name: 結果を PR comment で報告
        run: echo unsafe
`;

    const violations = collectVrtPermissionViolations(unsafeWorkflow);

    expect(violations).toContain('top-level permissions must not be declared');
    expect(violations).toContain('visual-regression job must not have contents: write');
    expect(violations).toContain('write/comment/deploy steps must run in visual-regression-report');
  });

  it('report job の write permissions が欠けると検出する', () => {
    const missingReportPermissionsWorkflow = `
name: Visual Regression
jobs:
  visual-regression:
    permissions:
      contents: read
    steps:
      - name: 本番相当アセットを build
        run: echo build
  visual-regression-report:
    permissions:
      contents: read
    steps:
      - name: 既存の VRT comment を検索（dedup 用）
        run: echo comment
      - name: 結果を PR comment で報告
        run: echo comment
`;

    const violations = collectVrtPermissionViolations(missingReportPermissionsWorkflow);

    expect(violations).toContain('visual-regression-report job must declare contents: write');
    expect(violations).toContain('visual-regression-report job must declare pull-requests: write');
  });
});
