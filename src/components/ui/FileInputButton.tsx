import type { ChangeEvent, ReactNode } from 'react';

interface Props {
  /** 許可する MIME タイプ / 拡張子 (例: "image/*") */
  accept?: string;
  /** ファイル選択時のコールバック */
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** ボタンのラベルとして表示するコンテンツ */
  children: ReactNode;
  /** input 要素の id（既存 E2E との互換維持用） */
  id?: string;
  /** label 要素に追加する className */
  className?: string;
  /** 無効化フラグ。true のとき aria-disabled="true" を付与し、CSS で not-allowed スタイルを適用 */
  disabled?: boolean;
}

/**
 * ファイル選択ボタン（label 内包 input 構造）。
 *
 * input を label の子に置くことで `:focus-within` が parent label に効き、
 * キーボードフォーカス時に outline ring (`.btn-file-input:focus-within`) が可視化される。
 * スタイルは `src/styles/global.css` の `.btn-file-input` クラスで定義。
 *
 * @param accept - 許可する MIME タイプ / 拡張子 (例: "image/*")
 * @param onChange - ファイル選択時のコールバック
 * @param children - ボタンのラベルとして表示するコンテンツ
 * @param id - input 要素の id（既存 E2E との互換維持用）
 * @param className - label 要素に追加するクラス
 * @param disabled - 無効化フラグ
 */
export function FileInputButton({
  accept,
  onChange,
  children,
  id,
  className,
  disabled = false,
}: Props) {
  return (
    <label
      className={`btn-file-input${className ? ` ${className}` : ''}`}
      aria-disabled={disabled ? true : undefined}
    >
      <input
        type="file"
        className="sr-only"
        accept={accept}
        onChange={onChange}
        disabled={disabled}
        id={id}
      />
      {children}
    </label>
  );
}
