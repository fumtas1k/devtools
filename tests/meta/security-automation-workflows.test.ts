import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// dependabot-auto-merge.yml / security-release-pr.yml の安全上の前提を固定する meta テスト
// （docs/decisions.md [132]）。どれか 1 つが崩れると、Dependabot 以外の push や
// 公開直後の版が develop へ自動で入りうる。条件式とガードの実行行は、`|| true` 等の
// 付け足しで無効化されないよう完全一致で比較する。

const AUTO_MERGE_PATH = '.github/workflows/dependabot-auto-merge.yml';
const RELEASE_PR_PATH = '.github/workflows/security-release-pr.yml';

const EXPECTED = {
  autoMergeJobIf:
    "github.event.pull_request.user.login == 'dependabot[bot]' && github.actor == 'dependabot[bot]' && startsWith(github.head_ref, 'dependabot/npm_and_yarn/')",
  revokeJobIf:
    "github.event.pull_request.user.login == 'dependabot[bot]' && github.actor != 'dependabot[bot]'",
  mergeStepIf: "steps.decide.outputs.reason == '' && steps.release-age.outcome == 'success'",
  guardLine:
    'node scripts/check-lockfile-release-age.mjs "$RUNNER_TEMP/base-lock.json" "$RUNNER_TEMP/head-lock.json" --allow "$ALLOWED_VERSIONS" --min-days 7',
  alertLine:
    'elif [ "$ALERT_STATE" != "OPEN" ] || [[ ! "$GHSA_ID" =~ ^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$ ]]; then',
  fileCheckLine:
    'unexpected=$(gh pr diff "$PR_URL" --name-only | grep -vxE \'package(-lock)?\\.json\' || true)',
  baseRef: '${{ github.event.pull_request.base.sha }}',
  releaseJobIf: "contains(github.event.head_commit.message, 'GHSA-')",
  appToken: '${{ steps.token.outputs.token }}',
};

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

// コメント行を除いた、実行される行だけを返す
const executableLines = (run: unknown): string[] =>
  str(run)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

// run: や github-script の script: に ${{ }} を直接埋め込むと、PR 由来の文字列
// （依存名・タイトル等）でスクリプトを注入されうる
function collectInterpolations(steps: Doc[], label: string): string[] {
  return steps
    .filter(
      (step) => str(step.run).includes('${{') || str(asRecord(step.with)?.script).includes('${{')
    )
    .map((step) => `${label}: script must not interpolate \${{ }} (step: ${str(step.name)})`);
}

const indexOf = (steps: Doc[], predicate: (step: Doc) => boolean) => steps.findIndex(predicate);

export function collectAutoMergeViolations(workflowText: string): string[] {
  const parsed = asRecord(parse(workflowText));
  if (!parsed) return ['workflow document must be a mapping'];
  const violations: string[] = [];

  if (Object.keys(asRecord(parsed.on) ?? {}).join(',') !== 'pull_request') {
    violations.push('auto-merge must be triggered by pull_request only');
  }

  const jobs = asRecord(parsed.jobs);
  const revoke = asRecord(jobs?.['revoke-on-foreign-push']);
  if (str(revoke?.if) !== EXPECTED.revokeJobIf) {
    violations.push('revoke-on-foreign-push job if must match exactly');
  }
  if (
    !getSteps(revoke).some((s) =>
      executableLines(s.run).includes('gh pr merge "$PR_URL" --disable-auto')
    )
  ) {
    violations.push('revoke-on-foreign-push job must disable auto-merge');
  }

  const job = asRecord(jobs?.['auto-merge']);
  if (str(job?.if) !== EXPECTED.autoMergeJobIf) {
    violations.push('auto-merge job if must match exactly');
  }

  const steps = getSteps(job);
  violations.push(...collectInterpolations(steps, 'auto-merge'));
  for (const s of getSteps(revoke)) {
    if (str(s.run).includes('${{')) violations.push('revoke: script must not interpolate ${{ }}');
  }

  // 順序: 変更ファイルの確認 → トークン発行 → auto-merge の解除 → 評価
  const fileCheck = indexOf(steps, (s) => executableLines(s.run).includes(EXPECTED.fileCheckLine));
  const writeToken = indexOf(steps, (s) => s.id === 'write-token');
  const firstTokenStep = indexOf(steps, (s) =>
    str(s.uses).startsWith('actions/create-github-app-token@')
  );
  const disableBeforeEval = indexOf(
    steps,
    (s) =>
      str(s.name) === '評価の前に auto-merge を解除' &&
      executableLines(s.run).includes('gh pr merge "$PR_URL" --disable-auto')
  );
  const meta = indexOf(steps, (s) => s.id === 'meta');
  if (fileCheck === -1 || fileCheck > firstTokenStep) {
    violations.push('changed files must be checked before any App token is issued');
  }
  if (disableBeforeEval === -1 || disableBeforeEval < writeToken || disableBeforeEval > meta) {
    violations.push('auto-merge must be disabled after the write token and before evaluation');
  }

  const decide = steps.find((s) => s.id === 'decide');
  if (!executableLines(decide?.run).includes(EXPECTED.alertLine)) {
    violations.push('decide step must require an OPEN alert with a valid GHSA ID');
  }

  for (const checkout of steps.filter((s) => str(s.uses).startsWith('actions/checkout@'))) {
    if (str(asRecord(checkout.with)?.ref) !== EXPECTED.baseRef) {
      violations.push('every checkout must use the base sha');
    }
  }

  const releaseAgeIndex = indexOf(steps, (s) => s.id === 'release-age');
  const releaseAge = steps[releaseAgeIndex];
  if (executableLines(releaseAge?.run).at(-1) !== EXPECTED.guardLine) {
    violations.push('release-age step must end with the exact guard command');
  }
  if (releaseAge && 'continue-on-error' in releaseAge) {
    violations.push('release-age step must not use continue-on-error');
  }

  const mergeIndex = indexOf(steps, (s) =>
    executableLines(s.run).some((line) => line.startsWith('gh pr merge "$PR_URL" --auto'))
  );
  if (mergeIndex === -1) {
    violations.push('auto-merge step must run gh pr merge --auto');
  } else {
    const merge = steps[mergeIndex];
    if (str(merge.if) !== EXPECTED.mergeStepIf) violations.push('merge step if must match exactly');
    const lines = executableLines(merge.run);
    const rulesetCheck = lines.findIndex((l) => l.includes('rules/branches/develop'));
    const mergeLine = lines.findIndex((l) => l.startsWith('gh pr merge "$PR_URL" --auto'));
    // required checks が無い develop で --auto すると CI を待たずにマージされうる
    if (rulesetCheck === -1 || rulesetCheck > mergeLine) {
      violations.push('merge step must verify develop required status checks before gh pr merge');
    }
    if (!lines[mergeLine].includes('--match-head-commit "$HEAD_SHA"')) {
      violations.push('merge must pin the evaluated head with --match-head-commit');
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
  if (str(job?.if) !== EXPECTED.releaseJobIf) {
    violations.push('create-release-pr job if must match exactly');
  }
  const steps = getSteps(job);
  violations.push(...collectInterpolations(steps, 'release-pr'));

  const createStep = steps.find((s) => str(s.run).includes('gh pr create'));
  // GITHUB_TOKEN で作ると pull_request 起動の workflow が release PR で走らない
  if (str(asRecord(createStep?.env)?.GH_TOKEN) !== EXPECTED.appToken) {
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
  const guard = `          ${EXPECTED.guardLine}\n`;
  const mergeIf = `        if: ${EXPECTED.mergeStepIf}\n`;
  const autoMergeIf = `    if: ${EXPECTED.autoMergeJobIf}\n`;

  it.each([
    [
      'pull_request_target に変更',
      mutate(autoMerge, '  pull_request:\n', '  pull_request_target:\n'),
      'auto-merge must be triggered by pull_request only',
    ],
    [
      'actor の確認を削除',
      mutate(autoMerge, " && github.actor == 'dependabot[bot]' && startsWith", ' && startsWith'),
      'auto-merge job if must match exactly',
    ],
    [
      'job の if に || true',
      mutate(autoMerge, autoMergeIf, `    if: ${EXPECTED.autoMergeJobIf} || true\n`),
      'auto-merge job if must match exactly',
    ],
    [
      'npm ブランチの限定を削除',
      mutate(autoMerge, " && startsWith(github.head_ref, 'dependabot/npm_and_yarn/')", ''),
      'auto-merge job if must match exactly',
    ],
    [
      'foreign push の解除 job の条件を変更',
      mutate(
        autoMerge,
        "&& github.actor != 'dependabot[bot]'",
        "&& github.actor == 'dependabot[bot]'"
      ),
      'revoke-on-foreign-push job if must match exactly',
    ],
    [
      'run に ${{ }} を直接埋め込む',
      mutate(
        autoMerge,
        '          scope=deps\n',
        '          scope=deps\n          echo "${{ steps.meta.outputs.dependency-names }}"\n'
      ),
      'auto-merge: script must not interpolate ${{ }} (step: 日本語の squash 件名で auto-merge を有効化)',
    ],
    [
      'github-script の script に ${{ }} を埋め込む',
      mutate(
        autoMerge,
        '      - name: 自動マージの条件を判定\n',
        '      - name: github-script\n        uses: actions/github-script@v8\n        with:\n          script: console.log("${{ github.event.pull_request.title }}")\n\n      - name: 自動マージの条件を判定\n'
      ),
      'auto-merge: script must not interpolate ${{ }} (step: github-script)',
    ],
    [
      'ガード行に || true',
      mutate(autoMerge, guard, `          ${EXPECTED.guardLine} || true\n`),
      'release-age step must end with the exact guard command',
    ],
    [
      '--min-days 0 に変更',
      mutate(autoMerge, '--min-days 7\n', '--min-days 0\n'),
      'release-age step must end with the exact guard command',
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
      'マージ step の if に || true',
      mutate(autoMerge, mergeIf, `        if: ${EXPECTED.mergeStepIf} || true\n`),
      'merge step if must match exactly',
    ],
    [
      'マージ step の if を !cancelled() で包む',
      mutate(
        autoMerge,
        mergeIf,
        `        if: \${{ !cancelled() && (steps.decide.outputs.reason == '' || steps.release-age.outcome == 'success') }}\n`
      ),
      'merge step if must match exactly',
    ],
    [
      'alert の判定を無効化',
      mutate(autoMerge, EXPECTED.alertLine, 'elif false; then'),
      'decide step must require an OPEN alert with a valid GHSA ID',
    ],
    [
      'PR head を checkout する step を足す',
      mutate(
        autoMerge,
        '      - uses: actions/setup-node@v6\n',
        '      - uses: actions/checkout@v6\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n\n      - uses: actions/setup-node@v6\n'
      ),
      'every checkout must use the base sha',
    ],
    [
      'develop の required checks の確認を削除',
      mutate(autoMerge, 'rules/branches/develop', 'rules/branches/main'),
      'merge step must verify develop required status checks before gh pr merge',
    ],
    [
      '--match-head-commit を削除',
      mutate(autoMerge, ' --match-head-commit "$HEAD_SHA"', ''),
      'merge must pin the evaluated head with --match-head-commit',
    ],
    [
      '評価前の auto-merge 解除を削除',
      mutate(
        autoMerge,
        '      - name: 評価の前に auto-merge を解除\n',
        '      - name: 何もしない\n'
      ),
      'auto-merge must be disabled after the write token and before evaluation',
    ],
    [
      '変更ファイルの確認を削除',
      mutate(autoMerge, EXPECTED.fileCheckLine, 'unexpected=""'),
      'changed files must be checked before any App token is issued',
    ],
  ])('auto-merge: %s を検出する', (_label, workflow, expected) => {
    expect(collectAutoMergeViolations(workflow)).toContain(expected);
  });

  it.each([
    [
      'GITHUB_TOKEN で PR を作る',
      mutate(
        releasePr,
        'GH_TOKEN: ${{ steps.token.outputs.token }}',
        'GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}'
      ),
      'release PR must be created with the GitHub App token',
    ],
    [
      'job の if を true にする',
      mutate(releasePr, `if: ${EXPECTED.releaseJobIf}`, 'if: true'),
      'create-release-pr job if must match exactly',
    ],
  ])('release-pr: %s を検出する', (_label, workflow, expected) => {
    expect(collectReleasePrViolations(workflow)).toContain(expected);
  });
});
