// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { ProgressBar } from '@/components/ui/ProgressBar';

// Constructable Stylesheets polyfill は src/test-setup.ts でグローバルに設定済み (重複排除)

beforeEach(() => {
  document.adoptedStyleSheets = [];
});

afterEach(() => {
  cleanup();
  document.adoptedStyleSheets = [];
});

/** adoptedStyleSheets の全 cssText を結合して返す */
function adoptedCssText(): string {
  return Array.from(document.adoptedStyleSheets)
    .flatMap((s) => Array.from(s.cssRules).map((r) => r.cssText))
    .join('\n');
}

describe('ProgressBar', () => {
  it('role="progressbar" を持つ', () => {
    render(<ProgressBar current={50} max={100} />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('100% 未満時: aria-valuenow=current, valuemin=0, valuemax=max', () => {
    render(<ProgressBar current={50} max={100} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('100% 超時: aria-valuenow は max で clamp される', () => {
    render(<ProgressBar current={150} max={100} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
  });

  it('100% 超時: aria-valuetext で実数値と「上限超過」を通知', () => {
    render(<ProgressBar current={150} max={100} />);
    const bar = screen.getByRole('progressbar');
    const valuetext = bar.getAttribute('aria-valuetext') ?? '';
    expect(valuetext).toContain('150');
    expect(valuetext).toMatch(/超過|over/i);
  });

  it('max=0 / current=0 では progressbar を描画しない (任意上限の空欄想定)', () => {
    render(<ProgressBar current={0} max={0} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('100% 超時: progress-overflow セグメントを描画する', () => {
    const { container } = render(<ProgressBar current={150} max={100} />);
    expect(container.querySelector('.progress-overflow')).toBeTruthy();
  });

  it('100% 未満時: progress-overflow セグメントは描画しない', () => {
    const { container } = render(<ProgressBar current={50} max={100} />);
    expect(container.querySelector('.progress-overflow')).toBeNull();
  });

  it('progress-fill の --progress-fill-width は current/max * 100% (clamped)', () => {
    render(<ProgressBar current={50} max={100} />);
    const css = adoptedCssText();
    expect(css).toContain('--progress-fill-width: 50%');
  });

  it('current === max (ぴったり 100%): progress-fill は 100%、overflow なし', () => {
    const { container } = render(<ProgressBar current={100} max={100} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    // overflow セグメントは描画されない
    expect(container.querySelector('.progress-overflow')).toBeNull();
    // fill は 100%
    const css = adoptedCssText();
    expect(css).toContain('--progress-fill-width: 100%');
  });

  it('100% 超時: progress-fill は 100%、progress-overflow は超過率 (clamp 100%)', () => {
    render(<ProgressBar current={150} max={100} />);
    const css = adoptedCssText();
    expect(css).toContain('--progress-fill-width: 100%');
    expect(css).toContain('--progress-overflow-width: 50%'); // (150-100)/100 = 50%
  });

  it('aria-describedby を伝播する', () => {
    render(<ProgressBar current={50} max={100} aria-describedby="desc-x" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-describedby')).toBe('desc-x');
  });
});
