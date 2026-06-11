import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  chmodSync,
  symlinkSync,
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
  // npx を no-op 化（CLAUDE_CODE_REMOTE=true で実行された場合に実 playwright download へ抜けない）
  const fakeNpx = join(binDir, 'npx');
  writeFileSync(fakeNpx, '#!/bin/sh\nexit 0\n');
  chmodSync(fakeNpx, 0o755);
  return binDir;
}

/**
 * `claude plugin install <name>` の呼び出しを plugin-install-log に記録する fake claude を
 * fakebin に追加する。exitCode 非 0 で install 失敗を模擬できる。
 */
function setupFakeClaude(binDir: string, exitCode = 0): void {
  const fakeClaude = join(binDir, 'claude');
  writeFileSync(
    fakeClaude,
    `#!/bin/sh\nif [ "$1" = "plugin" ] && [ "$2" = "install" ]; then echo "$3" >>plugin-install-log; fi\nexit ${exitCode}\n`
  );
  chmodSync(fakeClaude, 0o755);
}

/** plugin install が呼ばれたプラグイン名一覧（plugin-install-log の行）を返す */
function installedPlugins(cwd: string): string[] {
  const f = join(cwd, 'plugin-install-log');
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8').split('\n').filter(Boolean);
}

/** enabledPlugins 宣言入りの .claude/settings.json を temp dir に作る */
function writeSettings(dir: string, enabledPlugins: Record<string, boolean>): void {
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins }));
}

/** script を temp dir 内で実行（fake npm を PATH 先頭に）。env で CLAUDE_CODE_REMOTE 等を制御 */
function runHook(cwd: string, binDir: string, env: Record<string, string> = {}): void {
  execFileSync('bash', [scriptPath], {
    cwd,
    env: {
      ...process.env,
      CLAUDE_CODE_REMOTE: '',
      ...env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
    },
  });
}

/** runHook と同じ実行で exit code / stderr も観測する（warn 出力の assert 用） */
function runHookCapture(
  cwd: string,
  binDir: string,
  env: Record<string, string> = {},
  pathOverride?: string
): { status: number | null; stderr: string } {
  const r = spawnSync('bash', [scriptPath], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_CODE_REMOTE: '',
      ...env,
      PATH: pathOverride ?? `${binDir}:${process.env.PATH ?? ''}`,
    },
  });
  return { status: r.status, stderr: r.stderr };
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

describe('session-install.sh: enabledPlugins 自動 install（web 限定）', () => {
  let dir: string;
  let binDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'session-install-'));
    binDir = setupFakeNpm(dir);
    setupFakeClaude(binDir);
    writeFileSync(join(dir, 'package-lock.json'), '{"v":1}');
    writeSettings(dir, {
      'superpowers@claude-plugins-official': true,
      'context7@claude-plugins-official': true,
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // 陽性対照: web セッションでは settings.json の enabledPlugins 全件を install する。
  // 旧実装（plugin install ブロックなし）に当てると plugin-install-log が生成されず fail する。
  it('CLAUDE_CODE_REMOTE=true なら enabledPlugins を全件 install する', () => {
    runHook(dir, binDir, { CLAUDE_CODE_REMOTE: 'true' });
    expect(installedPlugins(dir)).toEqual([
      'superpowers@claude-plugins-official',
      'context7@claude-plugins-official',
    ]);
  });

  // 陰性対照: ローカル（CLI / Desktop）では trust dialog の自動 prompt に委ね、hook では触らない
  it('CLAUDE_CODE_REMOTE が true でなければ install しない', () => {
    runHook(dir, binDir);
    expect(installedPlugins(dir)).toEqual([]);
  });

  // 陰性対照: enabledPlugins で false 宣言されたプラグインは install 対象外
  it('false 宣言のプラグインは install しない', () => {
    writeSettings(dir, {
      'superpowers@claude-plugins-official': true,
      'frontend-design@claude-plugins-official': false,
    });
    runHook(dir, binDir, { CLAUDE_CODE_REMOTE: 'true' });
    expect(installedPlugins(dir)).toEqual(['superpowers@claude-plugins-official']);
  });

  // 陰性対照: .claude/settings.json が無いプロジェクト（テスト temp dir 等）では何もしない
  it('.claude/settings.json が無ければ install しない', () => {
    rmSync(join(dir, '.claude'), { recursive: true });
    runHook(dir, binDir, { CLAUDE_CODE_REMOTE: 'true' });
    expect(installedPlugins(dir)).toEqual([]);
  });

  // 失敗許容: install 失敗（exit 非 0）でも hook 全体は fail しない（次セッション再試行に委ねる）
  it('plugin install が失敗しても hook は exit 0 のまま継続する', () => {
    setupFakeClaude(binDir, 1);
    expect(() => runHook(dir, binDir, { CLAUDE_CODE_REMOTE: 'true' })).not.toThrow();
  });

  // 陽性対照: settings.json が malformed JSON なら warn を stderr に出して hook は exit 0 で継続する。
  // 旧実装（node の stderr を 2>/dev/null で握りつぶす）に当てると warn が観測できず fail する。
  it('settings.json が malformed JSON なら warn を出しつつ exit 0 で継続する', () => {
    writeFileSync(join(dir, '.claude', 'settings.json'), '{ broken');
    const r = runHookCapture(dir, binDir, { CLAUDE_CODE_REMOTE: 'true' });
    expect(r.status).toBe(0);
    expect(installedPlugins(dir)).toEqual([]);
    expect(r.stderr).toContain('parse に失敗');
  });

  // 陽性対照: `-` 始まり等の不正形式プラグイン名は CLI に渡さず warn して skip する。
  // 旧実装（形式チェックなし）に当てると不正名も install されて fail する。
  it('不正な形式のプラグイン名は install せず warn する', () => {
    writeSettings(dir, {
      '--dangerously-evil': true,
      'superpowers@claude-plugins-official': true,
    });
    const r = runHookCapture(dir, binDir, { CLAUDE_CODE_REMOTE: 'true' });
    expect(installedPlugins(dir)).toEqual(['superpowers@claude-plugins-official']);
    expect(r.stderr).toContain('--dangerously-evil');
  });

  // 陰性対照: claude コマンド不在（CLI 未配備環境）では install を試みず hook も fail しない。
  // PATH を fakebin + 最小システム dir に限定し、実 claude（node と同居しがち）を除外する。
  // bash / coreutils / node だけ解決できるよう node は fakebin に symlink して持ち込む。
  it('claude コマンドが無ければ install せず exit 0 で継続する', () => {
    rmSync(join(binDir, 'claude')); // beforeEach の fake claude を除去して不在を再現
    symlinkSync(process.execPath, join(binDir, 'node'));
    const r = runHookCapture(
      dir,
      binDir,
      { CLAUDE_CODE_REMOTE: 'true' },
      `${binDir}:/usr/bin:/bin`
    );
    expect(r.status).toBe(0);
    expect(installedPlugins(dir)).toEqual([]);
  });
});
