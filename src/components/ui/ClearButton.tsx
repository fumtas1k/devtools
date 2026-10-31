import { COMPACT_BUTTON_SHAPE_CLASSES } from './_compactButton';
import { cx } from '@/utils/cx';

interface Props {
  onClick: () => void;
  className?: string;
}

/**
 * クリアボタン。DADS Button の text variant・sm サイズ（docs/decisions.md [140]）。
 *
 * style: global.css `@layer components` の `.btn-action` / `.btn-action--text` を参照
 * （ActionButton の text variant と同じ class。寸法は COMPACT_BUTTON_SHAPE_CLASSES）。
 */
export function ClearButton({ onClick, className = '' }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'btn-action btn-action--text inline-flex items-center justify-center whitespace-nowrap',
        COMPACT_BUTTON_SHAPE_CLASSES,
        className
      )}
    >
      クリア
    </button>
  );
}
