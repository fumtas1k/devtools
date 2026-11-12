// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { ProgressBar } from '@/components/ui/ProgressBar';

// Constructable Stylesheets polyfill は src/test-setup.ts でグローバルに設定済み (重複排除)

beforeEach(() => {
  document.adoptedStyleSheets = [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.adoptedStyleSheets = [];
});

/** adoptedStyleSheets の全 cssText を結合して返す */
function adoptedCssText(): string {
  return Array.from(document.adoptedStyleSheets)
    .flatMap((s) => Array.from(s.cssRules).map((r) => r.cssText))
    .join('\n');
}

describe('ProgressBar', () => {
  it('対応環境では mount と再描画でシートを生成しない', () => {
    const supports = vi.fn().mockReturnValue(true);
    vi.stubGlobal('CSS', { supports });
    const original = globalThis.CSSStyleSheet;
    const constructor = vi.fn(function () {
      return new original();
    });
    vi.stubGlobal('CSSStyleSheet', constructor);
    const { rerender } = render(<ProgressBar current={50} max={100} />);
    rerender(<ProgressBar current={150} max={100} />);
    expect(supports).toHaveBeenCalledWith(
      'width',
      'attr(data-progress-width type(<percentage>), 0%)'
    );
    expect(constructor).not.toHaveBeenCalled();
    expect(document.adoptedStyleSheets).toHaveLength(0);
    expect(
      screen
        .getByRole('progressbar')
        .querySelector('.progress-overflow')
        ?.getAttribute('data-progress-width')
    ).toBe('50%');
  });

  it.each([false, undefined])(
    '未対応または検出不可 (%s) では既存シートを再利用し cleanup する',
    (supported) => {
      vi.stubGlobal('CSS', supported === undefined ? undefined : { supports: () => supported });
      const { rerender, unmount } = render(<ProgressBar current={25} max={100} />);
      const sheet = document.adoptedStyleSheets[0];
      expect(adoptedCssText()).toContain('--progress-fill-width: 25%');
      rerender(<ProgressBar current={150} max={100} />);
      expect(document.adoptedStyleSheets).toHaveLength(1);
      expect(document.adoptedStyleSheets[0]).toBe(sheet);
      expect(adoptedCssText()).toContain('--progress-overflow-width: 50%');
      unmount();
      expect(document.adoptedStyleSheets).toHaveLength(0);
    }
  );

  it.each([
    [0, 100, '0%'],
    [1, 3, '33.33333333333333%'],
    [100, 100, '100%'],
    [150, 100, '100%'],
  ])('幅属性 %s / %s', (current, max, width) => {
    const { container } = render(<ProgressBar current={current} max={max} />);
    expect(container.querySelector('.progress-fill')?.getAttribute('data-progress-width')).toBe(
      width
    );
  });

  it('SSR でも同じ幅属性と ARIA を出力する', () => {
    const html = renderToString(<ProgressBar current={150} max={100} aria-describedby="desc-x" />);
    const { container } = render(<ProgressBar current={150} max={100} aria-describedby="desc-x" />);
    expect(container.innerHTML.replace(/dyn-[^" ]+/, 'dyn-id')).toBe(
      html.replace(/dyn-[^" ]+/, 'dyn-id')
    );
    expect(html).toContain('data-progress-width="100%"');
    expect(html).toContain('data-progress-width="50%"');
  });

  it.each([NaN, -Infinity])('非有限の計算幅 %s は対応環境でも従来ルールを使う', (current) => {
    vi.stubGlobal('CSS', { supports: () => true });
    render(<ProgressBar current={current} max={100} />);
    expect(adoptedCssText()).toContain(`--progress-fill-width: ${current}%`);
  });

  it('CSS.supports がない場合も従来ルールを使う', () => {
    vi.stubGlobal('CSS', {});
    render(<ProgressBar current={50} max={100} />);
    expect(adoptedCssText()).toContain('--progress-fill-width: 50%');
  });
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

  it('負の max でも描画とシート生成をしない', () => {
    render(<ProgressBar current={1} max={-1} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(document.adoptedStyleSheets).toHaveLength(0);
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
    vi.stubGlobal('CSS', { supports: () => false });
    render(<ProgressBar current={50} max={100} />);
    const css = adoptedCssText();
    expect(css).toContain('--progress-fill-width: 50%');
  });

  it('current === max (ぴったり 100%): progress-fill は 100%、overflow なし', () => {
    vi.stubGlobal('CSS', { supports: () => false });
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
    vi.stubGlobal('CSS', { supports: () => false });
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
