import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function assertSuccessful(result: SpawnSyncReturns<string>): void {
  if (result.error || result.status !== 0 || result.signal) {
    throw new Error(
      `子プロセスが失敗しました: error=${result.error?.message ?? 'なし'}, status=${result.status}, signal=${result.signal}\n` +
        `stdout:\n${result.stdout ?? ''}\nstderr:\n${result.stderr ?? ''}`
    );
  }
}

function checkDocument(path: string): void {
  // 通常モードは欠損ファイルを SKIP するため、先に読めることを確認する。
  readFileSync(path);
  const result = spawnSync('bash', ['scripts/check-followup-refs.sh', path], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 10000,
  });
  assertSuccessful(result);
  expect(result.stderr).not.toContain('[SKIP]');
}

describe('check-followup-refs.sh の回帰テスト', () => {
  it('既存の shell テストを実行する', () => {
    // 単体の実測は約 0.6 秒。並列実行時の余裕を含め子プロセス 10 秒、Vitest 15 秒とする。
    const result = spawnSync('bash', ['tests/scripts/check-followup-refs.test.sh'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 10000,
    });
    assertSuccessful(result);
  }, 15000);

  it.each(['docs/agent-lessons.md', 'docs/decisions.md'])(
    '%s の先送りに issue 参照がある',
    (path) => {
      checkDocument(path);
    }
  );

  it('実文書と同じ検査で参照のない先送りを失敗として伝える', () => {
    expect(() => checkDocument('tests/fixtures/followup-refs/missing-reference.md')).toThrow(
      /status=1[\s\S]*後で対応予定/
    );
  });

  it('検査対象が欠損していれば失敗する', () => {
    expect(() => checkDocument('tests/fixtures/followup-refs/nonexistent.md')).toThrow(/ENOENT/);
  });

  it('非 0 終了を出力とともに失敗として伝える', () => {
    const result = spawnSync(
      'bash',
      ['-c', 'echo standard-output; echo standard-error >&2; exit 7'],
      {
        encoding: 'utf8',
      }
    );
    expect(() => assertSuccessful(result)).toThrow(
      /status=7[\s\S]*standard-output[\s\S]*standard-error/
    );
  });

  it('起動エラーを失敗として伝える', () => {
    const result = spawnSync('/nonexistent-check-followup-refs-command', [], { encoding: 'utf8' });
    expect(() => assertSuccessful(result)).toThrow(/ENOENT/);
  });

  it('signal による終了を失敗として伝える', () => {
    const result = spawnSync('bash', ['-c', 'kill -TERM $$'], { encoding: 'utf8' });
    expect(() => assertSuccessful(result)).toThrow(/signal=SIGTERM/);
  });

  it('期限超過を失敗として伝える', () => {
    const result = spawnSync('bash', ['-c', 'exec sleep 2'], {
      encoding: 'utf8',
      timeout: 100,
    });
    expect(() => assertSuccessful(result)).toThrow(/ETIMEDOUT/);
  });
});
