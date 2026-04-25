import type { ReactNode } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { bodyEmphasis, caption, colors } from '@/utils/styles';

interface OutputFieldProps {
  /** textarea の id（label との関連付けに使用） */
  id: string;
  /** 見出しラベル */
  label: string;
  /** 出力値（空文字列のときは CopyButton を visibility: hidden にしてレイアウトを保つ） */
  value: string;
  /** textarea 行数。既定 12。 */
  rows?: number;
  /** モノスペースフォントを使う。既定 true。 */
  mono?: boolean;
  /** ユーザーによる縦リサイズを許可する。既定 true。 */
  resize?: boolean;
  /** スクリーンリーダー用ラベル（見出しと別の説明が必要な場合） */
  ariaLabel?: string;
  /** CopyButton のラベル。既定 'コピー'。 */
  copyLabel?: string;
  /** CopyButton を表示するか。既定 true。 */
  showCopy?: boolean;
  /** ラベル右側に並べる追加要素（ダウンロードボタンなど） */
  rightSlot?: ReactNode;
}

/**
 * 出力カード共通 UI。
 * ラベル＋（CopyButton／任意要素）＋ readOnly textarea を一定構造で描画する。
 *
 * - ヘッダ行は `minHeight: 2rem` で CopyButton の有無に関わらず高さが揃うように固定。
 * - `value` が空のとき CopyButton は `visibility: hidden`（DOM サイズを保つため `display: none` ではない）。
 */
export function OutputField({
  id,
  label,
  value,
  rows = 12,
  mono = true,
  resize = true,
  ariaLabel,
  copyLabel = 'コピー',
  showCopy = true,
  rightSlot,
}: OutputFieldProps) {
  return (
    <div className="w-full">
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: '0.75rem', minHeight: '2rem' }}
      >
        <label htmlFor={id} style={{ ...bodyEmphasis, color: colors.text }}>
          {label}
        </label>
        <div
          className="flex items-center gap-2"
          style={{ visibility: value ? 'visible' : 'hidden' }}
        >
          {rightSlot}
          {showCopy && <CopyButton text={value} label={copyLabel} />}
        </div>
      </div>
      <textarea
        id={id}
        readOnly
        value={value}
        rows={rows}
        className="w-full rounded-lg px-3 py-2"
        style={{
          ...caption,
          fontFamily: mono ? 'monospace' : 'inherit',
          letterSpacing: '0.02em',
          border: `1px solid ${colors.border}`,
          background: colors.bgSubtle,
          color: colors.text,
          resize: resize ? 'vertical' : 'none',
        }}
        aria-label={ariaLabel ?? label}
      />
    </div>
  );
}
