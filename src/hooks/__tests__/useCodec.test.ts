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

// ────────────────────────────────────────────
// useCodec — 空入力で debounce 待たず即時クリアされる（リグレッション保護: PR #149）
// ────────────────────────────────────────────
describe('useCodec — 空入力で debounce 待たず即時クリアされる', () => {
  it('空入力 ("") を渡すと output / error / isPending が即時クリアされる', async () => {
    const transform = vi.fn((s: string) => s.toUpperCase());
    const { result } = renderHook(() => useCodec(transform, [], { debounceMs: DEBOUNCE_MS }));

    // 一度値を入れて変換まで完了させる
    act(() => {
      result.current.setInput('hello');
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.output).toBe('HELLO');
    transform.mockClear();

    // 空文字列に戻す → debounce を進めなくても即時で output / isPending がクリアされる
    act(() => {
      result.current.setInput('');
    });

    expect(result.current.output).toBe('');
    expect(result.current.error).toBe('');
    expect(result.current.isPending).toBe(false);
    // 空入力時は transform が呼ばれない
    expect(transform).not.toHaveBeenCalled();
  });

  it('一度エラーが発生した後でも空入力で error がクリアされる', async () => {
    const transform = vi.fn((s: string) => {
      if (s === 'bad') throw new Error('変換エラー');
      return s.toUpperCase();
    });
    const { result } = renderHook(() => useCodec(transform, [], { debounceMs: DEBOUNCE_MS }));

    // エラーを発生させる
    act(() => {
      result.current.setInput('bad');
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.error).toBe('変換エラー');

    // 空入力で error が即時クリアされる
    act(() => {
      result.current.setInput('');
    });
    expect(result.current.error).toBe('');
  });
});

// ────────────────────────────────────────────
// useCodec — debounce 中の再入力で前回がキャンセルされる（リグレッション保護: PR #149）
// ────────────────────────────────────────────
describe('useCodec — debounce 中の再入力で前回がキャンセルされる', () => {
  it('debounce 完了前に setInput を再度呼ぶと、前回 schedule された変換は走らず最後の入力にだけ transform が走る', async () => {
    const transform = vi.fn((s: string) => s.toUpperCase());
    const { result } = renderHook(() => useCodec(transform, [], { debounceMs: DEBOUNCE_MS }));

    // 1 回目の入力
    act(() => {
      result.current.setInput('first');
    });

    // debounce 半分だけ進めて、まだ変換は走らない状態で
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS / 2);
    });
    expect(transform).not.toHaveBeenCalled();

    // 2 回目の入力（前回 schedule をキャンセル）
    act(() => {
      result.current.setInput('second');
    });

    // 半分しか進めない → まだ変換は走らない
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS / 2);
    });
    expect(transform).not.toHaveBeenCalled();

    // 残り半分を進めると 2 回目入力に対してだけ変換が走る
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS / 2);
    });

    expect(transform).toHaveBeenCalledTimes(1);
    expect(transform).toHaveBeenCalledWith('second');
    expect(result.current.output).toBe('SECOND');
  });

  it('連続して 3 回 setInput しても transform は最後の入力にだけ 1 回だけ走る', async () => {
    const transform = vi.fn((s: string) => s.toUpperCase());
    const { result } = renderHook(() => useCodec(transform, [], { debounceMs: DEBOUNCE_MS }));

    act(() => {
      result.current.setInput('a');
    });
    act(() => {
      result.current.setInput('ab');
    });
    act(() => {
      result.current.setInput('abc');
    });

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(transform).toHaveBeenCalledTimes(1);
    expect(transform).toHaveBeenCalledWith('abc');
    expect(result.current.output).toBe('ABC');
  });
});

// ────────────────────────────────────────────
// useCodec — throw 後の recover
// ────────────────────────────────────────────
describe('useCodec — transform が throw した後でも後続の入力で recover できる', () => {
  it('throw → 正常入力 で error がクリアされ output が更新される', async () => {
    const transform = vi.fn((s: string) => {
      if (s === 'bad') throw new Error('変換エラー');
      return s.toUpperCase();
    });
    const { result } = renderHook(() => useCodec(transform, [], { debounceMs: DEBOUNCE_MS }));

    // エラー発生
    act(() => {
      result.current.setInput('bad');
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.error).toBe('変換エラー');
    expect(result.current.output).toBe('');

    // 後続の正常入力で recover
    act(() => {
      result.current.setInput('good');
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(result.current.error).toBe('');
    expect(result.current.output).toBe('GOOD');
  });
});
