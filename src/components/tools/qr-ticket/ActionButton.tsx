import { colors, caption, onFocusRing, onBlurRing } from '@/utils/styles';

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'danger';
}

const bgMap = {
  default: colors.bgSubtle,
  primary: colors.primary,
  danger: 'transparent',
};
const colorMap = {
  default: colors.text,
  primary: '#ffffff',
  danger: colors.error,
};
const borderMap = {
  default: colors.borderInput,
  primary: colors.primary,
  danger: colors.error,
};

export function ActionButton({
  onClick,
  disabled,
  children,
  variant = 'default',
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...caption,
        fontWeight: 600,
        padding: '0.5rem 1rem',
        borderRadius: '0.5rem',
        border: `1px solid ${borderMap[variant]}`,
        background: disabled ? colors.bgSubtle : bgMap[variant],
        color: disabled ? colors.muted : colorMap[variant],
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap' as const,
      }}
      onFocus={onFocusRing}
      onBlur={onBlurRing}
    >
      {children}
    </button>
  );
}
