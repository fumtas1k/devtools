// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { OutputField } from '@/components/ui/OutputField';

afterEach(() => {
  cleanup();
});

describe('OutputField a11y contract', () => {
  it('role="status" のラッパーが textarea を内包する', () => {
    const { container } = render(<OutputField id="out" label="変換結果" value="Hello" />);
    const statusWrapper = container.querySelector('[role="status"]');
    expect(statusWrapper).not.toBeNull();
    const textareaInside = statusWrapper!.querySelector('textarea');
    expect(textareaInside).not.toBeNull();
  });

  it('aria-live="polite" が value="" でも常時存在する（off↔polite regression 検知）', () => {
    const { container } = render(<OutputField id="out" label="変換結果" value="" />);
    const statusWrapper = container.querySelector('[role="status"]');
    expect(statusWrapper).not.toBeNull();
    expect(statusWrapper!.getAttribute('aria-live')).toBe('polite');
  });

  it('aria-live="polite" が value 非空でも変わらない', () => {
    const { container } = render(<OutputField id="out" label="変換結果" value="SGVsbG8=" />);
    const statusWrapper = container.querySelector('[role="status"]');
    expect(statusWrapper!.getAttribute('aria-live')).toBe('polite');
  });

  it('aria-atomic="false" が明示されている（SR の atomic 読み上げ抑制）', () => {
    const { container } = render(<OutputField id="out" label="変換結果" value="Hello" />);
    const statusWrapper = container.querySelector('[role="status"]');
    expect(statusWrapper!.getAttribute('aria-atomic')).toBe('false');
  });

  it('role="status" が label/CopyButton を含む外側 div に付いていない', () => {
    const { container } = render(<OutputField id="out" label="変換結果" value="Hello" />);
    const outerDiv = container.firstElementChild;
    expect(outerDiv?.getAttribute('role')).not.toBe('status');
  });

  it('value 変化が textarea に反映される', () => {
    render(<OutputField id="out" label="変換結果" value="SGVsbG8=" />);
    const textarea = screen.getByLabelText('変換結果') as HTMLTextAreaElement;
    expect(textarea.value).toBe('SGVsbG8=');
  });

  it('value が空のとき CopyButton を表示しない', () => {
    render(<OutputField id="out" label="変換結果" value="" />);
    expect(screen.queryByRole('button', { name: 'コピー' })).toBeNull();
  });

  it('value が非空のとき CopyButton を表示する', () => {
    render(<OutputField id="out" label="変換結果" value="Hello" />);
    expect(screen.getByRole('button', { name: 'コピー' })).toBeTruthy();
  });
});
