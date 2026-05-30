import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const codexScript = '.codex/scripts/rm-tmp.sh';
const claudeScript = '.claude/scripts/rm-tmp.sh';

function runRmTmp(script: string, args: string[]) {
  return spawnSync('bash', [script, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

describe('rm-tmp.sh', () => {
  it('許可領域: /tmp/codex 配下のファイルを削除できる', () => {
    const dir = '/tmp/codex/rm-tmp-test';
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'ok.txt');
    writeFileSync(file, 'ok');

    const result = runRmTmp(codexScript, [file]);

    expect(result.status).toBe(0);
    expect(existsSync(file)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('陽性対照: /tmp/codex 外への traversal は拒否する', () => {
    const file = '/tmp/rm-tmp-denied.txt';
    writeFileSync(file, 'denied');

    const result = runRmTmp(codexScript, ['/tmp/codex/../rm-tmp-denied.txt']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to remove outside /tmp/codex');
    expect(existsSync(file)).toBe(true);
    rmSync(file, { force: true });
  });

  it('陽性対照: /tmp/claude 配下は Codex helper では拒否する', () => {
    const dir = '/tmp/claude/rm-tmp-test';
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'denied.txt');
    writeFileSync(file, 'denied');

    const result = runRmTmp(codexScript, [file]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to remove outside /tmp/codex');
    expect(existsSync(file)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('陽性対照: repository file は拒否する', () => {
    const result = runRmTmp(codexScript, ['.codex/config.toml']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to remove outside /tmp/codex');
    expect(existsSync('.codex/config.toml')).toBe(true);
  });

  it('陽性対照: 未サポート option は拒否する', () => {
    const result = runRmTmp(codexScript, ['-P', '/tmp/codex/example.txt']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unsupported rm option');
  });

  it('script は bash で実行できる構文を保つ', () => {
    expect(() => execFileSync('bash', ['-n', codexScript], { cwd: process.cwd() })).not.toThrow();
  });
});

describe('claude rm-tmp.sh', () => {
  it('許可領域: /tmp/claude 配下のファイルを削除できる', () => {
    const dir = '/tmp/claude/rm-tmp-test';
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'ok.txt');
    writeFileSync(file, 'ok');

    const result = runRmTmp(claudeScript, [file]);

    expect(result.status).toBe(0);
    expect(existsSync(file)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('陽性対照: /tmp/claude 外への traversal は拒否する', () => {
    const file = '/tmp/rm-tmp-denied.txt';
    writeFileSync(file, 'denied');

    const result = runRmTmp(claudeScript, ['/tmp/claude/../rm-tmp-denied.txt']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to remove outside /tmp/claude');
    expect(existsSync(file)).toBe(true);
    rmSync(file, { force: true });
  });

  it('陽性対照: /tmp/codex 配下は Claude helper では拒否する', () => {
    const dir = '/tmp/codex/rm-tmp-test';
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'denied.txt');
    writeFileSync(file, 'denied');

    const result = runRmTmp(claudeScript, [file]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to remove outside /tmp/claude');
    expect(existsSync(file)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('陽性対照: repository file は拒否する', () => {
    const result = runRmTmp(claudeScript, ['.claude/settings.json']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to remove outside /tmp/claude');
    expect(existsSync('.claude/settings.json')).toBe(true);
  });

  it('陽性対照: 未サポート option は拒否する', () => {
    const result = runRmTmp(claudeScript, ['-P', '/tmp/claude/example.txt']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unsupported rm option');
  });

  it('script は bash で実行できる構文を保つ', () => {
    expect(() => execFileSync('bash', ['-n', claudeScript], { cwd: process.cwd() })).not.toThrow();
  });
});
