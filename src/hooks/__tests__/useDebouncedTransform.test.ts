// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedTransform } from '@/hooks/useDebouncedTransform';

const DEBOUNCE_MS = 300;

// 安定参照の emptyResult 定数（モジュールスコープ）
const EMPTY_STRING = '';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ────────────────────────────────────────────
// ① immediate: true で同期実行される
// ────────────────────────────────────────────
describe('useDebouncedTransform — immediate: true で setTimeout なしに同期実行される', () => {
  it('source が非 null で immediate: true のとき debounce 待ちなしに result が反映される', () => {
    const transform = vi.fn((s: string) => s.toUpperCase());

    const { result } = renderHook(() =>
      useDebouncedTransform('hello', transform, EMPTY_STRING, [], { immediate: true })
    );

    // advanceTimers を呼ばずとも即時に result が反映されている
    expect(result.current.result).toBe('HELLO');
    expect(result.current.error).toBe('');
    expect(result.current.isPending).toBe(false);
    expect(transform).toHaveBeenCalledTimes(1);
  });

  it('source が更新されると再び同期実行される', () => {
    const transform = vi.fn((s: string) => s.toUpperCase());

    const { result, rerender } = renderHook(
      ({ src }: { src: string }) =>
        useDebouncedTransform(src, transform, EMPTY_STRING, [], { immediate: true }),
      { initialProps: { src: 'hello' } }
    );

    expect(result.current.result).toBe('HELLO');
    expect(transform).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ src: 'world' });
    });

    expect(result.current.result).toBe('WORLD');
    expect(transform).toHaveBeenCalledTimes(2);
  });
});

// ────────────────────────────────────────────
// ② debounce（300ms 後に反映）
// ────────────────────────────────────────────
describe('useDebouncedTransform — debounce 後に result が反映される', () => {
  it('source を渡した直後は result が emptyResult のまま、300ms 後に反映される', async () => {
    const transform = vi.fn((s: string) => s.toUpperCase());

    const { result } = renderHook(() =>
      useDebouncedTransform('hello', transform, EMPTY_STRING, [], { debounceMs: DEBOUNCE_MS })
    );

    // debounce 前は emptyResult のまま
    expect(result.current.result).toBe(EMPTY_STRING);
    expect(result.current.isPending).toBe(true);
    expect(transform).not.toHaveBeenCalled();

    // debounce 完了
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(result.current.result).toBe('HELLO');
    expect(result.current.isPending).toBe(false);
    expect(transform).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────
// ③ debounce 中の再入力で前回キャンセル（最後の 1 回だけ transform）
//
// test-gates 鉄則:
//   陰性対照（debounce 中は呼ばれない）と
//   陽性対照（clearTimeout を削除した実装に当てると fail する = 1回超呼ばれる）を分離。
// ────────────────────────────────────────────
describe('useDebouncedTransform — debounce 中の再入力で前回がキャンセルされる', () => {
  // 陰性対照: debounce 完了前は transform が呼ばれないことを確認
  it('[陰性] debounce 完了前は再入力後も transform が呼ばれていない', () => {
    const transform = vi.fn((s: string) => s.toUpperCase());

    const { rerender } = renderHook(
      ({ src }: { src: string }) =>
        useDebouncedTransform(src, transform, EMPTY_STRING, [], { debounceMs: DEBOUNCE_MS }),
      { initialProps: { src: 'first' } }
    );

    // debounce 半分だけ進める
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS / 2);
    });
    expect(transform).not.toHaveBeenCalled();

    // 2 回目の入力 → 前回タイマーをキャンセルして新しいタイマーをセット
    act(() => {
      rerender({ src: 'second' });
    });

    // 新しいタイマーの半分しか進めていない → まだ呼ばれない
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS / 2);
    });
    expect(transform).not.toHaveBeenCalled();
  });

  // 陽性対照: clearTimeout を削除した実装（キャンセルなし）に当てると
  // 'first' でも transform が呼ばれ toHaveBeenCalledTimes(1) が失敗する
  it('[陽性] debounce 完了後は最後の source に対して 1 回だけ transform が呼ばれる', async () => {
    const transform = vi.fn((s: string) => s.toUpperCase());

    const { result, rerender } = renderHook(
      ({ src }: { src: string }) =>
        useDebouncedTransform(src, transform, EMPTY_STRING, [], { debounceMs: DEBOUNCE_MS }),
      { initialProps: { src: 'first' } }
    );

    // debounce 半分 → 再入力 → 残り全部進める
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS / 2);
    });
    act(() => {
      rerender({ src: 'second' });
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    // キャンセル機構が正常なら 'second' の 1 回だけ
    // キャンセルなし実装なら 'first' + 'second' の 2 回になり fail する
    expect(transform).toHaveBeenCalledTimes(1);
    expect(transform).toHaveBeenCalledWith('second');
    expect(result.current.result).toBe('SECOND');
  });

  it('連続して 3 回 source を変えても transform は最後の入力にだけ 1 回だけ走る', async () => {
    const transform = vi.fn((s: string) => s.toUpperCase());

    const { result, rerender } = renderHook(
      ({ src }: { src: string }) =>
        useDebouncedTransform(src, transform, EMPTY_STRING, [], { debounceMs: DEBOUNCE_MS }),
      { initialProps: { src: 'a' } }
    );

    act(() => {
      rerender({ src: 'ab' });
    });
    act(() => {
      rerender({ src: 'abc' });
    });

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(transform).toHaveBeenCalledTimes(1);
    expect(transform).toHaveBeenCalledWith('abc');
    expect(result.current.result).toBe('ABC');
  });
});

// ────────────────────────────────────────────
// ④ source = null で emptyResult / error クリア
// ────────────────────────────────────────────
describe('useDebouncedTransform — source = null で emptyResult / error がクリアされる', () => {
  it('source が null のとき result = emptyResult / error = "" / isPending = false が即時反映される', () => {
    const transform = vi.fn((s: string) => s.toUpperCase());

    const { result } = renderHook(() =>
      useDebouncedTransform<string, string>(null, transform, EMPTY_STRING, [], {
        debounceMs: DEBOUNCE_MS,
      })
    );

    expect(result.current.result).toBe(EMPTY_STRING);
    expect(result.current.error).toBe('');
    expect(result.current.isPending).toBe(false);
    expect(transform).not.toHaveBeenCalled();
  });

  it('変換完了後に source を null に戻すと result / error が即時クリアされ debounce 待ちにならない', async () => {
    const transform = vi.fn((s: string) => s.toUpperCase());

    const { result, rerender } = renderHook(
      ({ src }: { src: string | null }) =>
        useDebouncedTransform(src, transform, EMPTY_STRING, [], { debounceMs: DEBOUNCE_MS }),
      { initialProps: { src: 'hello' as string | null } }
    );

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.result).toBe('HELLO');

    // null に戻す → debounce を進めなくても即時クリア
    act(() => {
      rerender({ src: null });
    });

    expect(result.current.result).toBe(EMPTY_STRING);
    expect(result.current.error).toBe('');
    expect(result.current.isPending).toBe(false);
  });
});

// ────────────────────────────────────────────
// ⑤ transform が throw したときに error セット・result = emptyResult
// ────────────────────────────────────────────
describe('useDebouncedTransform — transform が throw したとき error がセットされ result = emptyResult になる', () => {
  it('debounce パスで transform が throw すると error が設定され result = emptyResult になる', async () => {
    const transform = vi.fn((_s: string): string => {
      throw new Error('変換エラー');
    });

    const { result } = renderHook(() =>
      useDebouncedTransform('bad input', transform, EMPTY_STRING, [], { debounceMs: DEBOUNCE_MS })
    );

    expect(result.current.isPending).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBe('変換エラー');
    expect(result.current.result).toBe(EMPTY_STRING);
  });

  it('immediate パスで transform が throw すると error が設定され result = emptyResult になる', () => {
    const transform = vi.fn((_s: string): string => {
      throw new Error('即時エラー');
    });

    const { result } = renderHook(() =>
      useDebouncedTransform('bad input', transform, EMPTY_STRING, [], { immediate: true })
    );

    expect(result.current.error).toBe('即時エラー');
    expect(result.current.result).toBe(EMPTY_STRING);
    expect(result.current.isPending).toBe(false);
  });

  it('fallbackError が設定されているとき、非 Error の throw に対して fallbackError が使われる', async () => {
    const transform = vi.fn((_s: string): string => {
      throw 'string error';
    });

    const { result } = renderHook(() =>
      useDebouncedTransform('bad', transform, EMPTY_STRING, [], {
        debounceMs: DEBOUNCE_MS,
        fallbackError: 'フォールバックエラー',
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(result.current.error).toBe('フォールバックエラー');
    expect(result.current.result).toBe(EMPTY_STRING);
  });

  it('throw 後に正常な source を渡すと error がクリアされ result が更新される', async () => {
    const transform = vi.fn((s: string): string => {
      if (s === 'bad') throw new Error('変換エラー');
      return s.toUpperCase();
    });

    const { result, rerender } = renderHook(
      ({ src }: { src: string }) =>
        useDebouncedTransform(src, transform, EMPTY_STRING, [], { debounceMs: DEBOUNCE_MS }),
      { initialProps: { src: 'bad' } }
    );

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.error).toBe('変換エラー');

    act(() => {
      rerender({ src: 'good' });
    });

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(result.current.error).toBe('');
    expect(result.current.result).toBe('GOOD');
  });
});
