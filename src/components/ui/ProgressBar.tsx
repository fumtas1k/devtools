import { useDynamicStyleSheet } from '@/hooks/useDynamicStyleSheet';
import { cx } from '@/utils/cx';

type ProgressBarProps = {
  current: number;
  max: number;
  /** 上限超過時の補助テキスト (例: "X 仕様準拠") を a11y で関連付けるための id */
  'aria-describedby'?: string;
};

/**
 * 進捗バー (current / max)。
 * - max=0 なら描画しない (任意上限の空欄想定)
 * - current が max 以下: 単一の filled セグメント
 * - current が max 超: filled (max ぶん) + overflow (超過分、最大 100% で clamp)
 *   - overflow 幅は max を 100% とした超過率 (clamp at 100%、超過 200% 以上はラベルで表示)
 *
 * a11y:
 * - role="progressbar"
 * - aria-valuemin / valuemax / valuenow (valuenow は max で clamp)
 * - aria-valuetext で 100% 超時に「上限超過」を通知
 *
 * 幅の動的変化は useDynamicStyleSheet 経由の CSS カスタムプロパティで制御。
 * inline style / setProperty() は CSP3 style-src 制約に抵触するため不採用
 * (docs/decisions.md [067])。
 */
export function ProgressBar({ current, max, 'aria-describedby': describedBy }: ProgressBarProps) {
  const isOver = max > 0 && current > max;
  const fillPct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const overflowPct = isOver ? Math.min(((current - max) / max) * 100, 100) : 0;

  const dynClassName = useDynamicStyleSheet((className) => {
    if (max <= 0) return '';
    return [
      `.${className} .progress-fill { --progress-fill-width: ${fillPct}%; }`,
      isOver
        ? `.${className} .progress-overflow { --progress-overflow-width: ${overflowPct}%; }`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  // useDynamicStyleSheet は hook のため early return より先に呼ぶ必要がある (Rules of Hooks)。
  // max <= 0 の場合 hook 内で空ルールを返し、ここで描画を抑止する。
  if (max <= 0) return null;

  const valuenow = Math.min(current, max);
  const valuetext = isOver
    ? `${current} / ${max} (上限超過 +${current - max})`
    : `${current} / ${max}`;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={valuenow}
      aria-valuetext={valuetext}
      aria-describedby={describedBy}
      className={cx('progress-track', dynClassName)}
    >
      <span className="progress-fill" aria-hidden="true" />
      {isOver && <span className="progress-overflow" aria-hidden="true" />}
    </div>
  );
}
