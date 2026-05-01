import { useEffect } from 'react';

/**
 * AbortController を自動管理する useEffect ラッパー。
 * effect 関数に AbortSignal を渡し、クリーンアップ時に abort() を呼ぶ。
 * effect が同期的なクリーンアップ関数を返した場合は通常の useEffect と同様に呼び出す。
 */
export function useAbortableEffect(
  effect: (signal: AbortSignal) => void | Promise<void> | (() => void | Promise<void>),
  deps: React.DependencyList
): void {
  useEffect(() => {
    const controller = new AbortController();
    const result = effect(controller.signal);

    return () => {
      controller.abort();
      // 同期的なクリーンアップ関数が返された場合は呼び出す
      if (typeof result === 'function') {
        void result();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
