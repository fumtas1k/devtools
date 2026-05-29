import type { ReactNode } from 'react';
import { OutputField } from '@/components/ui/OutputField';
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
  /** マスク済み JSON 文字列 */
  output: string;
  /** 種別別の検出件数。未評価（入力空/不正）のときは null。 */
  counts: Record<MaskCategory, number> | null;
  /** 種別ごとのオン/オフ状態 */
  enabled: Record<MaskCategory, boolean>;
  /** 種別トグルのハンドラ */
  onToggle: (cat: MaskCategory) => void;
  /** ラベル右に並べる要素（ダウンロードボタン） */
  rightSlot: ReactNode;
}

/**
 * マスクモードの結果パネル。種別トグル＋検出内訳バッジ＋共通 OutputField を描画する。
 * 出力は共通 OutputField を再利用（aria-live ラップ・コピー内蔵）。CLAUDE.md §5。
 */
export function JsonMaskResult({ output, counts, enabled, onToggle, rightSlot }: Props) {
  const detected = counts ? MASK_CATEGORIES.filter((c) => counts[c] > 0) : [];
  return (
    <div className="w-full">
      {/* マスク対象の種別トグル */}
      <fieldset className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
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
        <p className="caption text-muted mb-2" role="status" aria-live="polite">
          {detected.length === 0
            ? '検出された機密データはありません。'
            : '検出: ' + detected.map((c) => `${CATEGORY_LABEL[c]} ${counts[c]}`).join(' ・ ')}
        </p>
      )}

      <OutputField
        id="json-formatter-mask-output"
        label="結果（マスク済み）"
        value={output}
        rows={16}
        ariaLabel="マスク済み結果"
        rightSlot={rightSlot}
      />
    </div>
  );
}
