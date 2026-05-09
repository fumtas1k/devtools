/**
 * 簡易 CSS length token 検証。`{number}{unit}` 形式、または `0` のみ許容。
 *
 * 対応: integer / decimal / 負値 /
 *   `px|rem|em|%|fr|vw|vh|ch|ex|pt` (既存) +
 *   `vmin|vmax|dvh|dvw|svh|svw|lvh|lvw` (viewport 系) +
 *   `cm|mm|in|pc` (物理単位)
 * unitless: `0` (または `-0`) のみ許容。それ以外の unitless 値は reject
 *   (CSS では 0 以外の unitless は no-op rule になりブラウザが宣言を無視するため)。
 * 非対応: `calc()` / 複合値 / 数学演算子。必要になった時点で拡張。
 *
 * 採用根拠: ResultTable の `width` / `minWidth` を `replaceSync` (CSS パーサ) に
 * 渡すため、不正値混入で CSS injection になる経路を封じる
 * (`docs/decisions.md [067]` / PR 9 spec § 4.2)。
 */
// 単位リスト (既存 + viewport 系 + 物理単位)
// 長い候補を先に並べて alternation の誤マッチを防ぐ
const CSS_UNITS = 'vmin|vmax|dvh|dvw|svh|svw|lvh|lvw|px|rem|em|%|fr|vw|vh|ch|ex|pt|cm|mm|in|pc';
// 単位付き値 (0 含む) または unitless の 0 のみ valid
const CSS_LENGTH = new RegExp(`^(-?\\d+(\\.\\d+)?(${CSS_UNITS})|[+-]?0)$`);

export function assertCssLength(value: string, label: string): void {
  if (!CSS_LENGTH.test(value)) {
    throw new Error(`Invalid CSS length for ${label}: ${JSON.stringify(value)}`);
  }
}
