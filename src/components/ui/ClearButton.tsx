interface Props {
  onClick: () => void;
  className?: string;
}

export function ClearButton({ onClick, className = '' }: Props) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 transition-colors caption text-muted whitespace-nowrap bg-transparent-token border-none ${className}`}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-subtle)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '')}
    >
      クリア
    </button>
  );
}
