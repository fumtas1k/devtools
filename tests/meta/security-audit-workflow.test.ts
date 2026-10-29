import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// security-audit.yml の gate（npm-audit）と陽性対照（npm-audit-positive-control）が
// 同じ閾値・同じコマンドで audit し、どちらも無効化されていないことを assert する
// drift 検知 meta テスト。片方だけ閾値や範囲が変わると、陽性対照が green のまま
// gate の検知能力が落ちる。

const WORKFLOW_PATH = '.github/workflows/security-audit.yml';
const AUDIT_COMMAND = 'npm audit --audit-level="$AUDIT_LEVEL"';
const POSITIVE_AUDIT_LINE = `${AUDIT_COMMAND} > audit.txt 2>&1`;
const EXPECTED_AUDIT_LEVEL = 'high';
const JOB_NAMES = ['npm-audit', 'npm-audit-positive-control'] as const;

type Doc = Record<string, unknown>;

function asRecord(value: unknown): Doc | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Doc)
    : null;
}

function getSteps(job: Doc | null): Doc[] {
  return Array.isArray(job?.steps)
    ? job.steps.map(asRecord).filter((s): s is Doc => s !== null)
    : [];
}

function getRun(step: Doc): string {
  return typeof step.run === 'string' ? step.run : '';
}

// コメント行に assert を残しただけのケースを通さないため、実行される行だけを返す
function executableLines(run: string): string[] {
  return run
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

// job / step のどこかで gate を無効化・閾値上書きしていないか
function collectDisablers(jobName: string, job: Doc): string[] {
  const violations: string[] = [];
  const scopes: [string, Doc][] = [
    [`${jobName} job`, job],
    ...getSteps(job).map((step, i): [string, Doc] => [`${jobName} step[${i}]`, step]),
  ];
  for (const [label, scope] of scopes) {
    if ('if' in scope) {
      violations.push(`${label} must not have if:`);
    }
    if ('continue-on-error' in scope) {
      violations.push(`${label} must not use continue-on-error`);
    }
    if (asRecord(scope.env) && 'AUDIT_LEVEL' in (scope.env as Doc)) {
      violations.push(`${label} must not override AUDIT_LEVEL`);
    }
  }
  return violations;
}

export function collectSecurityAuditViolations(workflowText: string): string[] {
  const parsed = asRecord(parse(workflowText));
  if (!parsed) {
    return ['workflow document must be a mapping'];
  }

  const violations: string[] = [];
  if (asRecord(parsed.env)?.AUDIT_LEVEL !== EXPECTED_AUDIT_LEVEL) {
    violations.push(`workflow env AUDIT_LEVEL must be ${EXPECTED_AUDIT_LEVEL}`);
  }

  const jobs = asRecord(parsed.jobs);
  for (const name of JOB_NAMES) {
    const job = asRecord(jobs?.[name]);
    if (!job) {
      violations.push(`${name} job must exist`);
      continue;
    }
    violations.push(...collectDisablers(name, job));
  }

  // gate: `|| true` やフラグ追加で範囲を狭められないよう、run 全体の完全一致で判定する
  const gateSteps = getSteps(asRecord(jobs?.['npm-audit']));
  if (!gateSteps.some((step) => getRun(step).trim() === AUDIT_COMMAND)) {
    violations.push(`npm-audit job must run exactly \`${AUDIT_COMMAND}\``);
  }

  const positiveLines = getSteps(asRecord(jobs?.['npm-audit-positive-control'])).flatMap((step) =>
    executableLines(getRun(step))
  );
  if (!positiveLines.includes(POSITIVE_AUDIT_LINE)) {
    violations.push(`positive control must run \`${POSITIVE_AUDIT_LINE}\``);
  }
  if (!positiveLines.includes('if [ "$code" = "0" ]; then')) {
    violations.push('positive control must fail when npm audit exits 0');
  }
  if (!positiveLines.some((line) => /^grep -q 'GHSA-[\w-]+' audit\.txt \|\| \{$/.test(line))) {
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
  // production workflow を 1 箇所だけ書き換えて、違反として検出されることを確認する
  const production = readFileSync(WORKFLOW_PATH, 'utf8');
  // 置換元が見つからないと無変更の workflow で検査して空回りするため、その場で落とす
  const mutate = (from: string, to: string): string => {
    if (!production.includes(from)) {
      throw new Error(`mutation target not found in ${WORKFLOW_PATH}: ${from}`);
    }
    return production.replace(from, to);
  };
  const gateRun = `        run: ${AUDIT_COMMAND}\n`;
  const positiveJobHeader = '  npm-audit-positive-control:\n    runs-on: ubuntu-latest\n';

  it.each([
    [
      'workflow の閾値変更',
      mutate('AUDIT_LEVEL: high', 'AUDIT_LEVEL: critical'),
      'workflow env AUDIT_LEVEL must be high',
    ],
    [
      'gate job で閾値を上書き',
      mutate(
        '  npm-audit:\n    runs-on: ubuntu-latest\n',
        '  npm-audit:\n    runs-on: ubuntu-latest\n    env:\n      AUDIT_LEVEL: critical\n'
      ),
      'npm-audit job must not override AUDIT_LEVEL',
    ],
    [
      'gate step で閾値を上書き',
      mutate(gateRun, `${gateRun}        env:\n          AUDIT_LEVEL: critical\n`),
      'npm-audit step[2] must not override AUDIT_LEVEL',
    ],
    [
      'gate を `|| true` で握りつぶす',
      mutate(gateRun, `        run: ${AUDIT_COMMAND} || true\n`),
      `npm-audit job must run exactly \`${AUDIT_COMMAND}\``,
    ],
    [
      'gate に --omit=dev を追加',
      mutate(gateRun, `        run: ${AUDIT_COMMAND} --omit=dev\n`),
      `npm-audit job must run exactly \`${AUDIT_COMMAND}\``,
    ],
    [
      'gate job を if: false で無効化',
      mutate(
        '  npm-audit:\n    runs-on: ubuntu-latest\n',
        '  npm-audit:\n    if: false\n    runs-on: ubuntu-latest\n'
      ),
      'npm-audit job must not have if:',
    ],
    [
      'gate step に continue-on-error',
      mutate(gateRun, `${gateRun}        continue-on-error: true\n`),
      'npm-audit step[2] must not use continue-on-error',
    ],
    [
      '陽性対照 job に continue-on-error',
      mutate(positiveJobHeader, `${positiveJobHeader}    continue-on-error: true\n`),
      'npm-audit-positive-control job must not use continue-on-error',
    ],
    [
      '陽性対照の exit 0 判定をコメントアウト',
      mutate('          if [ "$code" = "0" ]; then', '          # if [ "$code" = "0" ]; then'),
      'positive control must fail when npm audit exits 0',
    ],
    [
      '陽性対照の advisory 判定をコメントアウト',
      mutate("          grep -q 'GHSA-", "          # grep -q 'GHSA-"),
      'positive control must assert the expected advisory id is reported',
    ],
  ])('%s を検出する', (_label, workflow, expected) => {
    expect(collectSecurityAuditViolations(workflow)).toContain(expected);
  });

  it('陽性対照 job が無いと検出する', () => {
    const workflow = `
name: Security Audit
env:
  AUDIT_LEVEL: high
jobs:
  npm-audit:
    steps:
      - run: ${AUDIT_COMMAND}
`;
    expect(collectSecurityAuditViolations(workflow)).toContain(
      'npm-audit-positive-control job must exist'
    );
  });
});
