import { ActionButton } from './ActionButton';

interface Props {
  onClick: () => void;
  label: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  'aria-label'?: string;
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/**
 * ダウンロードアイコン付きのアクションボタン。
 * `ActionButton` を `size="compact"` で内部使用する薄いラッパー。
 * - 高さは CopyButton (default) と pixel-perfect に揃う（横並び崩れ回避、#288）
 * - `variant="primary"`: primary 色背景 + 白文字 (デフォルト)
 * - `variant="secondary"`: 透過背景 + primary 文字色 + primary ボーダー
 * - `loading=true`: ActionButton 経由で `aria-busy="true"` と disabled 状態を付与
 */
export function DownloadButton({
  onClick,
  label,
  variant = 'primary',
  disabled = false,
  loading = false,
  'aria-label': ariaLabel,
}: Props) {
  return (
    <ActionButton
      variant={variant}
      size="compact"
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      aria-label={ariaLabel ?? label}
    >
      <span className="inline-flex items-center gap-1.5">
        <DownloadIcon />
        {label}
      </span>
    </ActionButton>
  );
}
