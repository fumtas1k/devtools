// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RemoveButton } from '@/components/ui/RemoveButton';

afterEach(() => cleanup());

describe('RemoveButton', () => {
  it('type="button" で、label が accessible name になる', () => {
    render(<RemoveButton label="SAN 2 を削除" onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'SAN 2 を削除' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('SAN 2 を削除');
  });

  it('可視テキストを持たず、アイコン (svg) は aria-hidden', () => {
    render(<RemoveButton label="行 1 を削除" onClick={() => {}} />);
    const button = screen.getByRole('button', { name: '行 1 を削除' });
    expect(button.textContent).toBe('');
    const svg = button.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('width')).toBe('20');
  });

  it('クリックで onClick が呼ばれる', () => {
    const onClick = vi.fn();
    render(<RemoveButton label="削除" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled のときは disabled 属性が付き、クリックしても onClick は呼ばれない', () => {
    const onClick = vi.fn();
    render(<RemoveButton label="削除" onClick={onClick} disabled />);
    const button = screen.getByRole('button', { name: '削除' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled を渡さなければ有効', () => {
    render(<RemoveButton label="削除" onClick={() => {}} />);
    expect((screen.getByRole('button', { name: '削除' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('btn-remove class を持ち、className を追加できる', () => {
    render(<RemoveButton label="削除" onClick={() => {}} className="shrink-0" />);
    const button = screen.getByRole('button', { name: '削除' });
    expect(button.classList.contains('btn-remove')).toBe(true);
    expect(button.classList.contains('shrink-0')).toBe(true);
  });
});
