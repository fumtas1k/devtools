#!/usr/bin/env node
// Dependabot security update の lockfile 差分のうち、新しく入った版が公開から
// --min-days 日以上たっているかを確認する。例外は --allow に完全一致する name@version だけ
// （advisory の first_patched_version を workflow が渡す）。
//
// Dependabot は security update で npm に --min-release-age=0 を渡すため、
// 一緒に解決し直された推移的依存にも、推移的依存の修正対象そのもの（npm update は範囲内の
// 最新版を選ぶ）にも公開直後の版が入りうる。自動マージでは .npmrc の min-release-age=7 が
// 守っていた範囲をこのスクリプトで補う（docs/decisions.md [132]）。
//
// 使い方:
//   node scripts/check-lockfile-release-age.mjs <base-lock> <head-lock> [--allow <name>@<version>[,...]] [--min-days 7]
// 終了コード: 0 = 問題なし / 1 = 若すぎる版・公開日時の取れない版・registry 外の版がある、または lockfile が v2 未満 / 2 = 引数エラー

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DAY_MS = 24 * 60 * 60 * 1000;
const REGISTRY_PREFIX = 'https://registry.npmjs.org/';

// `node_modules/a/node_modules/@scope/b` → `@scope/b`
export function packageNameFromPath(path) {
  const index = path.lastIndexOf('node_modules/');
  return index === -1 ? null : path.slice(index + 'node_modules/'.length);
}

// alias（`"x": "npm:typescript@..."`）では entry.name が実体のパッケージ名になる
function entryName(path, entry) {
  return entry.name ?? packageNameFromPath(path);
}

// v1 形式は packages を持たず、差分 0 件として素通りするため受け付けない
export function assertSupportedLockfile(lock, label) {
  if (!(lock.lockfileVersion >= 2) || typeof lock.packages !== 'object' || lock.packages === null) {
    throw new Error(`${label}: lockfileVersion 2 以上の packages を持つ lockfile が必要`);
  }
}

// head にあって base に無い（name, version）を返す。版が変わらない移動・削除は対象外
export function collectChangedPackages(baseLock, headLock) {
  const basePairs = new Set();
  for (const [path, entry] of Object.entries(baseLock.packages)) {
    if (path === '') continue;
    const name = entryName(path, entry);
    if (name && entry.version) basePairs.add(`${name}@${entry.version}`);
  }

  const changed = new Map();
  for (const [path, entry] of Object.entries(headLock.packages)) {
    if (path === '') continue;
    const name = entryName(path, entry);
    // link（workspace）は registry から取得しないので対象外
    if (!name || entry.link || !entry.version) continue;
    const key = `${name}@${entry.version}`;
    if (!basePairs.has(key)) {
      changed.set(key, { name, version: entry.version, resolved: entry.resolved });
    }
  }
  return [...changed.values()];
}

// publishedAt: (name, version) => Date | null。null は公開日時が取れなかったことを示し、違反として扱う
export function findTooFreshPackages({ changed, allowExact, publishedAt, now, minDays }) {
  const allow = new Set(allowExact);
  const violations = [];
  for (const pkg of changed) {
    if (pkg.resolved !== undefined && !pkg.resolved.startsWith(REGISTRY_PREFIX)) {
      violations.push({ ...pkg, reason: `registry 外から取得する（${pkg.resolved}）` });
      continue;
    }
    if (allow.has(`${pkg.name}@${pkg.version}`)) continue;
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
  // name@version 形式でない --allow は、名前だけの丸ごと許可と取り違えないよう拒否する
  const malformed = options.allow.filter((a) => a.lastIndexOf('@') <= 0);
  if (positional.length !== 2 || malformed.length > 0 || !(options.minDays >= 0)) {
    console.error(
      'usage: check-lockfile-release-age.mjs <base-lock> <head-lock> [--allow <name>@<version>[,...]] [--min-days 7]'
    );
    process.exit(2);
  }
  const [baseLock, headLock] = positional.map((p) => JSON.parse(readFileSync(p, 'utf8')));
  try {
    assertSupportedLockfile(baseLock, 'base');
    assertSupportedLockfile(headLock, 'head');
  } catch (error) {
    console.log(`NG ${error.message}`);
    process.exit(1);
  }
  const changed = collectChangedPackages(baseLock, headLock);
  const violations = findTooFreshPackages({
    changed,
    allowExact: options.allow,
    publishedAt: npmPublishedAt,
    now: new Date(),
    minDays: options.minDays,
  });

  console.log(
    `lockfile で新しく入った版: ${changed.length} 件（例外: ${options.allow.join(', ') || 'なし'}）`
  );
  if (violations.length > 0) {
    for (const v of violations) console.log(`NG ${v.name}@${v.version}: ${v.reason}`);
    process.exit(1);
  }
  console.log(`OK: 例外以外はすべて公開から ${options.minDays} 日以上たっている`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
