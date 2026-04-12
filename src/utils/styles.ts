import type { CSSProperties } from 'react';

/** DADSカラーシステム */
export const colors = {
  text: '#111827',        // neutral-900
  muted: '#6B7280',       // neutral-500
  primary: '#1A56DB',     // DADS primary blue
  link: '#2563EB',        // DADS link / focus ring
  bg: '#ffffff',
  bgSurface: '#F9FAFB',   // neutral-50
  bgSubtle: '#F3F4F6',    // neutral-100
  border: '#E5E7EB',      // neutral-200
  borderInput: '#D1D5DB', // neutral-300
  primaryBg: '#EFF6FF',   // blue-50 (active chip background)
  error: '#DC2626',       // red-600
  errorText: '#B91C1C',   // red-700
  errorBg: '#FEF2F2',     // red-50
  success: '#16A34A',     // green-600
  successBg: '#F0FDF4',   // green-50
  warning: '#854D0E',     // amber-800
  warningBg: '#FEF3C7',   // amber-100
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
