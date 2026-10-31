import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const hook = resolve('.githooks/commit-msg');
const locales = execFileSync('locale', ['-a'], { encoding: 'utf8' }).split('\n');
const utf8Locales = locales.filter((locale) => /^(C|en_US|ja_JP)\.(utf-?8)$/i.test(locale));
const testLocales = ['C', ...utf8Locales];

describe('commit-msg hook', () => {
  let dir: string;
  let messageFile: string;

  beforeEach(() => {
    mkdirSync('/tmp/codex', { recursive: true });
    dir = mkdtempSync('/tmp/codex/commit-msg-');
    messageFile = join(dir, 'message');
  });

  afterEach(() => {
    execFileSync('bash', ['scripts/rm-tmp.sh', '-r', dir]);
  });

  function run(message: string | Buffer, locale = 'C', path = process.env.PATH) {
    writeFileSync(messageFile, message);
    return spawnSync('sh', [hook, messageFile], {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: locale, PATH: path },
    });
  }

  it.each(testLocales)('陽性対照: %s でも許可された日本語を正しく数える', (locale) => {
    for (const subject of ['ぁん', 'ァン', '一龯', '、。', 'あア', 'fix: 日本語']) {
      const result = run(`fix: ${subject}`, locale);
      expect(result.status, `${locale}: ${subject}: ${result.stderr}`).toBe(0);
    }
  });

  it.each(testLocales)('%s で日本語が 2 文字未満なら拒否する', (locale) => {
    for (const subject of ['English only', 'あ', '゠゠', 'ゔゔ', 'ヷヷ', '龰龰', '😀😀']) {
      const result = run(`fix: ${subject}`, locale);
      expect(result.status, `${locale}: ${subject}`).toBe(1);
      expect(result.stderr).toContain('日本語が含まれていません');
    }
  });

  it('Conventional Commits 形式を検証する', () => {
    for (const message of ['fix 日本語', 'unknown: 日本語', 'fix:日本語']) {
      const result = run(message);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Conventional Commits');
    }
    expect(run('fix(scope): 日本語').status).toBe(0);
  });

  it('既存の空行・コメントと特殊コミットの例外を維持する', () => {
    for (const message of [
      '',
      '# comment\n',
      '\nfix: English',
      'fixup! English',
      'squash! English',
      'Merge branch',
      'Revert English',
    ]) {
      expect(run(message).status, message).toBe(0);
    }
    expect(run('# comment\nfix: 日本語\nbody').status).toBe(0);
    expect(run('# comment\nfix: English\n日本語').status).toBe(1);
  });

  it('陽性対照: Node の失敗や不正な出力を拒否する', () => {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const node = join(bin, 'node');
    for (const script of ['#!/bin/sh\nexit 1\n', '#!/bin/sh\nprintf invalid\n']) {
      writeFileSync(node, script);
      chmodSync(node, 0o755);
      const result = run('fix: 日本語', 'C', `${bin}:${process.env.PATH}`);
      expect(result.status).not.toBe(0);
    }
  });

  it('陽性対照: 読み込み失敗と不正な UTF-8 を拒否する', () => {
    const missing = spawnSync('sh', [hook, join(dir, 'missing')], { encoding: 'utf8' });
    expect(missing.status).not.toBe(0);
    const invalid = run(Buffer.concat([Buffer.from('fix: 日本語'), Buffer.from([0xff])]));
    expect(invalid.status).not.toBe(0);
  });
});
