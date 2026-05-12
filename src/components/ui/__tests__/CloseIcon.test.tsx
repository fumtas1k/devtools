// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { CloseIcon } from '@/components/ui/CloseIcon';

afterEach(() => cleanup());

describe('CloseIcon', () => {
  it('2 本の line で X を描画', () => {
    const { container } = render(<CloseIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.querySelectorAll('line').length).toBe(2);
  });

  it('aria-hidden="true" を持ち装飾扱いになる', () => {
    const { container } = render(<CloseIcon />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('stroke は currentColor で呼び出し側の text-* で着色できる', () => {
    const { container } = render(<CloseIcon />);
    expect(container.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor');
  });

  it('size prop で width/height を上書きできる (default 16, 指定 20)', () => {
    const { container, rerender } = render(<CloseIcon />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('16');
    rerender(<CloseIcon size={20} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('20');
    expect(container.querySelector('svg')?.getAttribute('height')).toBe('20');
  });

  it('className prop が base class に追記される', () => {
    const { container } = render(<CloseIcon className="custom-cls" />);
    const cls = container.querySelector('svg')?.getAttribute('class') ?? '';
    expect(cls).toContain('inline-block');
    expect(cls).toContain('align-middle');
    expect(cls).toContain('custom-cls');
  });
});
