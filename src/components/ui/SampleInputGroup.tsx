import type { ReactNode } from 'react';

type Props = {
  label: string;
  children: ReactNode;
};

/** 同時にサンプルが入力される複数の欄を、読み上げでもひとまとまりにする。 */
export function SampleInputGroup({ label, children }: Props) {
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="sr-only">{label}</legend>
      {children}
    </fieldset>
  );
}
