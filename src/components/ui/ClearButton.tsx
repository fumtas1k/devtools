import { caption, colors } from '@/utils/styles';

interface Props {
  onClick: () => void;
  className?: string;
}

export function ClearButton({ onClick, className = '' }: Props) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 transition-colors ${className}`}
      style={{ ...caption, color: colors.muted, whiteSpace: 'nowrap', background: 'transparent', border: 'none' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = colors.bgSubtle)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      クリア
    </button>
  );
}
