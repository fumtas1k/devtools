/**
 * compact ボタン共通 utility クラス群（DADS Button の sm: 高さ 36px・最小幅 80px・角丸 6px・16px Bold・行高 1）。
 * CopyButton (default) と ActionButton (size="compact") / DownloadButton / ClearButton の
 * 高さ・角丸・パディング・文字を一箇所で管理し、両者の不一致（border-radius drift）を防ぐ。
 *
 * 歴史: PR #318 後も CopyButton は rounded(0.25rem) / ActionButton compact は rounded-lg(0.5rem)
 * で不一致が残っていたため、issue #320 で rounded-lg に統一し本定数として共有化。
 * DADS 移行 Phase 4 で rounded-md（8px）、Phase 5 で DADS の sm ボタンの寸法
 * （rounded-button-sm = 6px）に変更（docs/decisions.md [139] / [140]）。
 */
export const COMPACT_BUTTON_SHAPE_CLASSES =
  'min-h-9 min-w-20 px-3 py-0.5 rounded-button-sm text-base font-bold leading-none' as const;
