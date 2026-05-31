import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const script = resolve(repoRoot, '.codex/scripts/git-add-files.sh');
const codexRules = resolve(repoRoot, '.codex/rules/default.rules');

function prefixRuleBlocks(source: string): string[] {
  return source.match(/prefix_rule\(\n[\s\S]*?\n\)/g) ?? [];
}

function runGitAdd(cwd: string, args: string[]) {
  return spawnSync('bash', [script, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function stagedFiles(cwd: string): string[] {
  const out = execFileSync('git', ['diff', '--cached', '--name-only'], {
    cwd,
    encoding: 'utf8',
  });
  return out.split('\n').filter(Boolean);
}

describe('git-add-files.sh', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'codex-git-add-'));
    execFileSync('git', ['init'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('明示されたファイルだけを stage する', () => {
    writeFileSync(join(dir, 'one.txt'), 'one');
    writeFileSync(join(dir, 'two.txt'), 'two');

    const result = runGitAdd(dir, ['one.txt']);

    expect(result.status).toBe(0);
    expect(stagedFiles(dir)).toEqual(['one.txt']);
  });

  it('明示されたディレクトリ配下を stage する', () => {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'note.md'), 'note');

    const result = runGitAdd(dir, ['docs']);

    expect(result.status).toBe(0);
    expect(stagedFiles(dir)).toEqual(['docs/note.md']);
  });

  it('削除済み tracked file を stage できる', () => {
    writeFileSync(join(dir, 'old.txt'), 'old');
    execFileSync('git', ['add', 'old.txt'], { cwd: dir });
    execFileSync('git', ['commit', '-m', 'test: initial'], { cwd: dir });
    rmSync(join(dir, 'old.txt'));

    const result = runGitAdd(dir, ['old.txt']);

    expect(result.status).toBe(0);
    expect(stagedFiles(dir)).toEqual(['old.txt']);
  });

  it('陽性対照: git add . 相当は拒否する', () => {
    writeFileSync(join(dir, 'one.txt'), 'one');

    const result = runGitAdd(dir, ['.']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing broad or unsafe git add pathspec');
    expect(stagedFiles(dir)).toEqual([]);
  });

  it('陽性対照: git add -A 相当は拒否する', () => {
    const result = runGitAdd(dir, ['-A']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing broad or unsafe git add pathspec');
  });

  it('陽性対照: glob pathspec は拒否して stage しない', () => {
    writeFileSync(join(dir, 'one.txt'), 'one');
    writeFileSync(join(dir, 'two.txt'), 'two');

    const result = runGitAdd(dir, ['*']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing broad or unsafe git add pathspec');
    expect(stagedFiles(dir)).toEqual([]);
  });

  it('陽性対照: root magic pathspec は拒否して stage しない', () => {
    writeFileSync(join(dir, 'one.txt'), 'one');

    const result = runGitAdd(dir, [':/']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing broad or unsafe git add pathspec');
    expect(stagedFiles(dir)).toEqual([]);
  });

  it('陽性対照: top magic pathspec は拒否して stage しない', () => {
    writeFileSync(join(dir, 'one.txt'), 'one');

    const result = runGitAdd(dir, [':(top)']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing broad or unsafe git add pathspec');
    expect(stagedFiles(dir)).toEqual([]);
  });

  it('陽性対照: wildcard pathspec は拒否して stage しない', () => {
    writeFileSync(join(dir, 'a.txt'), 'a');

    const result = runGitAdd(dir, ['?.txt']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing broad or unsafe git add pathspec');
    expect(stagedFiles(dir)).toEqual([]);
  });

  it('陽性対照: path traversal は拒否する', () => {
    const result = runGitAdd(dir, ['../outside.txt']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing broad or unsafe git add pathspec');
  });

  it('陽性対照: absolute path は拒否する', () => {
    const result = runGitAdd(dir, [join(dir, 'one.txt')]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing broad or unsafe git add pathspec');
  });

  it('script は bash で実行できる構文を保つ', () => {
    expect(() => execFileSync('bash', ['-n', script], { cwd: repoRoot })).not.toThrow();
  });

  it('Codex rules は helper を allow し、直接 git add を allow しない', () => {
    const rules = readFileSync(codexRules, 'utf8');
    const blocks = prefixRuleBlocks(rules);

    expect(
      blocks.some(
        (block) =>
          block.includes('pattern = ["bash", ".codex/scripts/git-add-files.sh"]') &&
          block.includes('decision = "allow"')
      )
    ).toBe(true);

    expect(
      blocks.some(
        (block) =>
          block.includes('pattern = ["git", "add"]') && block.includes('decision = "allow"')
      )
    ).toBe(false);

    expect(rules).toContain('Command rules are prefix-only');
    expect(rules).toContain('broad pathspecs such as `git add .` and `git add -A`');
  });
});
