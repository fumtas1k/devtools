import type { ReactNode } from 'react';

export interface ChipOption<T> {
  value: T;
  /** 表示ラベル（フラグは「全マッチ」等の説明、マスクは「メール」等） */
  label: ReactNode;
  /** 先頭の文字トークン（フラグの g/i/m/s… 用。等幅の角丸バッジで表示） */
  token?: ReactNode;
  /** 読み上げ名。未指定なら label を使用 */
  ariaLabel?: string;
  /** ネイティブ tooltip（フラグの長い説明用） */
  title?: string;
  /** >0 のとき件数バッジ表示（マスク用） */
  count?: number;
}

interface Props<T> {
  /** グループ見出し（「マスク対象」等）。SR 向けのグループ名としても使う。 */
  legend: string;
  /** 見出しを視覚表示するか。false でも a11y ツリーには残す（sr-only）。既定 true。 */
  legendVisible?: boolean;
  options: ChipOption<T>[];
  /** ON 判定（多選択なので関数） */
  selected: (value: T) => boolean;
  onToggle: (value: T) => void;
}

/**
 * 多選択トグルチップ群。ToggleGroup（排他選択）とは異なり、各チップを独立にオン/オフできる。
 * `<fieldset>`/`<legend>` で意味付け。各チップは `<button type="button" aria-pressed>`。
 */
export function ToggleChips<T>({
  legend,
  legendVisible = true,
  options,
  selected,
  onToggle,
}: Props<T>) {
  return (
    <fieldset className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <legend className={legendVisible ? 'caption text-muted' : 'sr-only'}>{legend}</legend>
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
            className="toggle-chip"
          >
            {opt.token != null && (
              <span className="toggle-chip__token" aria-hidden="true">
                {opt.token}
              </span>
            )}
            <span className="toggle-chip__label">{opt.label}</span>
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
