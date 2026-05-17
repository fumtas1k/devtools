import { useCallback, useState } from 'react';

/** ID 文字列のクォートスタイル。none / single / double のいずれか。 */
export type QuoteStyle = 'none' | 'single' | 'double';

/** ToggleGroup<QuoteStyle> 用の選択肢定数。Ulid / UuidV7 など複数 generator で共有する。 */
export const QUOTE_OPTIONS: { value: QuoteStyle; label: string }[] = [
  { value: 'none', label: 'なし' },
  { value: 'double', label: '"..."' },
  { value: 'single', label: "'...'" },
];

/**
 * ID 列のクォートスタイル管理フック。
 *
 * - `formatId(id)`: 単一 ID をクォートで囲む
 * - `formatAll(ids)`: 配列を改行区切りで結合（クォートあり時は array-like に trailing comma 付与）
 */
export function useQuoteStyle(initial: QuoteStyle = 'none') {
  const [quoteStyle, setQuoteStyle] = useState<QuoteStyle>(initial);

  const formatId = useCallback(
    (id: string) => {
      if (quoteStyle === 'double') return `"${id}"`;
      if (quoteStyle === 'single') return `'${id}'`;
      return id;
    },
    [quoteStyle]
  );

  const formatAll = useCallback(
    (ids: string[]) =>
      ids
        .map((id, i) => {
          const formatted = formatId(id);
          if (quoteStyle === 'none') return formatted;
          const isLast = i === ids.length - 1;
          return `${formatted}${isLast ? '' : ','}`;
        })
        .join('\n'),
    [formatId, quoteStyle]
  );

  return { quoteStyle, setQuoteStyle, formatId, formatAll };
}
