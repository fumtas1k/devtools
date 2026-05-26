// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { RegexVisualizer } from '../RegexVisualizer';

// useDebouncedTransform のデフォルト debounce は 300ms
const DEBOUNCE_MS = 300;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** 入力欄に値をセットし debounce を flush する */
function typeAndFlush(input: HTMLElement, value: string) {
  act(() => {
    fireEvent.change(input, { target: { value } });
  });
  act(() => {
    vi.advanceTimersByTime(DEBOUNCE_MS + 50);
  });
}

describe('RegexVisualizer', () => {
  it('有効な正規表現を入力すると AST ラベルが表示される', () => {
    render(<RegexVisualizer />);
    const input = screen.getByLabelText('正規表現');
    typeAndFlush(input, 'a+');
    expect(screen.getByText(/1 回以上の繰り返し/)).toBeTruthy();
  });

  it('不正な正規表現でエラーを表示する', () => {
    render(<RegexVisualizer />);
    const input = screen.getByLabelText('正規表現');
    typeAndFlush(input, '(');
    // InputField の inline エラーと構造ツリーの block エラーの 2 箇所に role="alert" が出る
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('脆弱な正規表現で危険判定を表示する', () => {
    render(<RegexVisualizer />);
    const input = screen.getByLabelText('正規表現');
    typeAndFlush(input, '(a+)+$');
    expect(screen.getByText(/脆弱/)).toBeTruthy();
  });

  it('安全な正規表現で安全判定を表示する', () => {
    render(<RegexVisualizer />);
    const input = screen.getByLabelText('正規表現');
    typeAndFlush(input, '^[a-z]+$');
    expect(screen.getByText(/安全/)).toBeTruthy();
  });
});
