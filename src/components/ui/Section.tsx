import type { AriaAttributes, ReactNode } from 'react';
import { bodyEmphasis, colors } from '@/utils/styles';

interface Props extends AriaAttributes {
  title?: ReactNode;
  headerSlot?: ReactNode;
  children: ReactNode;
  /** role 属性を外側コンテナに付与する（例: "status"） */
  role?: string;
}

/**
 * 共通セクションコンポーネント。
 * `title` を指定すると左寄せのタイトルとして表示し、`headerSlot` で右側に任意の要素を追加できる。
 * `title` と `headerSlot` の両方を省略した場合はヘッダーを描画しない。
 * `role` や `aria-*` props は外側コンテナ div に透過転送される。
 */
export function Section({ title, headerSlot, children, role, ...ariaProps }: Props) {
  const hasHeader = title != null || headerSlot != null;

  return (
    <div
      role={role}
      {...ariaProps}
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
          {title != null && (
            <span role="heading" aria-level={2}>
              {title}
            </span>
          )}
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
