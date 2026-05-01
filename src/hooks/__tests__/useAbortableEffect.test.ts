// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';

describe('useAbortableEffect', () => {
  it('effect 関数に AbortSignal が渡される', () => {
    const capturedSignals: AbortSignal[] = [];

    renderHook(() =>
      useAbortableEffect((signal) => {
        capturedSignals.push(signal);
      }, [])
    );

    expect(capturedSignals).toHaveLength(1);
    expect(capturedSignals[0]).toBeInstanceOf(AbortSignal);
    expect(capturedSignals[0].aborted).toBe(false);
  });

  it('クリーンアップ時に signal が abort される', () => {
    let capturedSignal: AbortSignal | null = null;

    const { unmount } = renderHook(() =>
      useAbortableEffect((signal) => {
        capturedSignal = signal;
      }, [])
    );

    expect(capturedSignal!.aborted).toBe(false);
    unmount();
    expect(capturedSignal!.aborted).toBe(true);
  });

  it('deps が変化すると前の signal が abort され、新しい signal が渡される', () => {
    const signals: AbortSignal[] = [];

    const { rerender } = renderHook(
      ({ dep }: { dep: number }) =>
        useAbortableEffect(
          (signal) => {
            signals.push(signal);
          },
          [dep]
        ),
      { initialProps: { dep: 0 } }
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    act(() => {
      rerender({ dep: 1 });
    });

    // 最初の signal が abort され、新しい signal が追加されている
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it('effect が同期的なクリーンアップ関数を返した場合、クリーンアップ時に呼ばれる', () => {
    const cleanup = vi.fn();

    const { unmount } = renderHook(() =>
      useAbortableEffect(() => {
        return cleanup;
      }, [])
    );

    expect(cleanup).not.toHaveBeenCalled();
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('クリーンアップ関数を返さない場合はエラーが発生しない', () => {
    expect(() => {
      const { unmount } = renderHook(() =>
        useAbortableEffect(() => {
          // cleanup なし
        }, [])
      );
      unmount();
    }).not.toThrow();
  });

  it('非同期 effect でも signal.aborted を使ってキャンセルを検知できる', async () => {
    const results: string[] = [];

    const { unmount } = renderHook(() =>
      useAbortableEffect((signal) => {
        const run = async () => {
          await Promise.resolve(); // 非同期ポイント
          if (signal.aborted) {
            results.push('aborted');
            return;
          }
          results.push('completed');
        };
        void run();
      }, [])
    );

    // アンマウント前に完了
    await act(async () => {
      await Promise.resolve();
    });
    expect(results).toContain('completed');

    unmount();
    results.length = 0;

    // 次のレンダでアンマウントを即座に行うケース
    const { unmount: unmount2 } = renderHook(() =>
      useAbortableEffect((signal) => {
        const run = async () => {
          await Promise.resolve();
          if (signal.aborted) {
            results.push('aborted');
            return;
          }
          results.push('completed');
        };
        void run();
      }, [])
    );
    unmount2(); // 非同期処理の完了前にアンマウント

    await act(async () => {
      await Promise.resolve();
    });
    expect(results).toContain('aborted');
  });
});
