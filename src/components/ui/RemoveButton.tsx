import { CloseIcon } from './CloseIcon';
import { cx } from '@/utils/cx';

interface Props {
  /** accessible name（`aria-label`）。何を削除するか行を特定できる文言にする（例: `SAN 2 を削除`） */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * 繰り返しリストの行・カードから 1 項目を取り除く、アイコンのみの「×」ボタン。
 * DADS Button の text variant から派生（docs/decisions.md [162]）。
 *
 * - 見た目 32×32px・枠なし・角丸 6px。色は muted（赤はエラー表現と紛れるため使わない）
 * - タップ領域は `.btn-remove::after` で 44×44px に広げる（[152]）
 * - クリア・ダイアログの閉じる・検索クリア・カメラ停止には使わない
 *
 * style: `src/styles/components/button.css`（`@layer components`） の `.btn-remove` を参照。
 */
export function RemoveButton({ label, onClick, disabled, className = '' }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cx('btn-remove', className)}
    >
      <CloseIcon size={20} />
    </button>
  );
}
