// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createQrSvg } from '@/utils/qrcode';

// 生成器の SVG は図形だけで構成される。要素・属性が増えた場合は利用箇所の
// 信頼境界を再確認する。テキストや URL を受け付ける属性は許可しない。
function hasOnlyQrGeometry(svg: string): boolean {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') return false;
  const allowed: Record<string, string[]> = {
    svg: ['version', 'xmlns', 'viewBox', 'preserveAspectRatio'],
    rect: ['width', 'height', 'fill', 'cx', 'cy'],
    path: ['d', 'stroke', 'fill'],
  };
  const nodes = [root, ...root.querySelectorAll('*')];
  if (
    !nodes.every((node) => {
      const attributes = allowed[node.localName];
      return (
        node.namespaceURI === 'http://www.w3.org/2000/svg' &&
        attributes !== undefined &&
        [...node.attributes].every((attribute) => attributes.includes(attribute.name)) &&
        [...node.childNodes].every((child) => child.nodeType === Node.ELEMENT_NODE)
      );
    })
  )
    return false;
  if (nodes.map((node) => node.localName).join(',') !== 'svg,rect,path') return false;
  const [, rect, path] = nodes;
  return (
    root.getAttribute('version') === '1.1' &&
    /^0 0 \d+ \d+$/.test(root.getAttribute('viewBox') ?? '') &&
    root.getAttribute('preserveAspectRatio') === 'xMinYMin meet' &&
    rect.getAttribute('width') === '100%' &&
    rect.getAttribute('height') === '100%' &&
    rect.getAttribute('fill') === 'white' &&
    rect.getAttribute('cx') === '0' &&
    rect.getAttribute('cy') === '0' &&
    path.getAttribute('fill') === 'black' &&
    path.getAttribute('stroke') === 'transparent' &&
    /^[M lz\d,.-]+$/.test(path.getAttribute('d') ?? '')
  );
}

describe('QR SVG の信頼境界', () => {
  it('攻撃文字列は SVG 要素や属性にならず図形だけになる', () => {
    const payload = '</title><script>alert(1)</script><svg onload="alert(1)">&\'"';
    expect(hasOnlyQrGeometry(createQrSvg(payload, 'M'))).toBe(true);
  });

  it('陽性対照: 図形以外の要素やイベント属性を検出する', () => {
    const svg = createQrSvg('test', 'M');
    expect(hasOnlyQrGeometry(svg.replace('</svg>', '<script>alert(1)</script></svg>'))).toBe(false);
    expect(hasOnlyQrGeometry(svg.replace('<path ', '<path onload="alert(1)" '))).toBe(false);
    expect(
      hasOnlyQrGeometry(svg.replace('fill="black"', 'fill="url(https://example.com/x)"'))
    ).toBe(false);
  });
});
