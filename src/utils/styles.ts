import type { CSSProperties, FocusEvent } from 'react';

/**
 * DADSカラーシステム
 * 値はすべて CSS 変数参照。実際の色値は global.css の @theme / :root で管理。
 * ダークモード追加時は global.css の .dark ブロックで上書きするだけでよい。
 */
export const colors = {
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  primary: 'var(--color-primary)',
  link: 'var(--color-link)',
  bg: 'var(--color-bg)',
  bgSurface: 'var(--color-bg-surface)',
  bgSubtle: 'var(--color-bg-subtle)',
  border: 'var(--color-border)',
  borderInput: 'var(--color-border-input)',
  primaryBg: 'var(--color-background)',
  error: 'var(--color-error)',
  errorText: 'var(--color-error-text)',
  errorBg: 'var(--color-error-bg)',
  success: 'var(--color-success)',
  successBg: 'var(--color-success-bg)',
  warning: 'var(--color-warning)',
  warningBg: 'var(--color-warning-bg)',
} as const;

export const shadows = {
  tab: '0 1px 3px rgba(0,0,0,0.1)',
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

/** ヒント・補足テキスト（caption と同値。DADS最小サイズ12px禁止のため14pxに統一） */
export const micro = caption;

/** フォーカスリング表示（onFocus に渡す） */
export function onFocusRing(e: FocusEvent<HTMLElement>): void {
  e.currentTarget.style.outline = `2px solid ${colors.link}`;
  e.currentTarget.style.outlineOffset = '2px';
}

/** フォーカスリング非表示（onBlur / onBlurCapture に渡す） */
export function onBlurRing(e: FocusEvent<HTMLElement>): void {
  e.currentTarget.style.outline = 'none';
}
