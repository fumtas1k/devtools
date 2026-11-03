import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import postcss, { type ChildNode } from 'postcss';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/global.css', 'utf8');
const excludedPaths = [
  '../../docs',
  '../../.agents',
  '../../.claude',
  '../../.codex',
  '../../.githooks',
  '../../.github',
  '../../scripts',
  '../../tasks',
  '../../tests',
  '../../*.md',
];

// ルートの実際の at-rule だけを見る（コメント・文字列・宣言値は除外）。
function exclusionPath(node: ChildNode): string | undefined {
  if (node.type !== 'atrule' || node.name !== 'source' || node.nodes) return undefined;
  return /^not\s+(["'])([^"']+)\1\s*$/.exec(node.params)?.[2];
}

function exclusions(source: string): string[] {
  return postcss.parse(source).nodes.flatMap((node) => {
    const path = exclusionPath(node);
    return path ? [path] : [];
  });
}

function withoutExclusion(source: string, path: string): string {
  const root = postcss.parse(source);
  const matches = root.nodes.filter((node) => exclusionPath(node) === path);
  expect(matches).toHaveLength(1);
  matches[0].remove();
  return root.toString();
}

function buildFixture(styles: string): string {
  const tmpRoot = '/tmp/codex';
  mkdirSync(tmpRoot, { recursive: true });
  const root = mkdtempSync(join(tmpRoot, 'tailwind-source-'));
  let failed = false;
  try {
    mkdirSync(join(root, 'src/styles'), { recursive: true });
    mkdirSync(join(root, 'src/pages'), { recursive: true });
    mkdirSync(join(root, '.agents/skills/probe'), { recursive: true });
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    symlinkSync('../../.agents/skills/probe', join(root, '.claude/skills/probe'), 'dir');
    // global.css は @import で tokens.css / components/ 等を読むので、src/styles/ 全体を写してから global.css だけ差し替える
    cpSync(resolve('src/styles'), join(root, 'src/styles'), { recursive: true });
    writeFileSync(join(root, 'src/styles/global.css'), styles);
    writeFileSync(join(root, '.agents/skills/probe/SKILL.md'), 'bg-fuchsia-700');
    writeFileSync(
      join(root, 'src/pages/index.astro'),
      `---\nimport '../styles/global.css';\n---\n<div class="grid-cols-7">probe</div>\n`
    );
    writeFileSync(
      join(root, 'astro.config.mjs'),
      `import { defineConfig } from 'astro/config';\nimport tailwindcss from '@tailwindcss/vite';\nexport default defineConfig({ vite: { plugins: [tailwindcss()], cacheDir: './cache' }, build: { inlineStylesheets: 'never' } });\n`
    );
    execFileSync(process.execPath, [resolve('node_modules/astro/bin/astro.mjs'), 'build'], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 20000,
    });
    const assets = join(root, 'dist/_astro');
    return readdirSync(assets)
      .filter((file) => file.endsWith('.css'))
      .map((file) => readFileSync(join(assets, file), 'utf8'))
      .join('\n');
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      execFileSync('bash', ['scripts/rm-tmp.sh', '-r', root], { cwd: process.cwd() });
    } catch (error) {
      if (!failed) throw error;
      console.error('fixture の後始末に失敗しました:', error);
    }
  }
}

describe('Tailwind scan 除外', () => {
  it('実際の CSS に必要な除外がある', () => {
    expect(exclusions(css)).toEqual(expect.arrayContaining(excludedPaths));
  });

  it('空白と引用符の違いを許し、コメントや文字列中の directive は数えない', () => {
    expect(
      exclusions(
        `@source\n not  '../../docs' ; /* @source not "../../tests"; */\na { content: '@source not "../../tasks";'; }`
      )
    ).toEqual(['../../docs']);
  });

  it.each(
    ['\n', '\r', '\r\n', '\f'].flatMap((newline) => [
      { newline, quote: "'", innerQuote: '"' },
      { newline, quote: '"', innerQuote: "'" },
    ])
  )(
    'バックスラッシュ改行を含む CSS 文字列内の directive は数えない',
    ({ newline, quote, innerQuote }) => {
      const removed = withoutExclusion(css, '../../docs');
      const quoted = `a { content: ${quote}continued\\${newline}@source not ${innerQuote}../../docs${innerQuote};${quote}; }`;
      expect(exclusions(`${removed}\n${quoted}`)).not.toContain('../../docs');
    }
  );

  it('カスタムプロパティの値にある directive は数えない', () => {
    const removed = withoutExclusion(css, '../../docs');
    expect(exclusions(`${removed}\n:root { --example: @source not "../../docs"; }`)).not.toContain(
      '../../docs'
    );
  });

  it.each(excludedPaths)('除外 %s の削除・コメント化・パス誤りを検知する', (path) => {
    const removed = withoutExclusion(css, path);
    expect(exclusions(removed)).not.toContain(path);
    expect(exclusions(`${removed}\n/* @source not "${path}"; */`)).not.toContain(path);
    expect(exclusions(`${removed}\n@source not "${path}-wrong";`)).not.toContain(path);
  });

  it('通常の build は source の utility だけを生成する', () => {
    expect(css).not.toContain('grid-cols-7');
    expect(css).not.toContain('bg-fuchsia-700');
    const output = buildFixture(css);
    expect(output.length).toBeGreaterThan(0);
    expect(output).toMatch(/\.grid-cols-7\s*\{/);
    expect(output).not.toMatch(/\.bg-fuchsia-700\s*\{/);
  }, 30000);

  it.each(['../../.agents', '../../.claude'])(
    '%s の除外だけを外すと agent の utility が混入する',
    (path) => {
      const output = buildFixture(withoutExclusion(css, path));
      expect(output.length).toBeGreaterThan(0);
      expect(output).toMatch(/\.grid-cols-7\s*\{/);
      expect(output).toMatch(/\.bg-fuchsia-700\s*\{/);
    },
    30000
  );
});
