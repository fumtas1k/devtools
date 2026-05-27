// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RegexVisualizer } from '../RegexVisualizer';

afterEach(() => {
  cleanup();
});

// 解析ユーティリティ（regexp-tree / recheck）は client mount 後に動的 import されるため、
// fake timers ではなく実時間 + 非同期 findBy* で「動的 import 完了 → debounce(300ms) → 解析反映」
// を待つ（timeout は余裕を持たせる）。
const FIND = { timeout: 3000 } as const;

function setPattern(value: string) {
  fireEvent.change(screen.getByLabelText('正規表現'), { target: { value } });
}

describe('RegexVisualizer', () => {
  it('有効な正規表現を入力すると AST ラベルが表示される', async () => {
    render(<RegexVisualizer />);
    setPattern('a+');
    expect(await screen.findByText(/1 回以上の繰り返し/, undefined, FIND)).toBeTruthy();
  });

  it('不正な正規表現でエラーを表示する', async () => {
    render(<RegexVisualizer />);
    setPattern('(');
    const alerts = await screen.findAllByRole('alert', undefined, FIND);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('脆弱な正規表現で危険判定を表示する', async () => {
    render(<RegexVisualizer />);
    setPattern('(a+)+$');
    expect(await screen.findByText(/脆弱/, undefined, FIND)).toBeTruthy();
  });

  it('安全な正規表現で安全判定を表示する', async () => {
    render(<RegexVisualizer />);
    setPattern('^[a-z]+$');
    expect(await screen.findByText(/安全/, undefined, FIND)).toBeTruthy();
  });
});
