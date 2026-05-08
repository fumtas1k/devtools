/**
 * 簡易 CSS length token 検証。`{number}{unit?}` 形式のみ許容。
 *
 * 対応: integer / decimal / 負値 / `px|rem|em|%|fr|vw|vh|ch|ex|pt`
 * 非対応: `calc()` / 複合値 / 数学演算子。必要になった時点で拡張。
 *
 * 採用根拠: ResultTable の `width` / `minWidth` を `replaceSync` (CSS パーサ) に
 * 渡すため、不正値混入で CSS injection になる経路を封じる
 * (`docs/decisions.md [067]` / PR 9 spec § 4.2)。
 */
const CSS_LENGTH = /^-?\d+(\.\d+)?(px|rem|em|%|fr|vw|vh|ch|ex|pt)?$/;

export function assertCssLength(value: string, label: string): void {
  if (!CSS_LENGTH.test(value)) {
    throw new Error(`Invalid CSS length for ${label}: ${JSON.stringify(value)}`);
  }
}
