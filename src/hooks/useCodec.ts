import { useState, useMemo, useCallback } from 'react';
import type { DependencyList } from 'react';
import { useDebouncedTransform } from '@/hooks/useDebouncedTransform';

/** core: useDebouncedTransform に委譲 */
interface UseCodecOptions {
  /** デバウンス（ms）。既定 300。 */
  debounceMs?: number;
  /** transform が Error 以外を throw した場合のフォールバックメッセージ。 */
  fallbackError?: string;
}

/**
 * 入力 → デバウンス → 変換 → 出力 ＋ エラー状態 をひとまとめにするフック。
 *
 * core: useDebouncedTransform に委譲。debounce / clearTimeout / isPending / throw 処理は
 * useDebouncedTransform 側で一元管理。side-channel 不要。
 *
 * 入力が空のときは output / error を即時クリアする（PR #149 保護は core 側）。
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
  const { input, setInput, output, error, isPending, reset } = useCodecWithMeta(
    (text) => ({ output: transform(text), meta: undefined }),
    undefined,
    deps,
    options
  );
  return { input, setInput, output, error, isPending, reset };
}

/**
 * useCodec の拡張版。変換結果に加えてメタデータ（warnings 等）を同時に反映するフック。
 *
 * core: useDebouncedTransform に委譲。side-channel 不要。
 * output と meta は同一 state オブジェクト内で同時に反映されるため、
 * 将来の React batching/deferral にも安全。
 *
 * 既存 useCodec と同じ debounce 挙動を厳守（PR #149 保護は core 側）:
 * ①空入力で debounce を待たず即時クリア（source=null → core が即時クリア）
 * ②debounce 中の再入力で前回 schedule をキャンセル（cleanup の clearTimeout）
 * ③`isPending` は input/deps 変化〜debounce 完了まで true
 */
export function useCodecWithMeta<M>(
  transform: (input: string) => { output: string; meta: M },
  initialMeta: M,
  deps: DependencyList,
  options: UseCodecOptions = {}
) {
  const [input, setInput] = useState('');
  // core は emptyResult の安定参照を要求するため useMemo で安定化
  const emptyResult = useMemo(
    () => ({ output: '', meta: initialMeta }),
    // initialMeta は hook の初回マウント時のみ参照する想定（deps 変更に追従しない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const { result, error, isPending } = useDebouncedTransform(
    input === '' ? null : input, // 空入力は source=null で即時クリア（PR #149 の挙動を core 側で再現）
    transform,
    emptyResult,
    deps,
    options
  );
  const reset = useCallback(() => setInput(''), []);
  return { input, setInput, output: result.output, error, isPending, reset, meta: result.meta };
}
