import type { ReactNode } from 'react';

export interface ChipOption<T> {
  value: T;
  /** 表示ラベル（フラグは1文字、マスクは「メール」等） */
  label: ReactNode;
  /** 読み上げ名。未指定なら label を使用 */
  ariaLabel?: string;
  /** ネイティブ tooltip（フラグの説明用） */
  title?: string;
  /** >0 のとき件数バッジ表示（マスク用） */
  count?: number;
}

interface Props<T> {
  /** グループ見出し（「フラグ」「マスク対象」） */
  legend: string;
  options: ChipOption<T>[];
  /** ON 判定（多選択なので関数） */
  selected: (value: T) => boolean;
  onToggle: (value: T) => void;
  /** チップ文字を等幅に（フラグ用） */
  mono?: boolean;
}

/**
 * 多選択トグルチップ群。ToggleGroup（排他選択）とは異なり、各チップを独立にオン/オフできる。
 * `<fieldset>`/`<legend>` で意味付け。各チップは `<button type="button" aria-pressed>`。
 */
export function ToggleChips<T>({ legend, options, selected, onToggle, mono }: Props<T>) {
  return (
    <fieldset className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <legend className="caption text-muted">{legend}</legend>
      {options.map((opt, i) => {
        const on = selected(opt.value);
        const countVal = opt.count ?? 0;

        // SR 向け aria-label: 件数がある場合は「ラベル（検出 N 件）」
        const baseLabel = opt.ariaLabel ?? (typeof opt.label === 'string' ? opt.label : undefined);
        const ariaLabel =
          baseLabel != null && countVal > 0 ? `${baseLabel}（検出 ${countVal} 件）` : baseLabel;

        return (
          <button
            key={i}
            type="button"
            aria-pressed={on}
            aria-label={ariaLabel}
            title={opt.title}
            onClick={() => onToggle(opt.value)}
            className={mono ? 'toggle-chip toggle-chip--mono' : 'toggle-chip'}
          >
            {opt.label}
            {countVal > 0 && (
              <span className="toggle-chip__count" aria-hidden="true">
                {countVal}
              </span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}
