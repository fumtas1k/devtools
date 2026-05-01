import { useEffect } from 'react';

/**
 * AbortController を自動管理する useEffect ラッパー。
 * effect 関数に AbortSignal を渡し、クリーンアップ時に abort() を呼ぶ。
 * effect が同期的なクリーンアップ関数を返した場合は通常の useEffect と同様に呼び出す。
 *
 * 非同期処理を実行する場合は `void run()` パターンを使用すること。
 * async 関数を直接渡しても Promise は無視される（キャンセルは signal.aborted で検知する）。
 * **注意**: async 関数を直接渡しても TypeScript のエラーにならない（Promise<void> は void に代入可能）が、
 * cleanup 関数を返したつもりでもスキップされるため、必ず `void run()` パターンを使うこと。
 *
 * クリーンアップ順序: `controller.abort()` を先に呼び、その後 effect の戻り値 cleanup を呼ぶ。
 * cleanup 内で `signal.aborted` を参照して分岐したい場合はこの順序を前提にすること。
 */
export function useAbortableEffect(
  effect: (signal: AbortSignal) => void | (() => void),
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
