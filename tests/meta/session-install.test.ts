import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * meta test: SessionStart 依存インストールフックのガード検証 (PR #495)
 *
 * `.claude/scripts/session-install.sh` は「package-lock.json のハッシュが変わったときだけ
 * npm ci を実行する」ガード。web 環境のコンテナキャッシュで node_modules が常在しても
 * lock 変更を検知して再インストールするのが本質。
 *
 * 実 npm ci は走らせず、PATH 先頭に fake npm を差し込んで production code path
 * （script の `npm ci` 呼び出し）を確実に通し、呼び出し回数という観測可能な振る舞いを assert する。
 */

const scriptPath = fileURLToPath(
  new URL('../../.claude/scripts/session-install.sh', import.meta.url)
);

/** `npm ci` 呼び出しを記録し node_modules を作る fake npm を PATH 先頭に用意する */
function setupFakeNpm(dir: string): string {
  const binDir = join(dir, 'fakebin');
  mkdirSync(binDir);
  const fakeNpm = join(binDir, 'npm');
  // `npm ci` のときだけ node_modules を作り、ci-count に 1 行追記して呼び出しを記録する
  writeFileSync(
    fakeNpm,
    '#!/bin/sh\nif [ "$1" = "ci" ]; then mkdir -p node_modules; echo x >>ci-count; fi\n'
  );
  chmodSync(fakeNpm, 0o755);
  return binDir;
}

/** script を temp dir 内で実行（fake npm を PATH 先頭に） */
function runHook(cwd: string, binDir: string): void {
  execFileSync('bash', [scriptPath], {
    cwd,
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` },
  });
}

/** npm ci が呼ばれた回数（ci-count の行数）を返す */
function ciCount(cwd: string): number {
  const f = join(cwd, 'ci-count');
  if (!existsSync(f)) return 0;
  return readFileSync(f, 'utf8').split('\n').filter(Boolean).length;
}

describe('session-install.sh: lockfile ハッシュガード', () => {
  let dir: string;
  let binDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'session-install-'));
    binDir = setupFakeNpm(dir);
    writeFileSync(join(dir, 'package-lock.json'), '{"v":1}');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // 陰性対照: node_modules があり lock 不変なら npm ci を呼ばない（skip）
  it('lock 不変 + node_modules ありなら npm ci を skip する', () => {
    runHook(dir, binDir); // 1 回目: install
    expect(ciCount(dir)).toBe(1);
    runHook(dir, binDir); // 2 回目: lock 不変なので skip されるべき
    expect(ciCount(dir)).toBe(1);
  });

  // 陽性対照: lock が変わったら npm ci を再実行する（=lock 変更を検知できる）。
  // 旧実装（`if [ ! -d node_modules ]` のみのガード）に当てると node_modules 常在で
  // 2 回目が skip され ci-count が 1 のまま → この test が fail する = 検知能力の証明。
  it('lock が変わったら npm ci を再実行する', () => {
    runHook(dir, binDir);
    expect(ciCount(dir)).toBe(1);
    writeFileSync(join(dir, 'package-lock.json'), '{"v":2}'); // 依存変更を模擬
    runHook(dir, binDir);
    expect(ciCount(dir)).toBe(2);
  });

  // 陽性対照: node_modules 不在なら必ず install する
  it('node_modules が無ければ npm ci を実行する', () => {
    expect(existsSync(join(dir, 'node_modules'))).toBe(false);
    runHook(dir, binDir);
    expect(ciCount(dir)).toBe(1);
    expect(existsSync(join(dir, 'node_modules'))).toBe(true);
  });

  // package-lock.json が無いプロジェクトでは何もしない（早期 exit）
  it('package-lock.json が無ければ npm ci を呼ばない', () => {
    rmSync(join(dir, 'package-lock.json'));
    runHook(dir, binDir);
    expect(ciCount(dir)).toBe(0);
  });
});
