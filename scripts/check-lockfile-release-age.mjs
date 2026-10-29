#!/usr/bin/env node
// Dependabot security update の lockfile 差分のうち、修正対象（--allow）以外で
// 新しく入った版が公開から --min-days 日以上たっているかを確認する。
//
// Dependabot は security update で npm に --min-release-age=0 を渡すため、
// 修正対象と一緒に解決し直された推移的依存にも公開直後の版が入りうる。
// 自動マージでは .npmrc の min-release-age=7 が守っていた範囲をこのスクリプトで補う
// （docs/decisions.md [132]）。
//
// 使い方:
//   node scripts/check-lockfile-release-age.mjs <base-lock> <head-lock> --allow <name>[,<name>] [--min-days 7]
// 終了コード: 0 = 問題なし / 1 = 若すぎる版（または公開日時の取れない版）がある / 2 = 引数エラー

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DAY_MS = 24 * 60 * 60 * 1000;

// `node_modules/a/node_modules/@scope/b` → `@scope/b`
export function packageNameFromPath(path) {
  const index = path.lastIndexOf('node_modules/');
  return index === -1 ? null : path.slice(index + 'node_modules/'.length);
}

// head にあって base に無い（name, version）を返す。版が変わらない移動・削除は対象外
export function collectChangedPackages(baseLock, headLock) {
  const basePairs = new Set();
  for (const [path, entry] of Object.entries(baseLock.packages ?? {})) {
    const name = packageNameFromPath(path);
    if (name && entry.version) basePairs.add(`${name}@${entry.version}`);
  }

  const changed = new Map();
  for (const [path, entry] of Object.entries(headLock.packages ?? {})) {
    const name = packageNameFromPath(path);
    // link（workspace）は registry から取得しないので対象外
    if (!name || entry.link || !entry.version) continue;
    const key = `${name}@${entry.version}`;
    if (!basePairs.has(key)) changed.set(key, { name, version: entry.version });
  }
  return [...changed.values()];
}

// publishedAt: (name, version) => Date | null。null は公開日時が取れなかったことを示し、違反として扱う
export function findTooFreshPackages({ changed, allowNames, publishedAt, now, minDays }) {
  const allow = new Set(allowNames);
  const violations = [];
  for (const pkg of changed) {
    if (allow.has(pkg.name)) continue;
    const published = publishedAt(pkg.name, pkg.version);
    if (!published) {
      violations.push({ ...pkg, reason: '公開日時を取得できない' });
      continue;
    }
    const ageDays = (now.getTime() - published.getTime()) / DAY_MS;
    if (ageDays < minDays) {
      violations.push({ ...pkg, reason: `公開から ${ageDays.toFixed(1)} 日（${minDays} 日未満）` });
    }
  }
  return violations;
}

function npmPublishedAt(name, version) {
  try {
    const out = execFileSync('npm', ['view', `${name}@${version}`, 'time', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const time = JSON.parse(out)?.[version];
    const date = time ? new Date(time) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const positional = [];
  const options = { allow: [], minDays: 7 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--allow') {
      options.allow = (argv[++i] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (argv[i] === '--min-days') {
      options.minDays = Number(argv[++i]);
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, options };
}

function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  if (positional.length !== 2 || options.allow.length === 0 || !(options.minDays >= 0)) {
    console.error(
      'usage: check-lockfile-release-age.mjs <base-lock> <head-lock> --allow <name>[,<name>] [--min-days 7]'
    );
    process.exit(2);
  }
  const [baseLock, headLock] = positional.map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const changed = collectChangedPackages(baseLock, headLock);
  const violations = findTooFreshPackages({
    changed,
    allowNames: options.allow,
    publishedAt: npmPublishedAt,
    now: new Date(),
    minDays: options.minDays,
  });

  console.log(
    `lockfile で新しく入った版: ${changed.length} 件（修正対象: ${options.allow.join(', ')}）`
  );
  if (violations.length > 0) {
    for (const v of violations) console.log(`NG ${v.name}@${v.version}: ${v.reason}`);
    process.exit(1);
  }
  console.log(`OK: 修正対象以外はすべて公開から ${options.minDays} 日以上たっている`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
