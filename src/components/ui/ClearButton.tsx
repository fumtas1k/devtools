interface Props {
  onClick: () => void;
  className?: string;
}

export function ClearButton({ onClick, className = '' }: Props) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 transition-colors caption text-muted whitespace-nowrap bg-transparent-token border-none hover-bg-subtle ${className}`}
    >
      クリア
    </button>
  );
}
