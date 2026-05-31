import type { ReactNode } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';

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
  /**
   * 親 flex コンテナの高さいっぱいに textarea を伸ばす（左右カラムの高さ揃え用）。既定 false。
   * fill が true のとき手動リサイズは無効化され、managed height が保証される。
   */
  fill?: boolean;
}

/**
 * 出力カード共通 UI。
 * ラベル＋（CopyButton／任意要素）＋ readOnly textarea を一定構造で描画する。
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
  fill = false,
}: OutputFieldProps) {
  const hasValue = value !== '';
  const monoClass = mono ? 'font-mono' : '';
  // fill 時は managed height を保証するため手動リサイズを強制無効化する
  const resizeClass = fill || !resize ? 'resize-none' : 'resize-y';
  const fillContainerClass = fill ? 'md:flex md:h-full md:flex-col' : '';
  const fillStatusClass = fill ? 'md:flex md:flex-1 md:min-h-0' : '';
  const fillTextareaClass = fill ? 'md:block md:h-full md:min-h-0' : '';
  return (
    <div className={`w-full ${fillContainerClass}`.trim()}>
      <div className="flex items-center justify-between mb-3 min-h-8">
        <label htmlFor={id} className="body-emphasis text-default">
          {label}
        </label>
        {hasValue && (
          <div className="flex items-center gap-2">
            {rightSlot}
            {showCopy && <CopyButton text={value} label={copyLabel} />}
          </div>
        )}
      </div>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className={fillStatusClass || undefined}
      >
        <textarea
          id={id}
          readOnly
          value={value}
          rows={rows}
          className={`caption ${monoClass} ${resizeClass} w-full rounded-lg border border-default bg-subtle text-default px-3 py-2 tracking-wide ${fillTextareaClass}`.trim()}
          aria-label={ariaLabel ?? label}
        />
      </div>
    </div>
  );
}
