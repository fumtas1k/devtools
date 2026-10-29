import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectChangedPackages,
  findTooFreshPackages,
  packageNameFromPath,
} from '../../scripts/check-lockfile-release-age.mjs';

// scripts/check-lockfile-release-age.mjs の検証（docs/decisions.md [132]）。
// Dependabot の自動マージで、修正対象以外の公開直後の版を止めるガード。

const NOW = new Date('2026-10-29T00:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const lock = (packages: Record<string, { version?: string; link?: boolean }>) => ({
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
    expect(collectChangedPackages(BASE, head)).toEqual([
      { name: 'undici', version: '8.12.3' },
      { name: 'new-dep', version: '2.0.0' },
    ]);
  });
});

describe('findTooFreshPackages', () => {
  const changed = [
    { name: 'undici', version: '8.12.3' },
    { name: 'new-dep', version: '2.0.0' },
  ];

  it('修正対象以外がすべて 7 日以上前なら違反なし', () => {
    const violations = findTooFreshPackages({
      changed,
      allowNames: ['undici'],
      publishedAt: (name: string) => (name === 'undici' ? daysAgo(0) : daysAgo(30)),
      now: NOW,
      minDays: 7,
    });
    expect(violations).toEqual([]);
  });
});

describe('[陽性対照] findTooFreshPackages', () => {
  const changed = [
    { name: 'undici', version: '8.12.3' },
    { name: 'new-dep', version: '2.0.0' },
  ];

  it('修正対象と一緒に入った公開直後の推移的依存を検出する', () => {
    const violations = findTooFreshPackages({
      changed,
      allowNames: ['undici'],
      publishedAt: () => daysAgo(1),
      now: NOW,
      minDays: 7,
    });
    expect(violations.map((v: { name: string }) => v.name)).toEqual(['new-dep']);
  });

  it('公開日時を取得できない版は fail closed で違反にする', () => {
    const violations = findTooFreshPackages({
      changed,
      allowNames: ['undici'],
      publishedAt: () => null,
      now: NOW,
      minDays: 7,
    });
    expect(violations).toEqual([
      { name: 'new-dep', version: '2.0.0', reason: '公開日時を取得できない' },
    ]);
  });
});

describe('CLI（PATH 上の偽 npm 経由で npm view の経路を通す）', () => {
  const runCli = (publishedIso: string, head: object) => {
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
    try {
      const stdout = execFileSync(
        process.execPath,
        ['scripts/check-lockfile-release-age.mjs', basePath, headPath, '--allow', 'undici'],
        { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } }
      );
      return { code: 0, stdout };
    } catch (error) {
      const e = error as { status: number; stdout: string };
      return { code: e.status, stdout: e.stdout };
    }
  };
  const head = lock({
    'node_modules/undici': { version: '8.12.3' },
    'node_modules/old-dep': { version: '1.0.0' },
    'node_modules/new-dep': { version: '2.0.0' },
  });

  it('推移的依存が十分古ければ exit 0', () => {
    expect(runCli('2020-01-01T00:00:00.000Z', head).code).toBe(0);
  });

  it('[陽性対照] 推移的依存が公開直後なら exit 1 で版を報告する', () => {
    const result = runCli(new Date().toISOString(), head);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('NG new-dep@2.0.0');
  });
});
