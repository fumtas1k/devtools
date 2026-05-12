// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ChevronIcon } from '@/components/ui/ChevronIcon';

afterEach(() => cleanup());

describe('ChevronIcon', () => {
  it('polyline (chevron-down) を描画', () => {
    const { container } = render(<ChevronIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.querySelector('polyline')).toBeTruthy();
  });

  it('aria-hidden="true" を持ち装飾扱いになる', () => {
    const { container } = render(<ChevronIcon />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('stroke は currentColor で呼び出し側の text-* で着色できる', () => {
    const { container } = render(<ChevronIcon />);
    expect(container.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor');
  });

  it('open=true で rotate-180 class が付与される (上向き ▲)', () => {
    const { container } = render(<ChevronIcon open />);
    const cls = container.querySelector('svg')?.getAttribute('class') ?? '';
    expect(cls).toContain('rotate-180');
    expect(cls).toContain('transition-transform');
  });

  it('open=false (default) で rotate-180 class が付かない (下向き ▼)', () => {
    const { container } = render(<ChevronIcon />);
    const cls = container.querySelector('svg')?.getAttribute('class') ?? '';
    expect(cls).not.toContain('rotate-180');
    expect(cls).toContain('transition-transform');
  });

  it('size prop で width/height を上書きできる (default 14, 指定 20)', () => {
    const { container, rerender } = render(<ChevronIcon />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('14');
    rerender(<ChevronIcon size={20} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('20');
    expect(container.querySelector('svg')?.getAttribute('height')).toBe('20');
  });

  it('className prop が base class に追記される', () => {
    const { container } = render(<ChevronIcon className="custom-cls" />);
    const cls = container.querySelector('svg')?.getAttribute('class') ?? '';
    expect(cls).toContain('inline-block');
    expect(cls).toContain('align-middle');
    expect(cls).toContain('custom-cls');
  });
});
