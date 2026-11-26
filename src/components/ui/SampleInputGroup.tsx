import type { ReactNode } from 'react';

type Props = {
  label: string;
  actions: ReactNode;
  children: ReactNode;
};

/** 複数の欄に入るサンプルは、入力グループ全体の右上に置く。 */
export function SampleInputGroup({ label, actions, children }: Props) {
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="sr-only">{label}</legend>
      <div className="flex min-h-11 flex-wrap items-center justify-end gap-x-4 gap-y-6">
        {actions}
      </div>
      {children}
    </fieldset>
  );
}
