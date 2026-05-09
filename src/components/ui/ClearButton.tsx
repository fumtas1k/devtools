interface Props {
  onClick: () => void;
  className?: string;
}

/**
 * クリアボタン。hover 時に bg-subtle に変化（CSS :hover で実現）。
 *
 * style: global.css `@layer components` の `.btn-clear` を参照。
 * `.btn-clear:hover` で background-color が var(--color-bg-subtle) になる。
 */
export function ClearButton({ onClick, className = '' }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`caption text-muted btn-clear rounded-lg px-3 py-1.5 whitespace-nowrap border-0 ${className}`.trim()}
    >
      クリア
    </button>
  );
}
