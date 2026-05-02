import type { ReactNode } from 'react';
import { bodyEmphasis, colors } from '@/utils/styles';

interface Props {
  title?: ReactNode;
  headerSlot?: ReactNode;
  children: ReactNode;
}

/**
 * 共通セクションコンポーネント。
 * `title` を指定すると左寄せのタイトルとして表示し、`headerSlot` で右側に任意の要素を追加できる。
 * `title` と `headerSlot` の両方を省略した場合はヘッダーを描画しない。
 */
export function Section({ title, headerSlot, children }: Props) {
  const hasHeader = title != null || headerSlot != null;

  return (
    <div
      style={{
        borderRadius: '0.75rem',
        border: `1px solid ${colors.border}`,
        overflow: 'hidden',
      }}
    >
      {hasHeader && (
        <div
          style={{
            ...bodyEmphasis,
            color: colors.text,
            padding: '0.75rem 1rem',
            margin: 0,
            background: colors.bgSubtle,
            borderBottom: `1px solid ${colors.border}`,
            display: headerSlot ? 'flex' : undefined,
            alignItems: headerSlot ? 'center' : undefined,
            justifyContent: headerSlot ? 'space-between' : undefined,
            flexWrap: headerSlot ? ('wrap' as const) : undefined,
            gap: headerSlot ? '0.5rem' : undefined,
          }}
        >
          {title != null && <span>{title}</span>}
          {headerSlot}
        </div>
      )}
      <div
        style={{
          padding: '1rem',
          background: colors.bg,
        }}
      >
        {children}
      </div>
    </div>
  );
}
