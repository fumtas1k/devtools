// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@/utils/markdown';

// ─────────────────────────────────────────────────────────────
// 陰性対照: 正常な markdown が期待する HTML に変換されること
// ─────────────────────────────────────────────────────────────
describe('renderMarkdown — 陰性対照（正常変換）', () => {
  it('見出し # H1 → <h1>', () => {
    const out = renderMarkdown('# 見出し1');
    expect(out).toContain('<h1>');
    expect(out).toContain('見出し1');
  });

  it('見出し ## H2 → <h2>', () => {
    const out = renderMarkdown('## 見出し2');
    expect(out).toContain('<h2>');
    expect(out).toContain('見出し2');
  });

  it('**bold** → <strong>', () => {
    const out = renderMarkdown('**太字**');
    expect(out).toContain('<strong>');
    expect(out).toContain('太字');
  });

  it('_italic_ → <em>', () => {
    const out = renderMarkdown('_斜体_');
    expect(out).toContain('<em>');
    expect(out).toContain('斜体');
  });

  it('箇条書き → <ul><li>', () => {
    const out = renderMarkdown('- アイテム1\n- アイテム2');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>');
    expect(out).toContain('アイテム1');
    expect(out).toContain('アイテム2');
  });

  it('番号付きリスト → <ol><li>', () => {
    const out = renderMarkdown('1. 第一項\n2. 第二項');
    expect(out).toContain('<ol>');
    expect(out).toContain('<li>');
    expect(out).toContain('第一項');
  });

  it('GFM 表 → <table>', () => {
    const md = '| 名前 | 値 |\n| --- | --- |\n| foo | bar |';
    const out = renderMarkdown(md);
    expect(out).toContain('<table>');
    expect(out).toContain('<th>');
    expect(out).toContain('<td>');
    expect(out).toContain('foo');
    expect(out).toContain('bar');
  });

  it('コードブロック → <pre><code>', () => {
    const out = renderMarkdown('```\nconsole.log("hello")\n```');
    expect(out).toContain('<pre>');
    expect(out).toContain('<code>');
    expect(out).toContain('console.log');
  });

  it('引用 → <blockquote>', () => {
    const out = renderMarkdown('> 引用テキスト');
    expect(out).toContain('<blockquote>');
    expect(out).toContain('引用テキスト');
  });

  it('通常のリンク → <a href="https://...">', () => {
    const out = renderMarkdown('[リンク](https://example.com)');
    expect(out).toContain('<a ');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('リンク');
  });

  it('取り消し線（GFM） → <del>', () => {
    const out = renderMarkdown('~~打ち消し~~');
    expect(out).toContain('<del>');
    expect(out).toContain('打ち消し');
  });
});

// ─────────────────────────────────────────────────────────────
// 陽性対照: 危険なペイロードが除去されることの証明
// （陰性対照のみでは「除去能力ゼロで green」と区別できない）
// ─────────────────────────────────────────────────────────────
describe('renderMarkdown — 陽性対照（XSS・危険要素の除去）', () => {
  it('<script>alert(1)</script> がプレビュー HTML に残らない', () => {
    const out = renderMarkdown('<script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('インライン <script> もマークダウン段落内に埋め込まれた場合に除去される', () => {
    const out = renderMarkdown('通常テキスト\n<script>evil()</script>\n続きテキスト');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('evil()');
    expect(out).toContain('通常テキスト');
    expect(out).toContain('続きテキスト');
  });

  it('[x](javascript:alert(1)) の javascript: href が除去される', () => {
    const out = renderMarkdown('[クリック](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('クリック');
  });

  it('[x](javascript:void(0)) も除去される', () => {
    const out = renderMarkdown('[テスト](javascript:void(0))');
    expect(out).not.toContain('javascript:');
  });

  it('onerror 属性（HTMLインライン）が除去される', () => {
    const out = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('alert(1)');
  });

  it('<iframe> が除去される', () => {
    const out = renderMarkdown('<iframe src="https://evil.example.com"></iframe>通常テキスト');
    expect(out).not.toContain('<iframe');
    expect(out).toContain('通常テキスト');
  });

  it('onclick などイベント属性が除去される', () => {
    const out = renderMarkdown('<div onclick="alert(1)">クリック</div>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('クリック');
  });
});
