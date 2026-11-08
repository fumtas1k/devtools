import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = 'scripts/rm-tmp.sh';

function runRmTmp(args: string[]) {
  return spawnSync('bash', [script, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

function withTempDir<T>(parent: string, prefix: string, fn: (dir: string) => T): T {
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, prefix));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function isWritable(parent: string): boolean {
  try {
    return withTempDir(parent, '.rm-tmp-probe-', () => true);
  } catch {
    return false;
  }
}

const codexTmpWritable = isWritable('/tmp/codex');

describe('scripts/rm-tmp.sh', () => {
  it('許可領域: /tmp/claude 配下のファイルを削除できる', () => {
    withTempDir('/tmp/claude', 'rm-tmp-test-', (dir) => {
      const file = join(dir, 'ok.txt');
      writeFileSync(file, 'ok');

      const result = runRmTmp([file]);

      expect(result.status).toBe(0);
      expect(existsSync(file)).toBe(false);
    });
  });

  it.runIf(codexTmpWritable)('許可領域: /tmp/codex 配下のファイルを削除できる', () => {
    withTempDir('/tmp/codex', 'rm-tmp-test-', (dir) => {
      const file = join(dir, 'ok.txt');
      writeFileSync(file, 'ok');

      const result = runRmTmp([file]);

      expect(result.status).toBe(0);
      expect(existsSync(file)).toBe(false);
    });
  });

  it('陽性対照: 許可領域内 symlink + 末尾スラッシュで許可領域外を削除できない', () => {
    withTempDir('/tmp/claude', 'rm-tmp-link-test-', (linkHost) => {
      withTempDir('/tmp', 'rm-tmp-symlink-outside-', (outsideDir) => {
        const keepFile = join(outsideDir, 'keep.txt');
        const link = join(linkHost, 'link');
        writeFileSync(keepFile, 'keep');
        symlinkSync(outsideDir, link);

        const result = runRmTmp(['-r', `${link}/`]);

        expect(result.status).toBe(0);
        expect(existsSync(link)).toBe(false);
        expect(existsSync(keepFile)).toBe(true);
      });
    });
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
