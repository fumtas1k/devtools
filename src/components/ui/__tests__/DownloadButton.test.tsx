// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { DownloadButton } from '@/components/ui/DownloadButton';

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

  it('variant="primary" (default) は btn-action--primary クラスを持つ', () => {
    render(<DownloadButton onClick={() => {}} label="DL" />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.className).toContain('btn-action--primary');
    expect(btn.className).toContain('btn-action');
    // 実際の背景色・文字色は CSS :root 変数で決まるため視覚検証は E2E/VRT に委ねる
  });

  it('variant="secondary" は btn-action--secondary クラスを持つ', () => {
    render(<DownloadButton onClick={() => {}} label="DL" variant="secondary" />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.className).toContain('btn-action--secondary');
  });

  it('ダウンロードアイコン (svg, aria-hidden) が描画される', () => {
    const { container } = render(<DownloadButton onClick={() => {}} label="DL" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('variant="primary" + disabled は disabled 属性と btn-action--primary クラスを持つ', () => {
    render(<DownloadButton onClick={() => {}} label="DL" disabled />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.className).toContain('btn-action--primary');
    // CSS :disabled 擬似クラスで bg/border を上書き（スタイル検証は E2E/VRT に委ねる）
  });

  it('variant="secondary" + disabled は disabled 属性と btn-action--secondary クラスを持つ', () => {
    render(<DownloadButton onClick={() => {}} label="DL" variant="secondary" disabled />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.className).toContain('btn-action--secondary');
  });
});
