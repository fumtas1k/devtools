// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '@/utils/sanitizeHtml';

// ─────────────────────────────────────────────────────────────
// 陽性対照: 危険なペイロードが実際に除去されることの証明
// （陰性対照のみでは「除去能力ゼロで green」と区別できない）
// ─────────────────────────────────────────────────────────────
describe('sanitizeHtml — 陽性対照（危険要素・属性の除去）', () => {
  it('script 要素を中身ごと除去する', () => {
    const out = sanitizeHtml('<p>before</p><script>alert(1)</script><p>after</p>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('<p>before</p>');
    expect(out).toContain('<p>after</p>');
  });

  it('大文字小文字を混ぜた SCRIPT も除去する', () => {
    const out = sanitizeHtml('<ScRiPt>alert(1)</ScRiPt><p>x</p>');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('<p>x</p>');
  });

  it('on* イベントハンドラ属性を除去する', () => {
    const out = sanitizeHtml('<img src="https://example.com/a.png" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('alert(1)');
  });

  it('javascript: URL の href を除去する', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">link</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('link');
  });

  it('大文字混じり JAVASCRIPT: URL も除去する', () => {
    const out = sanitizeHtml('<a href="JaVaScRiPt:alert(1)">link</a>');
    expect(out).not.toContain('alert(1)');
  });

  it('iframe を中身ごと除去する', () => {
    const out = sanitizeHtml('<iframe src="https://evil.example.com"></iframe><p>x</p>');
    expect(out).not.toContain('<iframe');
    expect(out).toContain('<p>x</p>');
  });

  it('svg（onload 持ち込み経路）を中身ごと除去する', () => {
    const out = sanitizeHtml('<svg onload="alert(1)"><circle r="1"/></svg><p>x</p>');
    expect(out).not.toContain('<svg');
    expect(out).not.toContain('alert(1)');
  });

  it('img src の data:text/html を除去する（data は image/ のみ許可）', () => {
    const out = sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>">');
    expect(out).not.toContain('data:text/html');
  });

  it('style 属性を除去する（本番 CSP style-src strict 違反の発生源を断つ）', () => {
    const out = sanitizeHtml('<p style="color:red">x</p>');
    expect(out).not.toContain('style=');
    expect(out).toContain('x');
  });

  it('style 要素を中身ごと除去する', () => {
    const out = sanitizeHtml('<style>body{display:none}</style><p>x</p>');
    expect(out).not.toContain('display:none');
  });

  it('form / input を除去する', () => {
    const out = sanitizeHtml(
      '<form action="https://evil.example.com"><input name="a"></form><p>x</p>'
    );
    expect(out).not.toContain('<form');
    expect(out).not.toContain('<input');
  });

  it('HTML コメントを除去する（Word 由来の断片マーカー等）', () => {
    const out = sanitizeHtml('<p>x</p><!-- secret -->');
    expect(out).not.toContain('secret');
  });
});

// ─────────────────────────────────────────────────────────────
// 陰性対照: 安全な HTML が保持されること
// ─────────────────────────────────────────────────────────────
describe('sanitizeHtml — 陰性対照（安全な HTML の保持）', () => {
  it('基本的な書式タグを保持する', () => {
    const input = '<p><strong>太字</strong>と<em>斜体</em></p>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('テーブル構造を保持する', () => {
    const input = '<table><tbody><tr><td colspan="2">cell</td></tr></tbody></table>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('https リンクと画像を保持する', () => {
    const out = sanitizeHtml(
      '<a href="https://example.com/">link</a><img src="https://example.com/a.png" alt="x">'
    );
    expect(out).toContain('href="https://example.com/"');
    expect(out).toContain('src="https://example.com/a.png"');
    expect(out).toContain('alt="x"');
  });

  it('data:image/ の img src を保持する', () => {
    const input = '<img src="data:image/png;base64,iVBORw0KGgo=" alt="dot">';
    expect(sanitizeHtml(input)).toContain('data:image/png;base64');
  });

  it('許可リスト外の無害タグは unwrap して子要素を残す', () => {
    const out = sanitizeHtml('<article><p>本文</p></article>');
    expect(out).not.toContain('<article');
    expect(out).toContain('<p>本文</p>');
  });

  it('テキストノードを保持する', () => {
    expect(sanitizeHtml('plain text')).toBe('plain text');
  });
});
