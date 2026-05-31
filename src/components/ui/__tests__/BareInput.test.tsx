// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { BareInput } from '@/components/ui/BareInput';

afterEach(() => {
  cleanup();
});

describe('BareInput', () => {
  it('value を表示する', () => {
    render(<BareInput value="テスト値" onChange={() => {}} aria-label="テスト" />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('テスト値');
  });

  it('onChange が変更された値を渡す', () => {
    const handler = vi.fn();
    render(<BareInput value="" onChange={handler} aria-label="テスト" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '新しい値' } });
    expect(handler).toHaveBeenCalledWith('新しい値');
  });

  it('type prop を渡せる', () => {
    render(<BareInput value="" onChange={() => {}} type="number" aria-label="数値" />);
    // spinbutton role は type="number" のとき
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.type).toBe('number');
  });

  it('placeholder prop を渡せる', () => {
    render(
      <BareInput value="" onChange={() => {}} placeholder="入力してください" aria-label="テスト" />
    );
    expect(screen.getByPlaceholderText('入力してください')).toBeTruthy();
  });

  it('disabled prop を渡せる', () => {
    render(<BareInput value="" onChange={() => {}} disabled aria-label="無効" />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('mono=true のとき monospace フォントが設定される', () => {
    // jsdom は @layer components CSS を解釈しないため className で検証（視覚確認は VRT/E2E 委譲）
    render(<BareInput value="" onChange={() => {}} mono aria-label="mono" />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.className).toContain('font-mono');
  });

  it('className prop を渡せる', () => {
    render(<BareInput value="" onChange={() => {}} className="flex-1" aria-label="テスト" />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('flex-1');
  });

  it('aria-label を渡せる', () => {
    render(<BareInput value="" onChange={() => {}} aria-label="チケットID 1" />);
    expect(screen.getByRole('textbox', { name: 'チケットID 1' })).toBeTruthy();
  });

  it('autoComplete を input に透過する', () => {
    render(<BareInput value="" onChange={() => {}} autoComplete="off" aria-label="テスト" />);
    const input = screen.getByLabelText('テスト') as HTMLInputElement;
    expect(input.getAttribute('autocomplete')).toBe('off');
  });
});
