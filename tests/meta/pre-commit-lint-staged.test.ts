import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = resolve('.');
describe('pre-commit lint-staged', () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' });
  const stage = (...paths: string[]) =>
    execFileSync('bash', [join(root, '.codex/scripts/git-add-files.sh'), ...paths], {
      cwd: dir,
      env,
    });
  const commit = () =>
    spawnSync('git', ['commit', '-m', 'test: 日本語'], { cwd: dir, env, encoding: 'utf8' });

  beforeEach(() => {
    mkdirSync('/tmp/codex', { recursive: true });
    dir = mkdtempSync('/tmp/codex/pre-commit-');
    env = {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: join(dir, 'global.gitconfig'),
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    };
    writeFileSync(
      env.GIT_CONFIG_GLOBAL!,
      `[core]\n\thooksPath = ${join(dir, 'other-hooks')}\n[commit]\n\tgpgsign = true\n`
    );
    git('init', '-q');
    git('config', '--local', 'core.hooksPath', '.git/hooks');
    git('config', '--local', 'commit.gpgsign', 'false');
    for (const file of ['package.json', 'eslint.config.js', '.prettierrc', '.prettierignore']) {
      copyFileSync(join(root, file), join(dir, file));
    }
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    mkdirSync(join(dir, 'src'));
    writeFileSync(
      join(dir, 'src/Example.tsx'),
      'export const Example = () => <button type="button">old</button>;\n'
    );
    stage('package.json', 'eslint.config.js', '.prettierrc', '.prettierignore', 'src/Example.tsx');
    git('commit', '-qm', 'test: 初期状態');
    copyFileSync(join(root, '.githooks/pre-commit'), join(dir, '.git/hooks/pre-commit'));
    copyFileSync(join(root, '.githooks/commit-msg'), join(dir, '.git/hooks/commit-msg'));
  });

  afterEach(() => {
    execFileSync('bash', [join(root, 'scripts/rm-tmp.sh'), '-r', dir]);
  });

  it('別のグローバル hook と署名設定があっても fixture の hook で検証する', () => {
    expect(git('config', '--global', '--get', 'core.hooksPath').trim()).toBe(
      join(dir, 'other-hooks')
    );
    expect(git('config', '--global', '--get', 'commit.gpgsign').trim()).toBe('true');
    const file = 'src/GlobalConfig.tsx';
    writeFileSync(join(dir, file), 'export const A = () => <button>bad</button>;\n');
    stage(file);
    const invalid = commit();
    expect(invalid.status, invalid.stdout + invalid.stderr).not.toBe(0);
    expect(invalid.stdout + invalid.stderr).toContain('react/button-has-type');
    writeFileSync(join(dir, file), 'export const A = () => <button type="button">ok</button>;\n');
    stage(file);
    const valid = commit();
    expect(valid.status, valid.stdout + valid.stderr).toBe(0);
  }, 30_000);

  it.each(['tsx', 'jsx'])(
    '陽性対照: %s の button type 漏れでコミットを拒否し変更を保つ',
    (extension) => {
      const file = `src/Invalid.${extension}`;
      const staged = 'export const Invalid=()=> <button>bad</button>;\n';
      const unstaged = `${staged}// unstaged\n`;
      writeFileSync(join(dir, file), staged);
      stage(file);
      writeFileSync(join(dir, file), unstaged);
      const head = git('rev-parse', 'HEAD');
      const result = commit();
      expect(result.status, result.stdout + result.stderr).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('react/button-has-type');
      expect(git('rev-parse', 'HEAD')).toBe(head);
      expect(git('show', `:${file}`)).toBe(staged);
      expect(readFileSync(join(dir, file), 'utf8')).toBe(unstaged);
    },
    30_000
  );

  it('陽性対照: ESLint の警告もコミットを拒否する', () => {
    const config = join(dir, 'eslint.config.js');
    writeFileSync(
      config,
      readFileSync(config, 'utf8').replace(
        "'react/button-has-type': 'error'",
        "'react/button-has-type': 'warn'"
      )
    );
    const file = 'src/Warning.tsx';
    const content = 'export const Warning = () => <button>warning</button>;\n';
    writeFileSync(join(dir, file), content);
    stage(file);
    const result = commit();
    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('react/button-has-type');
    expect(git('show', `:${file}`)).toBe(content);
  }, 30_000);

  it('正常な部分ステージを整形してコミットし、未ステージ変更を保持する', () => {
    const file = 'src/Example.tsx';
    const staged = 'export const Example=()=> <button type="button">new</button>;\n';
    writeFileSync(join(dir, file), staged);
    stage(file);
    writeFileSync(join(dir, file), `${staged}// unstaged\n`);
    const result = commit();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git('show', `HEAD:${file}`)).toBe(
      'export const Example = () => <button type="button">new</button>;\n'
    );
    expect(readFileSync(join(dir, file), 'utf8')).toBe(
      'export const Example = () => <button type="button">new</button>;\n// unstaged\n'
    );
    expect(git('diff', '--', file)).toContain('+// unstaged');
  }, 30_000);

  it('他の対象拡張子と src 外の JSX を引き続き整形する', () => {
    const files: Record<string, string> = {
      'sample.js': 'const x=1;\n',
      'sample.ts': 'const x:number=1;\n',
      'sample.jsx': 'const X=()=> <div />;\n',
      'sample.css': 'a{color:red}\n',
      'sample.md': '#   Heading\n',
      'sample.json': '{"x":1}\n',
      'sample.astro': '<div>  text </div>\n',
    };
    for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content);
    stage(...Object.keys(files));
    const result = commit();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    for (const [file, original] of Object.entries(files)) {
      expect(git('show', `HEAD:${file}`), file).not.toBe(original);
    }
  }, 30_000);
});
