import { useEffect, useState } from 'react';
import type { DependencyList } from 'react';
import { getErrorMessage } from '@/utils/errors';

interface UseDebouncedTransformOptions {
  /** デバウンス（ms）。既定 300。`immediate` が true の場合は無視される。 */
  debounceMs?: number;
  /** true のとき setTimeout を使わず effect 内で同期実行する（ファイル入力の即時パス用）。 */
  immediate?: boolean;
  /** transform が Error 以外を throw した場合のフォールバックメッセージ。 */
  fallbackError?: string;
}

/**
 * source → debounce（または即時） → transform → result ＋ error ＋ isPending をひとまとめにするフック。
 *
 * - `source === null` → result = emptyResult / error = '' / isPending = false（debounce を待たず即時）。
 * - `options.immediate === true` → setTimeout を使わず effect 内で同期実行。isPending は false のまま。
 * - それ以外 → setTimeout(debounceMs ?? 300)。debounce 中は isPending = true。
 * - `transform` throw → error に getErrorMessage(e, fallbackError)、result = emptyResult、isPending = false。
 *
 * `emptyResult` は安定参照前提（呼び出し側がモジュールスコープ定数か useMemo で渡すこと）。
 * `transform` は deps を介して追跡する設計（exhaustive-deps を意図的に無効化）。
 */
export function useDebouncedTransform<I, R>(
  source: I | null,
  transform: (input: I) => R,
  emptyResult: R,
  deps: DependencyList,
  options?: UseDebouncedTransformOptions
): { result: R; error: string; isPending: boolean } {
  const {
    debounceMs = 300,
    immediate = false,
    fallbackError = '変換に失敗しました',
  } = options ?? {};

  const [result, setResult] = useState<R>(emptyResult);
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (source === null) {
      setResult(emptyResult);
      setError('');
      setIsPending(false);
      return;
    }

    if (immediate) {
      // ファイル入力の即時パス: setTimeout を使わず同期実行
      try {
        setResult(transform(source));
        setError('');
      } catch (e) {
        setResult(emptyResult);
        setError(getErrorMessage(e, fallbackError));
      }
      // isPending は false のまま（setIsPending 不要）
      return;
    }

    // テキスト入力の debounce パス
    setIsPending(true);
    const timer = setTimeout(() => {
      try {
        setResult(transform(source));
        setError('');
      } catch (e) {
        setResult(emptyResult);
        setError(getErrorMessage(e, fallbackError));
      } finally {
        setIsPending(false);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
    // transform は deps を介して追跡する設計（exhaustive-deps を意図的に無効化）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, immediate, debounceMs, fallbackError, ...deps]);

  return { result, error, isPending };
}
