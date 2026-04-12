import type { CSSProperties } from 'react';

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

/** ヒント・補足テキスト: 14px（DADS最小サイズ、12px禁止のため引き上げ） */
export const micro: CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 400,
  lineHeight: 1.7,
  letterSpacing: '0.02em',
};
