import type { AriaAttributes, ReactNode } from 'react';
import { cx } from '@/utils/cx';

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
    <div role={role} {...ariaProps} className="rounded-xl border border-default overflow-hidden">
      {hasHeader && (
        <div
          className={cx(
            'body-emphasis text-default bg-subtle border-b border-default px-4 py-3 m-0',
            headerSlot != null && 'flex items-center justify-between flex-wrap gap-2'
          )}
        >
          {title != null && (
            <span role="heading" aria-level={headingLevel}>
              {title}
            </span>
          )}
          {headerSlot}
        </div>
      )}
      <div className="bg-default p-4">{children}</div>
    </div>
  );
}
