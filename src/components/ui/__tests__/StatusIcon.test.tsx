// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { StatusIcon } from '@/components/ui/StatusIcon';

afterEach(() => cleanup());

describe('StatusIcon', () => {
  it('success variant: polyline (チェックマーク) を描画', () => {
    const { container } = render(<StatusIcon variant="success" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.querySelector('polyline')).toBeTruthy();
    expect(svg?.querySelector('line')).toBeFalsy();
    expect(svg?.querySelector('circle')).toBeFalsy();
  });

  it('error variant: 2 本の line (X) を描画', () => {
    const { container } = render(<StatusIcon variant="error" />);
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('line').length).toBe(2);
    expect(svg?.querySelector('polyline')).toBeFalsy();
  });

  it('warning variant: triangle (path) + 縦 line + 底辺の circle ドットを描画', () => {
    const { container } = render(<StatusIcon variant="warning" />);
    const svg = container.querySelector('svg');
    expect(svg?.querySelector('path')).toBeTruthy();
    expect(svg?.querySelector('line')).toBeTruthy();
    // PR #407 review #1: degenerate line (0 長) ではなく <circle> でドットを描く
    const circle = svg?.querySelector('circle');
    expect(circle).toBeTruthy();
    expect(circle?.getAttribute('fill')).toBe('currentColor');
  });

  it('aria-hidden="true" を持ち装飾扱いになる', () => {
    const { container } = render(<StatusIcon variant="success" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('stroke は currentColor で呼び出し側の text-* で着色できる', () => {
    const { container } = render(<StatusIcon variant="error" />);
    expect(container.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor');
  });

  it('size prop で width/height を上書きできる (default 16, 指定 24)', () => {
    const { container, rerender } = render(<StatusIcon variant="success" />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('16');
    rerender(<StatusIcon variant="success" size={24} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('24');
    expect(container.querySelector('svg')?.getAttribute('height')).toBe('24');
  });

  it('className prop が base class に追記される', () => {
    const { container } = render(<StatusIcon variant="success" className="custom-cls" />);
    const cls = container.querySelector('svg')?.getAttribute('class') ?? '';
    expect(cls).toContain('inline-block');
    expect(cls).toContain('align-middle');
    expect(cls).toContain('custom-cls');
  });
});
