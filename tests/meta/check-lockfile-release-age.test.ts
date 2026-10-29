import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertSupportedLockfile,
  collectChangedPackages,
  findTooFreshPackages,
  packageNameFromPath,
} from '../../scripts/check-lockfile-release-age.mjs';

// scripts/check-lockfile-release-age.mjs の検証（docs/decisions.md [132]）。
// Dependabot の自動マージで、advisory の修正版以外の公開直後の版を止めるガード。

const NOW = new Date('2026-10-29T00:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const registry = (name: string, version: string) =>
  `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`;

type Entry = { version?: string; link?: boolean; name?: string; resolved?: string };
const lock = (packages: Record<string, Entry>) => ({
  lockfileVersion: 3,
  packages: { '': { name: 'root' }, ...packages },
});

const BASE = lock({
  'node_modules/undici': { version: '8.10.2' },
  'node_modules/old-dep': { version: '1.0.0' },
});

describe('packageNameFromPath', () => {
  it('ネストした scoped package の名前を取り出す', () => {
    expect(packageNameFromPath('node_modules/a/node_modules/@scope/b')).toBe('@scope/b');
    expect(packageNameFromPath('')).toBeNull();
  });
});

describe('collectChangedPackages', () => {
  it('版が変わったものと新しく入ったものだけを返す', () => {
    const head = lock({
      'node_modules/undici': { version: '8.12.3' },
      'node_modules/old-dep': { version: '1.0.0' },
      'node_modules/undici/node_modules/new-dep': { version: '2.0.0' },
      'node_modules/workspace-pkg': { link: true },
    });
    expect(
      collectChangedPackages(BASE, head).map(({ name, version }) => ({ name, version }))
    ).toEqual([
      { name: 'undici', version: '8.12.3' },
      { name: 'new-dep', version: '2.0.0' },
    ]);
  });
});

describe('findTooFreshPackages', () => {
  it('advisory の修正版と完全一致する版だけは公開直後でも通し、他が 7 日以上前なら違反なし', () => {
    const violations = findTooFreshPackages({
      changed: [
        { name: 'undici', version: '8.12.3', resolved: registry('undici', '8.12.3') },
        { name: 'new-dep', version: '2.0.0', resolved: registry('new-dep', '2.0.0') },
      ],
      allowExact: ['undici@8.12.3'],
      publishedAt: (name: string) => (name === 'undici' ? daysAgo(0) : daysAgo(30)),
      now: NOW,
      minDays: 7,
    });
    expect(violations).toEqual([]);
  });
});

describe('[陽性対照] findTooFreshPackages', () => {
  const run = (changed: Entry[], allowExact: string[], publishedAt: () => Date | null) =>
    findTooFreshPackages({ changed, allowExact, publishedAt, now: NOW, minDays: 7 }).map(
      (v: { name: string; version: string }) => `${v.name}@${v.version}`
    );

  it('修正対象と一緒に入った公開直後の推移的依存を検出する', () => {
    expect(
      run(
        [
          { name: 'undici', version: '8.12.3' },
          { name: 'new-dep', version: '2.0.0' },
        ],
        ['undici@8.12.3'],
        () => daysAgo(1)
      )
    ).toEqual(['new-dep@2.0.0']);
  });

  it('修正対象でも advisory の修正版より新しい公開直後の版は検出する（npm update が範囲内の最新版を選ぶケース）', () => {
    expect(
      run([{ name: 'undici', version: '8.12.4' }], ['undici@8.12.3'], () => daysAgo(0))
    ).toEqual(['undici@8.12.4']);
  });

  it('公開日時を取得できない版は fail closed で違反にする', () => {
    expect(run([{ name: 'new-dep', version: '2.0.0' }], [], () => null)).toEqual(['new-dep@2.0.0']);
  });

  it('registry 外を指す resolved は公開日時に関係なく違反にする', () => {
    expect(
      run(
        [{ name: 'old-dep', version: '1.0.1', resolved: 'https://evil.example.com/old-dep.tgz' }],
        [],
        () => daysAgo(365)
      )
    ).toEqual(['old-dep@1.0.1']);
  });
});

describe('[陽性対照] lockfile の形式と alias', () => {
  it('v1 形式（packages なし）の lockfile を拒否する', () => {
    expect(() =>
      assertSupportedLockfile({ lockfileVersion: 1, dependencies: {} }, 'head')
    ).toThrow();
  });

  it('alias は entry.name の実体パッケージで判定する', () => {
    const head = lock({
      ...BASE.packages,
      'node_modules/x/node_modules/lodash': { name: 'typescript', version: '4.17.21' },
    });
    expect(collectChangedPackages(BASE, head).map((p: { name: string }) => p.name)).toEqual([
      'typescript',
    ]);
  });
});

describe('CLI（PATH 上の偽 npm 経由で npm view の経路を通す）', () => {
  const runCli = (publishedIso: string, head: object, allow: string[] = ['undici@8.12.3']) => {
    const dir = mkdtempSync(join(tmpdir(), 'lock-age-'));
    // npm view <name>@<version> time --json の出力を模した偽 npm
    const fakeNpm = join(dir, 'npm');
    writeFileSync(
      fakeNpm,
      `#!/bin/sh\nver=$(echo "$2" | sed 's/.*@//')\nprintf '{"%s":"${publishedIso}"}' "$ver"\n`
    );
    chmodSync(fakeNpm, 0o755);
    const basePath = join(dir, 'base.json');
    const headPath = join(dir, 'head.json');
    writeFileSync(basePath, JSON.stringify(BASE));
    writeFileSync(headPath, JSON.stringify(head));
    const args = ['scripts/check-lockfile-release-age.mjs', basePath, headPath];
    if (allow.length > 0) args.push('--allow', allow.join(','));
    try {
      const stdout = execFileSync(process.execPath, args, {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
      });
      return { code: 0, stdout };
    } catch (error) {
      const e = error as { status: number; stdout: string };
      return { code: e.status, stdout: e.stdout };
    }
  };
  const head = lock({
    'node_modules/undici': { version: '8.12.3', resolved: registry('undici', '8.12.3') },
    'node_modules/old-dep': { version: '1.0.0' },
    'node_modules/new-dep': { version: '2.0.0', resolved: registry('new-dep', '2.0.0') },
  });

  it('推移的依存が十分古ければ exit 0', () => {
    expect(runCli('2020-01-01T00:00:00.000Z', head).code).toBe(0);
  });

  it('[陽性対照] 推移的依存が公開直後なら exit 1 で版を報告する', () => {
    const result = runCli(new Date().toISOString(), head);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('NG new-dep@2.0.0');
  });

  it('[陽性対照] 名前だけの --allow は丸ごと許可と取り違えないよう exit 2 で拒否する', () => {
    expect(runCli('2020-01-01T00:00:00.000Z', head, ['undici']).code).toBe(2);
  });
});
