// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCodec } from '@/hooks/useCodec';

// ────────────────────────────────────────────
// useCodec — isPending 挙動
// ────────────────────────────────────────────

const DEBOUNCE_MS = 300;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCodec — input 入力中に isPending が true になる', () => {
  it('input を設定した直後は isPending が true になる', () => {
    const transform = vi.fn((s: string) => s.toUpperCase());
    const { result } = renderHook(() => useCodec(transform, [], { debounceMs: DEBOUNCE_MS }));

    act(() => {
      result.current.setInput('hello');
    });

    expect(result.current.isPending).toBe(true);
  });

  it('デバウンス完了後は isPending が false になる', async () => {
    const transform = vi.fn((s: string) => s.toUpperCase());
    const { result } = renderHook(() => useCodec(transform, [], { debounceMs: DEBOUNCE_MS }));

    act(() => {
      result.current.setInput('hello');
    });
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.output).toBe('HELLO');
  });
});

describe('useCodec — deps 変更後に isPending が true になる', () => {
  it('deps が変化したとき isPending が true になる', () => {
    let mode = 'a';
    const transform = vi.fn((s: string) => `${mode}:${s}`);
    const { result, rerender } = renderHook(
      ({ m }: { m: string }) => useCodec(transform, [m], { debounceMs: DEBOUNCE_MS }),
      { initialProps: { m: mode } }
    );

    // input を設定してデバウンスを完了させる
    act(() => {
      result.current.setInput('test');
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.isPending).toBe(false);

    // deps（mode）を変更すると isPending が true に戻る
    mode = 'b';
    rerender({ m: mode });

    expect(result.current.isPending).toBe(true);
  });
});

describe('useCodec — デバウンス完了後に isPending が false になる', () => {
  it('デバウンス時間経過後に isPending が false になり output が更新される', async () => {
    const transform = vi.fn((s: string) => s.toLowerCase());
    const { result } = renderHook(() => useCodec(transform, [], { debounceMs: DEBOUNCE_MS }));

    act(() => {
      result.current.setInput('WORLD');
    });
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.output).toBe('world');
  });
});

describe('useCodec — reset() 後に isPending が false になる', () => {
  it('reset() を呼び出すと isPending が即座に false になる', () => {
    const transform = vi.fn((s: string) => s.toUpperCase());
    const { result } = renderHook(() => useCodec(transform, [], { debounceMs: DEBOUNCE_MS }));

    act(() => {
      result.current.setInput('hello');
    });
    expect(result.current.isPending).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.input).toBe('');
    expect(result.current.output).toBe('');
  });
});

describe('useCodec — transform が throw しても isPending が false に戻る（finally 経由）', () => {
  it('transform が throw しても finally で isPending が false に戻る', async () => {
    const transform = vi.fn(() => {
      throw new Error('変換エラー');
    });
    const { result } = renderHook(() => useCodec(transform, [], { debounceMs: DEBOUNCE_MS }));

    act(() => {
      result.current.setInput('bad input');
    });
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBe('変換エラー');
    expect(result.current.output).toBe('');
  });
});
