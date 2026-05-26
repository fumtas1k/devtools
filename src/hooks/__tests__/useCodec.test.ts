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

// ────────────────────────────────────────────
// useCodecWithMeta
// ────────────────────────────────────────────
import { useCodecWithMeta } from '@/hooks/useCodec';

describe('useCodecWithMeta — デバウンス完了後に output と meta が同時に反映される', () => {
  it('debounce 完了後に output と meta が両方更新される', async () => {
    const transform = vi.fn((s: string) => ({ output: s.toUpperCase(), meta: [s.length] }));
    const { result } = renderHook(() =>
      useCodecWithMeta(transform, [] as number[], [], { debounceMs: DEBOUNCE_MS })
    );

    act(() => {
      result.current.setInput('hello');
    });
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.output).toBe('HELLO');
    expect(result.current.meta).toEqual([5]);
  });
});

describe('useCodecWithMeta — 空入力で meta が initialMeta にリセットされる', () => {
  it('一度変換後に空入力を渡すと output・meta・error が即時クリアされる', async () => {
    const transform = vi.fn((s: string) => ({ output: s.toUpperCase(), meta: [s.length] }));
    const { result } = renderHook(() =>
      useCodecWithMeta(transform, [] as number[], [], { debounceMs: DEBOUNCE_MS })
    );

    // 一度変換を完了させる
    act(() => {
      result.current.setInput('hello');
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.output).toBe('HELLO');
    expect(result.current.meta).toEqual([5]);

    // 空入力 → debounce を進めなくても即時クリアされる（リグレッション保護: PR #149）
    act(() => {
      result.current.setInput('');
    });

    expect(result.current.output).toBe('');
    expect(result.current.error).toBe('');
    expect(result.current.meta).toEqual([]);
    expect(result.current.isPending).toBe(false);
  });
});

describe('useCodecWithMeta — transform が throw したとき error が設定され meta が initialMeta になる', () => {
  it('transform が throw すると error がセットされ output・meta がリセットされる', async () => {
    const transform = vi.fn((_s: string): { output: string; meta: string[] } => {
      throw new Error('変換エラー');
    });
    const { result } = renderHook(() =>
      useCodecWithMeta(transform, [] as string[], [], { debounceMs: DEBOUNCE_MS })
    );

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
    expect(result.current.meta).toEqual([]);
  });
});

describe('useCodecWithMeta — reset() で input・output・meta が全リセットされる', () => {
  it('reset() を呼ぶと全状態が初期値に戻る', async () => {
    const transform = vi.fn((s: string) => ({ output: s.toUpperCase(), meta: [s.length] }));
    const { result } = renderHook(() =>
      useCodecWithMeta(transform, [] as number[], [], { debounceMs: DEBOUNCE_MS })
    );

    // 変換を完了させる
    act(() => {
      result.current.setInput('hello');
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.output).toBe('HELLO');
    expect(result.current.meta).toEqual([5]);

    // reset() で全リセット
    act(() => {
      result.current.reset();
    });

    expect(result.current.input).toBe('');
    expect(result.current.output).toBe('');
    expect(result.current.error).toBe('');
    expect(result.current.meta).toEqual([]);
    expect(result.current.isPending).toBe(false);
  });
});

// ────────────────────────────────────────────
// useCodecWithMeta — initialMeta 追従（emptyResult の memo deps が [initialMeta] であることの契約）
//
// emptyResult を useMemo([]) で安定化すると initialMeta は初回マウント値のみ捕捉され、
// その後 initialMeta が変化しても空入力時に初回値へ戻る（footgun）。deps を [initialMeta]
// にすることで最新値にリセットされる（旧 useCodecWithMeta の実行時参照と等価）。
// 本テストは参照同一性(toBe)で契約を固定する。memo deps を [] に戻すと fail する＝陽性対照。
// ────────────────────────────────────────────
describe('useCodecWithMeta — initialMeta が変化した後の空入力は最新の initialMeta にリセットされる', () => {
  it('[陽性] rerender で initialMeta を差し替えた後に空入力すると meta が最新 initialMeta を参照する', async () => {
    const transform = vi.fn((s: string) => ({ output: s.toUpperCase(), meta: [s.length] }));
    const metaA: number[] = [10];
    const metaB: number[] = [20];

    const { result, rerender } = renderHook(
      ({ im }: { im: number[] }) =>
        useCodecWithMeta(transform, im, [], { debounceMs: DEBOUNCE_MS }),
      { initialProps: { im: metaA } }
    );

    // 変換を完了させる
    act(() => {
      result.current.setInput('hello');
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.meta).toEqual([5]);

    // initialMeta を metaB に差し替えて rerender
    rerender({ im: metaB });

    // 空入力 → 最新の initialMeta(metaB) にリセットされる（初回 metaA ではない）
    act(() => {
      result.current.setInput('');
    });

    expect(result.current.meta).toBe(metaB);
  });
});
