// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import GithubSlugger from 'github-slugger';
import { marked } from 'marked';
import { describe, expect, it } from 'vitest';

const toolsMdPath = resolve('docs/tools.md');

/** 目次のリンクを文書全体の GitHub 見出しアンカーと照合する。 */
function checkTocAnchors(content: string) {
  const tokens = marked.lexer(content);
  const tocStart = tokens.findIndex(
    (token) => token.type === 'heading' && token.depth === 2 && token.text === '目次'
  );
  const tocEnd = tokens.findIndex(
    (token, index) => index > tocStart && token.type === 'heading' && token.depth <= 2
  );
  const tocTokens = tocStart < 0 ? [] : tokens.slice(tocStart + 1, tocEnd < 0 ? undefined : tocEnd);

  const slugger = new GithubSlugger();
  const anchors = new Set<string>();
  marked.walkTokens(tokens, (token) => {
    if (token.type === 'heading') {
      if (!token.tokens) throw new Error('見出しのインライントークンがない');
      const element = document.createElement('div');
      element.innerHTML = marked.Parser.parseInline(token.tokens);
      const text = element.textContent ?? '';
      anchors.add(slugger.slug(text));
    }
  });

  const links: string[] = [];
  marked.walkTokens(tocTokens, (token) => {
    if (token.type === 'link' && token.href.startsWith('#')) links.push(token.href);
  });
  const broken = links.filter((link) => {
    try {
      return !anchors.has(decodeURIComponent(link.slice(1)));
    } catch {
      return true;
    }
  });
  return { tocFound: tocStart >= 0, links, broken };
}

describe('tools.md の目次アンカー', () => {
  it('目次の各リンクが実在する見出しを参照する', () => {
    const result = checkTocAnchors(readFileSync(toolsMdPath, 'utf-8'));
    expect(result.tocFound, '目次セクションが見つからない').toBe(true);
    expect(result.links.length, '目次にアンカーリンクがない').toBeGreaterThan(0);
    expect(result.broken, `リンク先のないアンカー: ${result.broken.join(', ')}`).toEqual([]);
  });

  it('日本語・記号・重複見出しを含む正常な目次を受け入れる', () => {
    const content = `# 文書

## 目次
- [一つ目](#urlエンコードデコード)
  - [二つ目](#urlエンコードデコード-1)
- [三つ目](#json--xml-変換)
- [日本語](#%E7%94%9F%E6%88%90)

## URLエンコード/デコード
### URLエンコード/デコード
### JSON / XML 変換
## 生成
`;
    const result = checkTocAnchors(content);
    expect(result.tocFound).toBe(true);
    expect(result.links).toHaveLength(4);
    expect(result.broken).toEqual([]);
  });

  it('参照形式リンク・強調・インラインコード・実体参照を含む見出しのアンカーを受け入れる', () => {
    const content = `## 目次
- [見出し](#生成-強調-code--xml)

## [生成][ref] **強調** \`code\` &amp; XML

[ref]: https://example.com
`;
    expect(checkTocAnchors(content).broken).toEqual([]);
  });
});

describe('[陽性対照] 目次アンカー検知機構', () => {
  it('参照形式リンクの参照名を含む誤ったアンカーを検出する', () => {
    const content = `## 目次
- [見出し](#生成ref-強調-code--xml)

## [生成][ref] **強調** \`code\` &amp; XML

[ref]: https://example.com
`;
    expect(checkTocAnchors(content).broken).toEqual(['#生成ref-強調-code--xml']);
  });

  it('実際の目次に存在しないリンクを注入すると検出する', () => {
    const content = readFileSync(toolsMdPath, 'utf-8').replace('](#生成)', '](#存在しない)');
    expect(checkTocAnchors(content).broken).toEqual(['#存在しない']);
  });

  it('コードブロック内の見出しと重複見出しの未生成 slug を検出する', () => {
    const content = `## 目次
- [架空](#架空)
- [重複](#同じ-2)
- [不正なエンコード](#%ZZ)

## 同じ
### 同じ

\`\`\`markdown
## 架空
\`\`\`
`;
    expect(checkTocAnchors(content).broken).toEqual(['#架空', '#同じ-2', '#%ZZ']);
  });
});
