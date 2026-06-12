import { useState, useCallback } from 'react';
import { InputField } from '@/components/ui/InputField';
import { CopyButton } from '@/components/ui/CopyButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { scrubText } from '@/utils/secret-scrubber/scrub';
import {
  SCRUB_CATEGORIES,
  CATEGORY_LABEL,
  DEFAULT_ENABLED,
  emptyCounts,
} from '@/utils/secret-scrubber/rules';
import type { ScrubCategory } from '@/utils/secret-scrubber/rules';
import { useDebouncedTransform } from '@/hooks/useDebouncedTransform';

// サンプル入力（AWS 例示キー・メール・IP・password= 代入式・JWT を含む架空のログ）
const SAMPLE_INPUT = `# アプリケーション設定（サンプル）
aws_access_key=AKIAIOSFODNN7EXAMPLE
aws_secret=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
database_url=postgres://dbuser:p@ssw0rd-secret@db.example.com/mydb
contact_email=admin@example.com
server_ip=203.0.113.42
support_phone=03-1234-5678
jwt_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c`;

/** 空の ScrubResult（安定参照） */
const EMPTY_RESULT = {
  output: '',
  findings: [],
  counts: emptyCounts(),
};

export function SecretScrubberTool() {
  const [input, setInput] = useState('');
  const [enabled, setEnabled] = useState<Record<ScrubCategory, boolean>>({ ...DEFAULT_ENABLED });

  // トグル変更ハンドラ
  const handleToggle = useCallback((cat: ScrubCategory) => {
    setEnabled((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  // debounce 付き scrubText 変換
  const { result, isPending } = useDebouncedTransform(
    input.length > 0 ? input : null,
    (text) => scrubText(text, enabled),
    EMPTY_RESULT,
    [enabled],
    { fallbackError: 'マスク処理に失敗しました' }
  );

  // 入力があるときの出力（空入力は空表示）。
  // debounce 中（isPending）も前回結果を保持し、キーストロークごとのフリッカーを避ける
  const outputText = input.length > 0 ? result.output : '';

  // カウント（入力が空・初回未評価のときは null）。pending 中は前回値を保持してバッジの 0 フリッカーを避ける
  const counts = input.length > 0 && result !== EMPTY_RESULT ? result.counts : null;

  const hasDetected = counts ? SCRUB_CATEGORIES.some((c) => counts[c] > 0) : false;

  // SR 向けアナウンス
  const announcement =
    counts == null
      ? ''
      : hasDetected
        ? `${SCRUB_CATEGORIES.filter((c) => counts[c] > 0)
            .map((c) => `${CATEGORY_LABEL[c]}${counts[c]}件`)
            .join('、')}を検出しました。`
        : '検出された機密データはありません。';

  return (
    <div className="space-y-6">
      {/* 入力 */}
      <InputField
        id="secret-scrubber-input"
        label="テキストを貼り付け"
        value={input}
        onChange={setInput}
        placeholder="ログ・設定ファイル・コードを貼り付けてください"
        multiline
        rows={10}
        mono
        onSampleClick={() => setInput(SAMPLE_INPUT)}
      />

      {/* マスク対象トグルチップ */}
      <div>
        <ToggleChips
          legend="マスク対象"
          options={SCRUB_CATEGORIES.map((cat) => ({
            value: cat,
            label: CATEGORY_LABEL[cat],
            count: counts?.[cat] ?? 0,
          }))}
          selected={(c) => enabled[c]}
          onToggle={handleToggle}
        />

        {/* SR 向けの検出件数アナウンス（常設 live region）。視覚はチップバッジで示す */}
        <p className="sr-only" role="status" aria-live="polite" data-testid="scrubber-announcement">
          {announcement}
        </p>

        {/* 検出ゼロ時の可視メッセージ。読み上げは上の live region 済みのため aria-hidden。
            pending 中は前回入力に対する「ありません」を出さない */}
        {counts && !hasDetected && !isPending && (
          <p
            className="caption text-muted mt-1"
            aria-hidden="true"
            data-testid="scrubber-no-detect"
          >
            検出された機密データはありません。
          </p>
        )}
      </div>

      {/* 出力 */}
      {input.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 min-h-8">
            <span className="body-emphasis text-default">マスク済みテキスト</span>
            <CopyButton text={outputText} label="コピー" ariaLabel="出力テキストをコピー" />
          </div>
          {/* aria-live は付けない: 全文が変更のたびに読み上げ対象になり、上の sr-only
              status region（件数サマリ）と二重アナウンスになるため（PR #631 レビュー指摘） */}
          <textarea
            id="secret-scrubber-output"
            readOnly
            value={outputText}
            rows={10}
            aria-label="マスク済みテキスト"
            aria-busy={isPending}
            className="caption w-full rounded-lg px-3 py-2 border border-input bg-surface font-mono resize-none"
          />
        </div>
      )}

      {/* クリア */}
      {input.length > 0 && (
        <div className="flex justify-end">
          <ClearButton
            onClick={() => {
              setInput('');
            }}
          />
        </div>
      )}
    </div>
  );
}
