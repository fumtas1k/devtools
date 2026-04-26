import type { CSSProperties } from 'react';

/**
 * DADSカラーシステム
 * 値はすべて CSS 変数参照。実際の色値は global.css の @theme / :root で管理。
 * ダークモード追加時は global.css の .dark ブロックで上書きするだけでよい。
 */
export const colors = {
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  primary: 'var(--color-primary)',
  secondary: 'var(--color-secondary)',
  tertiary: 'var(--color-tertiary)',
  link: 'var(--color-link)',
  bg: 'var(--color-bg)',
  bgSurface: 'var(--color-bg-surface)',
  bgSubtle: 'var(--color-bg-subtle)',
  bgPrimary: 'var(--color-background)',
  /** プライマリ色背景上のテキスト（白抜き文字）。ダークモード時も白を維持する意図 */
  textOnPrimary: 'var(--color-text-on-primary)',
  border: 'var(--color-border)',
  borderInput: 'var(--color-border-input)',
  error: 'var(--color-error)',
  errorText: 'var(--color-error-text)',
  errorBg: 'var(--color-error-bg)',
  success: 'var(--color-success)',
  successBg: 'var(--color-success-bg)',
  warning: 'var(--color-warning)',
  warningBg: 'var(--color-warning-bg)',
} as const;

/** エレベーション（box-shadow）。CSS変数参照。 */
export const elevation = {
  level1: 'var(--elevation-1)',
  level2: 'var(--elevation-2)',
  level3: 'var(--elevation-3)',
  level4: 'var(--elevation-4)',
  level5: 'var(--elevation-5)',
} as const;

/** 角丸。CSS変数参照。 */
export const radii = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  full: 'var(--radius-full)',
} as const;

/** 本文強調: 17px Bold */
export const bodyEmphasis: CSSProperties = {
  fontSize: '1.0625rem',
  fontWeight: 700,
  lineHeight: 1.7,
  letterSpacing: '0.02em',
};

/** キャプション: 14px（UI制約がある場合の最小サイズ） */
export const caption: CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 400,
  lineHeight: 1.7,
  letterSpacing: '0.02em',
};
