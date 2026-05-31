import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = 'scripts/rm-tmp.sh';

function runRmTmp(args: string[]) {
  return spawnSync('bash', [script, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

function isWritable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

const codexTmpWritable = isWritable('/tmp/codex/.rm-tmp-probe');

describe('scripts/rm-tmp.sh', () => {
  it('許可領域: /tmp/claude 配下のファイルを削除できる', () => {
    const dir = '/tmp/claude/rm-tmp-test';
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'ok.txt');
    writeFileSync(file, 'ok');

    const result = runRmTmp([file]);

    expect(result.status).toBe(0);
    expect(existsSync(file)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it.runIf(codexTmpWritable)('許可領域: /tmp/codex 配下のファイルを削除できる', () => {
    const dir = '/tmp/codex/rm-tmp-test';
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'ok.txt');
    writeFileSync(file, 'ok');

    const result = runRmTmp([file]);

    expect(result.status).toBe(0);
    expect(existsSync(file)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('陽性対照: /tmp/claude 外への traversal は拒否する', () => {
    const result = runRmTmp(['/tmp/claude/../rm-tmp-denied.txt']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to remove outside');
  });

  it('陽性対照: /tmp/codex 外への traversal は拒否する', () => {
    const result = runRmTmp(['/tmp/codex/../rm-tmp-denied.txt']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to remove outside');
  });

  it('陽性対照: repository file は拒否する', () => {
    const result = runRmTmp(['.claude/settings.json']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to remove outside');
    expect(existsSync('.claude/settings.json')).toBe(true);
  });

  it('陽性対照: 未サポート option は拒否する', () => {
    const result = runRmTmp(['-P', '/tmp/claude/example.txt']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unsupported rm option');
  });

  it('script は bash で実行できる構文を保つ', () => {
    expect(() => execFileSync('bash', ['-n', script], { cwd: process.cwd() })).not.toThrow();
  });
});
