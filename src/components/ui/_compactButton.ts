/**
 * compact ボタン共通 utility クラス群。
 * CopyButton (default) と ActionButton (size="compact") / DownloadButton の
 * 角丸・パディング・行高さを一箇所で管理し、両者の不一致（border-radius drift）を防ぐ。
 *
 * 歴史: PR #318 後も CopyButton は rounded(0.25rem) / ActionButton compact は rounded-lg(0.5rem)
 * で不一致が残っていたため、issue #320 で rounded-lg に統一し本定数として共有化。
 */
export const COMPACT_BUTTON_SHAPE_CLASSES = 'rounded-lg font-bold px-3 py-2 leading-none' as const;
