// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { formatXml } from '@/utils/saml';

describe('formatXml', () => {
  it('1 行 XML をインデント付きに整形する', () => {
    const out = formatXml('<a xmlns="urn:x"><b attr="1">v</b><c/></a>');
    expect(out).toBe(['<a xmlns="urn:x">', '  <b attr="1">v</b>', '  <c/>', '</a>'].join('\n'));
  });

  it('XML 宣言を保持する', () => {
    const out = formatXml('<?xml version="1.0" encoding="UTF-8"?><a><b/></a>');
    expect(out.split('\n')[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it('テキストと属性をエスケープする', () => {
    const out = formatXml('<a attr="&quot;x&quot;">&lt;tag&gt; &amp; more</a>');
    expect(out).toBe('<a attr="&quot;x&quot;">&lt;tag&gt; &amp; more</a>');
  });

  it('parse 不能な入力はそのまま返す', () => {
    expect(formatXml('<broken')).toBe('<broken');
  });
});
