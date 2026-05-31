import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const script = resolve(repoRoot, '.codex/scripts/block-direct-git-add.sh');

function runHook(command: string) {
  return spawnSync('bash', [script], {
    cwd: repoRoot,
    encoding: 'utf8',
    input: JSON.stringify({ tool_input: { command } }),
  });
}

describe('block-direct-git-add.sh', () => {
  it('陰性対照: helper 単体の staging は許可する', () => {
    const result = runHook('bash .codex/scripts/git-add-files.sh .codex/rules/default.rules');

    expect(result.status).toBe(0);
  });

  it('陽性対照: direct git add を拒否する', () => {
    const result = runHook('git add .codex/rules/default.rules');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Use bash .codex/scripts/git-add-files.sh instead of direct git add.'
    );
  });

  it('陽性対照: helper の後ろに direct git add を連結した複合コマンドも拒否する', () => {
    const result = runHook('bash .codex/scripts/git-add-files.sh AGENTS.md; git add .');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Use bash .codex/scripts/git-add-files.sh instead of direct git add.'
    );
  });

  it('陽性対照: git の絶対パスでも拒否する', () => {
    const result = runHook('/usr/bin/git add .');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Use bash .codex/scripts/git-add-files.sh instead of direct git add.'
    );
  });

  it('陽性対照: global option 付きの git add も拒否する', () => {
    const result = runHook('git -C . add .');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Use bash .codex/scripts/git-add-files.sh instead of direct git add.'
    );
  });

  it('陽性対照: quoted command name の git add も拒否する', () => {
    const result = runHook('"git" add .');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Use bash .codex/scripts/git-add-files.sh instead of direct git add.'
    );
  });

  it('陽性対照: escaped command name の git add も拒否する', () => {
    const result = runHook('\\git add .');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Use bash .codex/scripts/git-add-files.sh instead of direct git add.'
    );
  });
});
