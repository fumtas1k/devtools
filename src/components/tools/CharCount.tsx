import { useState, useMemo, type ReactNode } from 'react';
import { Section } from '@/components/ui/Section';
import { InputField } from '@/components/ui/InputField';
import { ClearButton } from '@/components/ui/ClearButton';
import { BareInput } from '@/components/ui/BareInput';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { count } from '@/utils/char-count';
import type { EncodingCompat } from '@/utils/char-count/types';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

function EncRow({ label, compat }: { label: string; compat: EncodingCompat }) {
  return (
    <>
      <dt className="caption text-muted">{label}</dt>
      <dd className="caption font-mono text-right">
        {compat.ok ? (
          <span className="text-success">
            <span aria-hidden="true">✅</span>
            <span className="sr-only">対応</span>
            {compat.bytes != null ? ` ${compat.bytes} byte` : ''}
          </span>
        ) : (
          <span className="text-error">
            <span aria-hidden="true">❌</span>
            <span className="sr-only">不可</span>
            {` 不可: ${compat.failedCount} 文字`}
          </span>
        )}
      </dd>
    </>
  );
}

type SnsCardProps = {
  title: string;
  method: string;
  caption: string;
  current: number;
  limit: number;
  isOver: boolean;
  /** 「current / limit」表示を任意上限 input と組合わせる場合に渡す */
  limitNode?: ReactNode;
  /** caption 用 id (aria-describedby に使用) */
  captionId: string;
};

function SnsCard({
  title,
  method,
  caption,
  current,
  limit,
  isOver,
  limitNode,
  captionId,
}: SnsCardProps) {
  return (
    <article className="border-default rounded-md border p-3 flex flex-col gap-2">
      <div>
        <p className="caption font-bold">{title}</p>
        <p className="caption text-muted">{method}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`font-mono${isOver ? ' text-error' : ''}`}>{current}</span>
        <span className="text-muted">/</span>
        {limitNode ?? <span className="font-mono text-muted">{limit}</span>}
        {isOver && <span className="sr-only"> 上限超過</span>}
      </div>
      <ProgressBar current={current} max={limit} aria-describedby={captionId} />
      <p id={captionId} className="caption text-muted">
        {caption}
        {isOver && <span className="text-error"> (+{current - limit} over)</span>}
      </p>
    </article>
  );
}

export function CharCountTool() {
  const [text, setText] = useState('');
  const [snsLimit, setSnsLimit] = useState('280');

  const debouncedText = useDebouncedValue(text, 100);
  const result = useMemo(() => count(debouncedText), [debouncedText]);

  function handleClear() {
    setText('');
  }

  // 入力 validator: 空文字または「先頭ゼロを含まない 1 以上の整数」のみ受理。
  // setState されない値は controlled input が直前値を保持する (UI 上 reject)。
  function handleSnsLimitChange(val: string) {
    if (val === '' || /^[1-9]\d*$/.test(val)) {
      setSnsLimit(val);
    }
  }

  const { chars, bytes: enc, lines, sns, manuscript } = result;
  // 任意上限の数値化 (空欄なら null)。validator により先頭ゼロ・0・空以外は ≥1 整数のみ通過する
  const customLimit = snsLimit === '' ? null : parseInt(snsLimit, 10);
  // 各 SNS 上限の超過判定をまとめて算出 (色変更と SR 通知で共通参照)
  const isOver = useMemo(
    () => ({
      twitter: sns.twitterWeight > 280,
      bluesky: sns.blueskyCount > 300,
      custom: customLimit !== null && chars.graphemes > customLimit,
    }),
    [sns.twitterWeight, sns.blueskyCount, customLimit, chars.graphemes]
  );

  return (
    <div className="space-y-6">
      <InputField
        id="char-count-input"
        label="入力テキスト"
        value={text}
        onChange={setText}
        multiline
        rows={8}
        mono
        resize
        placeholder="テキストを入力してください"
      />

      {/* 1. 文字数 */}
      <Section title="文字数">
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <dt className="caption text-muted">JS .length (UTF-16)</dt>
          <dd className="caption font-mono text-right">{chars.utf16Length}</dd>
          <dt className="caption text-muted">Unicode code points</dt>
          <dd className="caption font-mono text-right">{chars.codePoints}</dd>
          <dt className="caption text-muted">書記素 (Intl.Segmenter)</dt>
          <dd className="caption font-mono text-right">{chars.graphemes}</dd>
          <dt className="caption text-muted">書記素 (改行除く)</dt>
          <dd className="caption font-mono text-right">{chars.graphemesNoNewline}</dd>
          <dt className="caption text-muted">書記素 (空白除く)</dt>
          <dd className="caption font-mono text-right">{chars.graphemesNoWhitespace}</dd>
          <dt className="caption text-muted">半角0.5・全角1換算</dt>
          <dd className="caption font-mono text-right">{chars.weightedWidth}</dd>
          <dt className="caption text-muted">VARCHAR 最小長 (utf8mb4)</dt>
          <dd className="caption font-mono text-right">{chars.codePoints}</dd>
        </dl>
      </Section>

      {/* 2. エンコーディング互換性 */}
      <Section title="エンコーディング互換性" role="status" aria-live="polite">
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <EncRow label="UTF-8 (utf8mb4)" compat={enc.utf8} />
          <EncRow label="UTF-8 BMP only (utf8mb3)" compat={enc.utf8Bmp} />
          <EncRow label="UTF-16" compat={enc.utf16} />
          <EncRow label="Shift_JIS" compat={enc.sjis} />
          <EncRow label="EUC-JP" compat={enc.eucjp} />
        </dl>
      </Section>

      {/* 3. 行 */}
      <Section title="行" role="status" aria-live="polite">
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <dt className="caption text-muted">総行数</dt>
          <dd className="caption font-mono text-right">{lines.total}</dd>
          <dt className="caption text-muted">空行除外行数</dt>
          <dd className="caption font-mono text-right">{lines.nonEmpty}</dd>
          <dt className="caption text-muted">最長行 (書記素)</dt>
          <dd className="caption font-mono text-right">{lines.longestGraphemes}</dd>
          <dt className="caption text-muted">改行コード</dt>
          <dd
            className={`caption font-mono text-right${lines.newline === 'mixed' ? ' text-warning' : ''}`}
          >
            {lines.newline === 'lf' && 'LF'}
            {lines.newline === 'crlf' && 'CRLF'}
            {lines.newline === 'cr' && 'CR'}
            {lines.newline === 'mixed' && '混在 ⚠'}
            {lines.newline === 'none' && 'なし'}
          </dd>
        </dl>
        {lines.newline === 'mixed' && (
          <p className="caption text-warning mt-2">
            改行コードが混在しています (LF: {lines.counts.lf}, CRLF: {lines.counts.crlf}, CR:{' '}
            {lines.counts.cr})
          </p>
        )}
      </Section>

      {/* 4. SNS */}
      <Section title="SNS" role="status" aria-live="polite">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SnsCard
            title="X (旧 Twitter)"
            method="Twitter weight"
            caption="URL を 23 字換算、CJK は 2 weight"
            current={sns.twitterWeight}
            limit={280}
            isOver={isOver.twitter}
            captionId="sns-card-x-caption"
          />
          <SnsCard
            title="Bluesky"
            method="書記素 (grapheme)"
            caption="絵文字や合字も 1 文字として計上"
            current={sns.blueskyCount}
            limit={300}
            isOver={isOver.bluesky}
            captionId="sns-card-bluesky-caption"
          />
          <SnsCard
            title="任意上限"
            method="書記素"
            caption="書記素クラスタ単位で計上"
            current={chars.graphemes}
            limit={customLimit ?? 0}
            isOver={isOver.custom}
            captionId="sns-card-custom-caption"
            limitNode={
              <span className="inline-block w-20">
                <BareInput
                  type="number"
                  inputMode="numeric"
                  value={snsLimit}
                  onChange={handleSnsLimitChange}
                  aria-label="任意上限"
                  min="1"
                />
              </span>
            }
          />
        </div>
      </Section>

      {/* 5. 原稿 */}
      <Section title="原稿">
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <dt className="caption text-muted">400字原稿用紙</dt>
          <dd className="caption font-mono text-right">{manuscript.genkoSheets} 枚</dd>
          <dt className="caption text-muted">段落数</dt>
          <dd className="caption font-mono text-right">{manuscript.paragraphs}</dd>
          <dt className="caption text-muted">
            推定読了時間 <span className="caption text-muted">（概算）</span>
          </dt>
          <dd className="caption font-mono text-right">{manuscript.readingMinutes} 分</dd>
          <dt className="caption text-muted">英単語数 概算</dt>
          <dd className="caption font-mono text-right">{manuscript.englishWords}</dd>
        </dl>
      </Section>

      <div className="flex justify-end">
        <ClearButton onClick={handleClear} />
      </div>
    </div>
  );
}
