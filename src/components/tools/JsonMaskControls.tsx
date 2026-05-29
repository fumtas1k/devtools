import { MASK_CATEGORIES, type MaskCategory } from '@/utils/json-formatter';

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
 * マスクモードの操作部（種別トグル＋検出内訳バッジ）。
 * 入力・結果の上端を揃えるため、結果カラム内ではなく入力/結果行の上に全幅で配置する。
 */
export function JsonMaskControls({ counts, enabled, onToggle }: Props) {
  const detected = counts ? MASK_CATEGORIES.filter((c) => counts[c] > 0) : [];
  return (
    <div>
      {/* マスク対象の種別トグル */}
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <legend className="caption text-muted">マスク対象</legend>
        {MASK_CATEGORIES.map((cat) => (
          <label key={cat} className="caption inline-flex items-center gap-1">
            <input
              type="checkbox"
              className="accent-link"
              checked={enabled[cat]}
              onChange={() => onToggle(cat)}
            />
            {CATEGORY_LABEL[cat]}
          </label>
        ))}
      </fieldset>

      {/* 検出内訳バッジ */}
      {counts && (
        <p className="caption text-muted mt-1" role="status" aria-live="polite">
          {detected.length === 0
            ? '検出された機密データはありません。'
            : '検出: ' + detected.map((c) => `${CATEGORY_LABEL[c]} ${counts[c]}`).join(' ・ ')}
        </p>
      )}
    </div>
  );
}
