import type { ReactNode } from 'react';

type Props = {
  onClick: () => void;
  children?: ReactNode;
};

export function SampleButton({ onClick, children = 'サンプルを入力' }: Props) {
  return (
    <button type="button" onClick={onClick} className="caption text-link-plain btn-link-plain">
      {children}
    </button>
  );
}
