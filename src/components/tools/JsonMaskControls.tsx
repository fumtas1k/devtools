import { MASK_CATEGORIES, type MaskCategory } from '@/utils/json-formatter';
import { ToggleChips } from '@/components/ui/ToggleChips';

const CATEGORY_LABEL: Record<MaskCategory, string> = {
  SECRET: 'キー名',
  EMAIL: 'メール',
  JWT: 'JWT',
  IP: 'IP',
  CREDIT_CARD: 'カード番号',
  PHONE_JP: '電話番号',
};

interface Props {
  /** 種別別の検出件数。未評価（入力空/不正）のときは null。 */
  counts: Record<MaskCategory, number> | null;
  /** 種別ごとのオン/オフ状態 */
  enabled: Record<MaskCategory, boolean>;
  /** 種別トグルのハンドラ */
  onToggle: (cat: MaskCategory) => void;
}

/**
 * マスクモードの操作部（種別トグルチップ＋ゼロ時メッセージ）。
 * 入力・結果の上端を揃えるため、結果カラム内ではなく入力/結果行の上に全幅で配置する。
 */
export function JsonMaskControls({ counts, enabled, onToggle }: Props) {
  const hasDetected = counts ? MASK_CATEGORIES.some((c) => counts[c] > 0) : false;
  // SR 向けの検出サマリ。視覚はチップ内バッジで示し、動的件数はこの live region で読み上げる。
  const announcement =
    counts == null
      ? ''
      : hasDetected
        ? `${MASK_CATEGORIES.filter((c) => counts[c] > 0)
            .map((c) => `${CATEGORY_LABEL[c]}${counts[c]}件`)
            .join('、')}を検出しました。`
        : '検出された機密データはありません。';
  return (
    <div>
      {/* マスク対象の種別トグルチップ */}
      <ToggleChips
        legend="マスク対象"
        options={MASK_CATEGORIES.map((cat) => ({
          value: cat,
          label: CATEGORY_LABEL[cat],
          count: counts?.[cat] ?? 0,
        }))}
        selected={(c) => enabled[c]}
        onToggle={onToggle}
      />

      {/* 検出状態を SR へ通知する常設 live region。視覚はチップ内バッジ／下のゼロ時メッセージで示すため sr-only。 */}
      <p className="sr-only" role="status" aria-live="polite" data-testid="mask-announcement">
        {announcement}
      </p>

      {/* 検出ゼロ時の可視メッセージ。読み上げは上の live region 済みのため aria-hidden で二重通知を防ぐ。 */}
      {counts && !hasDetected && (
        <p className="caption text-muted mt-1" aria-hidden="true">
          検出された機密データはありません。
        </p>
      )}
    </div>
  );
}
