import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// dependabot-auto-merge.yml / security-release-pr.yml の安全上の前提を固定する meta テスト
// （docs/decisions.md [132]）。どれか 1 つが崩れると、Dependabot 以外の push や
// 公開直後の推移的依存が develop へ自動で入りうる。

const AUTO_MERGE_PATH = '.github/workflows/dependabot-auto-merge.yml';
const RELEASE_PR_PATH = '.github/workflows/security-release-pr.yml';
const ACTOR_GUARDS = [
  "github.event.pull_request.user.login == 'dependabot[bot]'",
  "github.actor == 'dependabot[bot]'",
];
const MERGE_GUARDS = [
  "steps.decide.outputs.reason == ''",
  "steps.release-age.outcome == 'success'",
];

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

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

// run: に ${{ }} を直接埋め込むと、PR 由来の文字列（依存名等）でスクリプトを注入されうる
function collectRunInterpolations(steps: Doc[], label: string): string[] {
  return steps
    .filter((step) => str(step.run).includes('${{'))
    .map((step) => `${label}: run must not interpolate \${{ }} (step: ${str(step.name)})`);
}

export function collectAutoMergeViolations(workflowText: string): string[] {
  const parsed = asRecord(parse(workflowText));
  if (!parsed) return ['workflow document must be a mapping'];
  const violations: string[] = [];

  const triggers = Object.keys(asRecord(parsed.on) ?? {});
  if (triggers.join(',') !== 'pull_request') {
    violations.push('auto-merge must be triggered by pull_request only');
  }

  const job = asRecord(asRecord(parsed.jobs)?.['auto-merge']);
  const jobIf = str(job?.if);
  for (const guard of ACTOR_GUARDS) {
    if (!jobIf.includes(guard)) violations.push(`auto-merge job if must include ${guard}`);
  }

  const steps = getSteps(job);
  violations.push(...collectRunInterpolations(steps, 'auto-merge'));

  const releaseAgeIndex = steps.findIndex((s) => s.id === 'release-age');
  const releaseAge = steps[releaseAgeIndex];
  if (!str(releaseAge?.run).includes('node scripts/check-lockfile-release-age.mjs')) {
    violations.push('release-age step must run scripts/check-lockfile-release-age.mjs');
  }
  if (releaseAge && 'continue-on-error' in releaseAge) {
    violations.push('release-age step must not use continue-on-error');
  }

  const checkout = steps.find((s) => str(s.uses).startsWith('actions/checkout@'));
  if (str(asRecord(checkout?.with)?.ref) !== '${{ github.event.pull_request.base.sha }}') {
    violations.push('checkout must use the base sha so the guard script is not taken from the PR');
  }

  const mergeIndex = steps.findIndex((s) => /gh pr merge "\$PR_URL" --auto\b/.test(str(s.run)));
  if (mergeIndex === -1) {
    violations.push('auto-merge step must run gh pr merge --auto');
  } else {
    const mergeIf = str(steps[mergeIndex].if);
    for (const guard of MERGE_GUARDS) {
      if (!mergeIf.includes(guard)) violations.push(`merge step if must include ${guard}`);
    }
    if (mergeIf.includes('always()')) violations.push('merge step must not use always()');
    // required checks が無い develop で --auto すると CI を待たずにマージされうる
    const mergeRun = str(steps[mergeIndex].run);
    const rulesetCheck = mergeRun.indexOf('rules/branches/develop');
    if (rulesetCheck === -1 || rulesetCheck > mergeRun.indexOf('gh pr merge')) {
      violations.push('merge step must verify develop required status checks before gh pr merge');
    }
    if (releaseAgeIndex === -1 || releaseAgeIndex > mergeIndex) {
      violations.push('release-age step must run before the merge step');
    }
  }

  return violations;
}

export function collectReleasePrViolations(workflowText: string): string[] {
  const parsed = asRecord(parse(workflowText));
  if (!parsed) return ['workflow document must be a mapping'];
  const violations: string[] = [];
  const job = asRecord(asRecord(parsed.jobs)?.['create-release-pr']);
  const steps = getSteps(job);
  violations.push(...collectRunInterpolations(steps, 'release-pr'));

  const createStep = steps.find((s) => str(s.run).includes('gh pr create'));
  // GITHUB_TOKEN で作ると main の required checks が起動せずマージできない
  if (str(asRecord(createStep?.env)?.GH_TOKEN) !== '${{ steps.token.outputs.token }}') {
    violations.push('release PR must be created with the GitHub App token');
  }
  return violations;
}

const autoMerge = readFileSync(AUTO_MERGE_PATH, 'utf8');
const releasePr = readFileSync(RELEASE_PR_PATH, 'utf8');

describe('security automation workflows', () => {
  it('dependabot-auto-merge.yml には違反がない', () => {
    expect(collectAutoMergeViolations(autoMerge)).toEqual([]);
  });

  it('security-release-pr.yml には違反がない', () => {
    expect(collectReleasePrViolations(releasePr)).toEqual([]);
  });
});

describe('[陽性対照] security automation workflows', () => {
  // 置換元が見つからないと無変更の workflow で検査して空回りするため、その場で落とす
  const mutate = (source: string, from: string, to: string): string => {
    if (!source.includes(from)) throw new Error(`mutation target not found: ${from}`);
    return source.replace(from, to);
  };

  it.each([
    [
      'pull_request_target に変更',
      mutate(autoMerge, '  pull_request:\n', '  pull_request_target:\n'),
      'auto-merge must be triggered by pull_request only',
    ],
    [
      'actor の確認を削除',
      mutate(autoMerge, " && github.actor == 'dependabot[bot]'", ''),
      "auto-merge job if must include github.actor == 'dependabot[bot]'",
    ],
    [
      'run に ${{ }} を直接埋め込む',
      mutate(
        autoMerge,
        'scope=deps\n',
        'scope=deps\n          echo "${{ steps.meta.outputs.dependency-names }}"\n'
      ),
      'auto-merge: run must not interpolate ${{ }} (step: 日本語の squash 件名で auto-merge を有効化)',
    ],
    [
      'ガードを continue-on-error にする',
      mutate(
        autoMerge,
        '        id: release-age\n',
        '        id: release-age\n        continue-on-error: true\n'
      ),
      'release-age step must not use continue-on-error',
    ],
    [
      'PR 側のスクリプトを checkout する',
      mutate(
        autoMerge,
        'ref: ${{ github.event.pull_request.base.sha }}',
        'ref: ${{ github.event.pull_request.head.sha }}'
      ),
      'checkout must use the base sha so the guard script is not taken from the PR',
    ],
    [
      'マージ条件からガードの結果を外す',
      mutate(autoMerge, " && steps.release-age.outcome == 'success'", ''),
      "merge step if must include steps.release-age.outcome == 'success'",
    ],
    [
      'develop の required checks の確認を削除',
      mutate(autoMerge, 'rules/branches/develop', 'rules/branches/main'),
      'merge step must verify develop required status checks before gh pr merge',
    ],
  ])('auto-merge: %s を検出する', (_label, workflow, expected) => {
    expect(collectAutoMergeViolations(workflow)).toContain(expected);
  });

  it('release-pr: GITHUB_TOKEN で PR を作る形を検出する', () => {
    const workflow = mutate(
      releasePr,
      'GH_TOKEN: ${{ steps.token.outputs.token }}',
      'GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}'
    );
    expect(collectReleasePrViolations(workflow)).toContain(
      'release PR must be created with the GitHub App token'
    );
  });
});
