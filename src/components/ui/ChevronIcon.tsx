interface Props {
  /** 開状態 (true なら 180° 回転して上向き ▲) */
  open?: boolean;
  size?: number;
  className?: string;
}

/**
 * accordion / expandable トグル用の chevron-down SVG icon。
 * `open` true で 180° 回転 + 150ms transition で上向き表現。
 * 色は呼び出し側の `text-*` semantic auto-utility で継承 (stroke="currentColor")。
 */
export function ChevronIcon({ open = false, size = 14, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`inline-block align-middle transition-transform duration-150 ease-in-out${
        open ? ' rotate-180' : ''
      }${className ? ` ${className}` : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
