// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { colors } from '@/utils/styles';

afterEach(() => {
  cleanup();
});

describe('DownloadButton', () => {
  it('label をボタンの可視テキストとして描画する', () => {
    render(<DownloadButton onClick={() => {}} label="SVGダウンロード" />);
    expect(screen.getByText('SVGダウンロード')).toBeTruthy();
  });

  it('onClick が呼ばれる', () => {
    const handler = vi.fn();
    render(<DownloadButton onClick={handler} label="DL" />);
    fireEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('disabled=true で disabled 属性が付き onClick が呼ばれない', () => {
    const handler = vi.fn();
    render(<DownloadButton onClick={handler} label="DL" disabled />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(handler).not.toHaveBeenCalled();
  });

  it('loading=true で aria-busy="true" が付与され disabled 状態になる', () => {
    render(<DownloadButton onClick={() => {}} label="DL" loading />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBe(true);
  });

  it('loading=false (default) で aria-busy が付与されない', () => {
    render(<DownloadButton onClick={() => {}} label="DL" />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBeNull();
  });

  it('aria-label を上書きできる', () => {
    render(<DownloadButton onClick={() => {}} label="DL" aria-label="ファイルをダウンロード" />);
    expect(screen.getByRole('button', { name: 'ファイルをダウンロード' })).toBeTruthy();
  });

  it('aria-label 未指定時は label が aria 名になる', () => {
    render(<DownloadButton onClick={() => {}} label="SVGダウンロード" />);
    expect(screen.getByRole('button', { name: 'SVGダウンロード' })).toBeTruthy();
  });

  it('variant="primary" (default) は primary 色背景・primary 文字色 (textOnPrimary)', () => {
    render(<DownloadButton onClick={() => {}} label="DL" />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    // jsdom は background shorthand に var(...) を含む値を backgroundColor へ分解しないため
    // shorthand プロパティを直接比較する (Task 1 の border 同様の jsdom 制約)
    expect(btn.style.background).toBe(colors.primary);
    expect(btn.style.color).toBe(colors.textOnPrimary);
  });

  it('variant="secondary" は透過背景・primary 文字色', () => {
    render(<DownloadButton onClick={() => {}} label="DL" variant="secondary" />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.style.backgroundColor).toBe('transparent');
    expect(btn.style.color).toBe(colors.primary);
  });

  it('ダウンロードアイコン (svg, aria-hidden) が描画される', () => {
    const { container } = render(<DownloadButton onClick={() => {}} label="DL" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('variant="primary" + disabled は bg-subtle 塗り・border 不可視を維持', () => {
    render(<DownloadButton onClick={() => {}} label="DL" disabled />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    // jsdom は background shorthand に var(...) を含む値を backgroundColor へ分解しないため shorthand を直接比較
    expect(btn.style.background).toBe(colors.bgSubtle);
    expect(btn.style.border).toBe(`1px solid ${colors.bgSubtle}`);
  });

  it('variant="secondary" + disabled は背景透過・グレーボーダーを維持', () => {
    render(<DownloadButton onClick={() => {}} label="DL" variant="secondary" disabled />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.style.backgroundColor).toBe('transparent');
    expect(btn.style.border).toBe(`1px solid ${colors.border}`);
  });
});
