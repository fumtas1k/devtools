import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
mkdirSync('/tmp/codex', { recursive: true });
const temporaryRoot = mkdtempSync('/tmp/codex/rules-smoke-');
const home = join(temporaryRoot, 'home');
const codexHome = join(temporaryRoot, 'codex-home');
mkdirSync(home);
mkdirSync(codexHome);

// 認証情報や利用者の設定を渡さず、引数の評価だけを行う。
const env = { PATH: process.env.PATH, HOME: home, CODEX_HOME: codexHome, XDG_CONFIG_HOME: home };
function codex(args) {
  const result = spawnSync('codex', args, {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `codex terminated by ${result.signal}`);
  return result;
}

function check(rules) {
  return codex(['execpolicy', 'check', '--rules', rules, '--', 'git', 'status']);
}

after(() => {
  const result = spawnSync('bash', [join(repoRoot, 'scripts/rm-tmp.sh'), '-r', temporaryRoot], {
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('固定した Codex CLI を使用する', () => {
  const result = codex(['--version']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'codex-cli 0.164.0');
});

test('本番ルールを読み込み git status を allow と判定する', () => {
  const result = check(join(repoRoot, '.codex/rules/default.rules'));
  assert.equal(result.status, 0, result.stderr);
  const policy = JSON.parse(result.stdout);
  assert.equal(policy.decision, 'allow');
  assert.ok(
    policy.matchedRules.some(
      ({ prefixRuleMatch }) =>
        prefixRuleMatch?.decision === 'allow' &&
        JSON.stringify(prefixRuleMatch.matchedPrefix) === JSON.stringify(['git', 'status'])
    )
  );
});

for (const { name, example, diagnostic } of [
  {
    name: 'not_match',
    example: 'not_match = ["git status"]',
    diagnostic: /expected example to not match rule/,
  },
  {
    name: 'match',
    example: 'match = ["git log"]',
    diagnostic: /expected every example to match at least one rule/,
  },
]) {
  test(`不正な ${name} 例を loader が拒否する`, () => {
    const fixture = join(temporaryRoot, `${name}.rules`);
    writeFileSync(
      fixture,
      `prefix_rule(\n    pattern = ["git", "status"],\n    decision = "allow",\n    ${example},\n)\n`
    );
    const result = check(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /failed to parse policy/);
    assert.match(result.stderr, diagnostic);
  });
}
