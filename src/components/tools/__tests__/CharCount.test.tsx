// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, fireEvent, screen } from '@testing-library/react';

vi.mock('@/utils/char-count', async () => {
  const actual = await vi.importActual<typeof import('@/utils/char-count')>('@/utils/char-count');
  return { ...actual, count: vi.fn(actual.count) };
});

import { CharCountTool } from '@/components/tools/CharCount';
import { count } from '@/utils/char-count';

const DEBOUNCE_MS = 100;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(count).mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CharCountTool — 基本レイアウト', () => {
  it('入力テキスト textarea が表示される', () => {
    render(<CharCountTool />);
    expect(screen.getByLabelText('入力テキスト')).toBeTruthy();
  });

  it('5 セクションのタイトルが表示される', () => {
    render(<CharCountTool />);
    expect(screen.getByText('文字数')).toBeTruthy();
    expect(screen.getByText('エンコーディング互換性')).toBeTruthy();
    expect(screen.getByText('行')).toBeTruthy();
    expect(screen.getByText('SNS')).toBeTruthy();
    expect(screen.getByText('原稿')).toBeTruthy();
  });

  it('クリアボタンが表示される', () => {
    render(<CharCountTool />);
    expect(screen.getByRole('button', { name: 'クリア' })).toBeTruthy();
  });
});

describe('CharCountTool — debounce', () => {
  it('入力後 100ms 経過前は count() が呼ばれない', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: 'abc' } });
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    // 初期空文字の 1 回のみ (mount 時)
    expect(vi.mocked(count).mock.calls.filter((c) => c[0] === 'abc')).toHaveLength(0);
  });

  it('入力後 100ms 経過後に count() が呼ばれる', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: 'abc' } });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(vi.mocked(count).mock.calls.some((c) => c[0] === 'abc')).toBe(true);
  });
});

describe('CharCountTool — 結果表示', () => {
  it('"あいう" 入力後に書記素 3 が表示される', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: 'あいう' } });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    // 書記素・codePoints 等複数セルが "3" になるため getAllByText を使用
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('"😀" 入力後に utf8mb3 が ❌ と表示される (DB 互換性 core value)', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: '😀' } });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    // utf8mb3 行が不可表示 (❌ または「不可」を含むテキスト)
    const notOkElements = screen.queryAllByText(/❌|不可/);
    expect(notOkElements.length).toBeGreaterThan(0);
  });

  it('クリアボタンでテキストが消える', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: 'hello' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'クリア' }));
    });
    expect((textarea as HTMLTextAreaElement).value).toBe('');
  });
});

describe('CharCountTool — SNS 任意上限', () => {
  it('任意上限入力欄がデフォルト 280 で表示される', () => {
    render(<CharCountTool />);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    const limitInput = screen.getByLabelText('任意上限') as HTMLInputElement;
    expect(limitInput.value).toBe('280');
  });

  it('上限を 100 に変更すると入力欄に反映され、文字数が任意上限行に表示される', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: 'hello' } }); // 書記素 5
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    const limitInput = screen.getByLabelText('任意上限') as HTMLInputElement;
    act(() => {
      fireEvent.change(limitInput, { target: { value: '100' } });
    });
    expect(limitInput.value).toBe('100');
    // 「残り」表示は廃止 (Twitter/Bluesky と同じく count / limit のみ)
    // 任意上限行の count 部分に 5 が表示される (他セルにも 5 はあり得るので getAllByText)
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
  });
});
