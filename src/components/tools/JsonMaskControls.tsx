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

      {/* 検出ゼロ時のみメッセージを表示。検出ありはチップ内バッジで確認できる。
          role="status" aria-live="polite" で SR へ状態変化を通知する。 */}
      {counts && !hasDetected && (
        <p className="caption text-muted mt-1" role="status" aria-live="polite">
          検出された機密データはありません。
        </p>
      )}
    </div>
  );
}
