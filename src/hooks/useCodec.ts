import { useEffect, useState } from 'react';
import type { DependencyList } from 'react';
import { getErrorMessage } from '@/utils/errors';

interface UseCodecOptions {
  /** デバウンス（ms）。既定 300。 */
  debounceMs?: number;
  /** transform が Error 以外を throw した場合のフォールバックメッセージ。 */
  fallbackError?: string;
}

/**
 * 入力 → デバウンス → 変換 → 出力 ＋ エラー状態 をひとまとめにするフック。
 *
 * 入力が空のときは output / error を即時クリアする。
 * `transform` が throw した場合、Error.message（無ければ fallbackError）を error にセットし
 * output は空文字列にリセットする。
 *
 * `deps` には transform が依存する外部状態（モード・フォーマット切替など）を渡す。
 * 利用者は transform 自体をメモ化する必要はない。
 *
 * `isPending` は input または deps が変化してからデバウンス完了（出力反映）までの間 true になる。
 * この間はダウンロードボタン等を disabled にすることで、内容と拡張子の不整合を防ぐ。
 */
export function useCodec(
  transform: (input: string) => string,
  deps: DependencyList,
  options: UseCodecOptions = {}
) {
  const { debounceMs = 300, fallbackError = '変換に失敗しました' } = options;
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!input) {
      // 空入力で debounce を待たず即時クリア（リグレッション保護: PR #149）
      setOutput('');
      setError('');
      setIsPending(false);
      return;
    }
    // deps 変化直後からデバウンス完了まで pending 状態にする
    setIsPending(true);
    // debounce 中の再入力で前回 schedule をキャンセル（リグレッション保護: PR #149）
    const timer = setTimeout(() => {
      try {
        setOutput(transform(input));
        setError('');
      } catch (e) {
        setOutput('');
        setError(getErrorMessage(e, fallbackError));
      } finally {
        setIsPending(false);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
    // transform は deps を介して追跡する設計（exhaustive-deps を意図的に無効化）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, debounceMs, fallbackError, ...deps]);

  const reset = () => {
    setInput('');
    setOutput('');
    setError('');
    setIsPending(false);
  };

  return { input, setInput, output, setOutput, error, setError, isPending, reset };
}

/**
 * useCodec の拡張版。変換結果に加えてメタデータ（warnings 等）を同時に setState するフック。
 *
 * `transform` は `{ output: string; meta: M }` を返す。
 * `output` と `meta` を同一 setTimeout コールバック内で同時に setState するため、
 * warningsRef のような side-channel を必要とせず、将来の React batching/deferral にも安全。
 *
 * 既存 `useCodec` と同じ debounce 挙動を厳守:
 * ①空入力で debounce を待たず即時クリア（リグレッション保護: PR #149）
 * ②debounce 中の再入力で前回 schedule をキャンセル（cleanup の clearTimeout）
 * ③`isPending` は input/deps 変化〜debounce 完了まで true
 */
export function useCodecWithMeta<M>(
  transform: (input: string) => { output: string; meta: M },
  initialMeta: M,
  deps: DependencyList,
  options: UseCodecOptions = {}
) {
  const { debounceMs = 300, fallbackError = '変換に失敗しました' } = options;
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [meta, setMeta] = useState<M>(initialMeta);

  useEffect(() => {
    if (!input) {
      // 空入力で debounce を待たず即時クリア（リグレッション保護: PR #149）
      setOutput('');
      setError('');
      setMeta(initialMeta);
      setIsPending(false);
      return;
    }
    // deps 変化直後からデバウンス完了まで pending 状態にする
    setIsPending(true);
    // debounce 中の再入力で前回 schedule をキャンセル（リグレッション保護: PR #149）
    const timer = setTimeout(() => {
      try {
        const result = transform(input);
        // output と meta を同一コールバック内で同時に setState（side-channel 不要）
        setOutput(result.output);
        setMeta(result.meta);
        setError('');
      } catch (e) {
        setOutput('');
        setMeta(initialMeta);
        setError(getErrorMessage(e, fallbackError));
      } finally {
        setIsPending(false);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
    // transform は deps を介して追跡する設計（exhaustive-deps を意図的に無効化）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, debounceMs, fallbackError, ...deps]);

  const reset = () => {
    setInput('');
    setOutput('');
    setError('');
    setMeta(initialMeta);
    setIsPending(false);
  };

  return { input, setInput, output, setOutput, error, setError, isPending, reset, meta };
}
