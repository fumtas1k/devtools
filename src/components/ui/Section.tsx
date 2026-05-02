import type { AriaAttributes, ReactNode } from 'react';
import { bodyEmphasis, colors } from '@/utils/styles';

interface Props extends AriaAttributes {
  title?: ReactNode;
  headerSlot?: ReactNode;
  children: ReactNode;
  /** role 属性を外側コンテナに付与する（例: "status"） */
  role?: string;
  /**
   * `title` を span[role="heading"] で描画するときの aria-level。
   * 旧実装は <h3> だったため default は 3。
   * ページ構造上 level を変えたい場合のみ明示指定する。
   */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * 共通セクションコンポーネント。
 * `title` を指定すると左寄せのタイトルとして表示し、`headerSlot` で右側に任意の要素を追加できる。
 * `title` と `headerSlot` の両方を省略した場合はヘッダーを描画しない。
 * `role` や `aria-*` props は外側コンテナ div に透過転送される。
 */
export function Section({
  title,
  headerSlot,
  children,
  role,
  headingLevel = 3,
  ...ariaProps
}: Props) {
  const hasHeader = title != null || headerSlot != null;

  return (
    <div
      role={role}
      {...ariaProps}
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: colors.border,
      }}
    >
      {hasHeader && (
        <div
          className={`px-4 py-3 border-b${headerSlot ? ' flex items-center justify-between flex-wrap gap-2' : ''}`}
          style={{
            ...bodyEmphasis,
            color: colors.text,
            margin: 0,
            background: colors.bgSubtle,
            borderBottomColor: colors.border,
          }}
        >
          {title != null && (
            <span role="heading" aria-level={headingLevel}>
              {title}
            </span>
          )}
          {headerSlot}
        </div>
      )}
      <div
        className="p-4"
        style={{
          background: colors.bg,
        }}
      >
        {children}
      </div>
    </div>
  );
}
