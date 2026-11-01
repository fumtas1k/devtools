import { useState, type ReactNode } from 'react';
import { cx } from '@/utils/cx';
import { Section } from '@/components/ui/Section';
import { InputField } from '@/components/ui/InputField';
import { ClearButton } from '@/components/ui/ClearButton';
import { BareInput } from '@/components/ui/BareInput';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { StatusIcon } from '@/components/ui/StatusIcon';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { useCharCount } from '@/hooks/useCharCount';
import type { EncodingCompat } from '@/utils/char-count/types';

function EncRow({ label, compat }: { label: string; compat: EncodingCompat | undefined }) {
  return (
    <>
      <dt className="caption text-muted">{label}</dt>
      <dd className="caption font-mono text-right">
        {!compat ? (
          '—'
        ) : compat.ok ? (
          <span className="text-success">
            <StatusIcon variant="success" />
            <span className="sr-only">対応</span>
            {compat.bytes != null ? ` ${compat.bytes} byte` : ''}
          </span>
        ) : (
          <span className="text-error">
            <StatusIcon variant="error" />
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
  current: number | undefined;
  limit: number;
  isOver: boolean;
  /** 「current / limit」表示を任意上限 input と組合わせる場合に渡す */
  limitNode?: ReactNode;
  /** title 用 id (article の aria-labelledby に使用) */
  titleId: string;
  /** caption 用 id (ProgressBar の aria-describedby に使用) */
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
  titleId,
  captionId,
}: SnsCardProps) {
  return (
    <article
      aria-labelledby={titleId}
      className="border-default rounded-lg border p-3 flex h-full flex-col gap-2"
    >
      <div>
        <p id={titleId} className="caption font-bold">
          {title}
        </p>
        <p className="caption text-muted">{method}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cx('font-mono', isOver && 'text-error')}>{current ?? '—'}</span>
        <span className="text-muted">/</span>
        {limitNode ?? <span className="font-mono text-muted">{limit}</span>}
        {isOver && <span className="sr-only"> 上限超過</span>}
      </div>
      {current !== undefined && (
        <ProgressBar current={current} max={limit} aria-describedby={captionId} />
      )}
      <p id={captionId} className="caption text-muted">
        {caption}
        {isOver && current !== undefined && (
          <span className="text-error"> (+{current - limit} 超過)</span>
        )}
      </p>
    </article>
  );
}

export function CharCountTool() {
  const { text, setText, reset, result, isPending, error } = useCharCount();
  const [snsLimit, setSnsLimit] = useState('280');

  // 入力 validator: 空文字または「先頭ゼロを含まない 1 以上の整数」のみ受理。
  // setState されない値は controlled input が直前値を保持する (UI 上 reject)。
  function handleSnsLimitChange(val: string) {
    if (val === '' || /^[1-9]\d*$/.test(val)) {
      setSnsLimit(val);
    }
  }

  const chars = result?.chars;
  const enc = result?.bytes;
  const lines = result?.lines;
  const sns = result?.sns;
  const manuscript = result?.manuscript;
  const customLimit = snsLimit === '' ? null : parseInt(snsLimit, 10);
  const isOver = {
    twitter: sns !== undefined && sns.twitterWeight > 280,
    bluesky: sns !== undefined && sns.blueskyCount > 300,
    custom: chars !== undefined && customLimit !== null && chars.graphemes > customLimit,
  };

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
        busy={isPending}
        placeholder="テキストを入力してください"
      />

      {isPending && (
        <p className="caption text-muted" role="status">
          集計中…（ブラウザ内で処理します）
        </p>
      )}
      {error && <ErrorMessage message={error} />}

      {/* 1. 文字数 */}
      <Section title="文字数">
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <dt className="caption text-muted">JS .length (UTF-16)</dt>
          <dd className="caption font-mono text-right">{chars?.utf16Length ?? '—'}</dd>
          <dt className="caption text-muted">Unicode code points</dt>
          <dd className="caption font-mono text-right">{chars?.codePoints ?? '—'}</dd>
          <dt className="caption text-muted">書記素 (Intl.Segmenter)</dt>
          <dd className="caption font-mono text-right">{chars?.graphemes ?? '—'}</dd>
          <dt className="caption text-muted">書記素 (改行除く)</dt>
          <dd className="caption font-mono text-right">{chars?.graphemesNoNewline ?? '—'}</dd>
          <dt className="caption text-muted">書記素 (空白除く)</dt>
          <dd className="caption font-mono text-right">{chars?.graphemesNoWhitespace ?? '—'}</dd>
          <dt className="caption text-muted">半角0.5・全角1換算</dt>
          <dd className="caption font-mono text-right">{chars?.weightedWidth ?? '—'}</dd>
          <dt className="caption text-muted">VARCHAR 最小長 (utf8mb4)</dt>
          <dd className="caption font-mono text-right">{chars?.codePoints ?? '—'}</dd>
        </dl>
      </Section>

      {/* 2. エンコーディング互換性 */}
      <Section title="エンコーディング互換性" role="status" aria-live="polite">
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <EncRow label="UTF-8 (utf8mb4)" compat={enc?.utf8} />
          <EncRow label="UTF-8 BMP only (utf8mb3)" compat={enc?.utf8Bmp} />
          <EncRow label="UTF-16" compat={enc?.utf16} />
          <EncRow label="Shift_JIS" compat={enc?.sjis} />
          <EncRow label="EUC-JP" compat={enc?.eucjp} />
        </dl>
      </Section>

      {/* 3. 行 */}
      <Section title="行" role="status" aria-live="polite">
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <dt className="caption text-muted">総行数</dt>
          <dd className="caption font-mono text-right">{lines?.total ?? '—'}</dd>
          <dt className="caption text-muted">空行除外行数</dt>
          <dd className="caption font-mono text-right">{lines?.nonEmpty ?? '—'}</dd>
          <dt className="caption text-muted">最長行 (書記素)</dt>
          <dd className="caption font-mono text-right">{lines?.longestGraphemes ?? '—'}</dd>
          <dt className="caption text-muted">改行コード</dt>
          <dd
            className={cx(
              'caption font-mono text-right',
              lines?.newline === 'mixed' && 'text-warning'
            )}
          >
            {!lines && '—'}
            {lines?.newline === 'lf' && 'LF'}
            {lines?.newline === 'crlf' && 'CRLF'}
            {lines?.newline === 'cr' && 'CR'}
            {lines?.newline === 'mixed' && (
              <span>
                混在 <StatusIcon variant="warning" />
                <span className="sr-only">警告</span>
              </span>
            )}
            {lines?.newline === 'none' && 'なし'}
          </dd>
        </dl>
        {lines?.newline === 'mixed' && (
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
            caption="URL を 23 字、CJK は 2 字換算"
            current={sns?.twitterWeight}
            limit={280}
            isOver={isOver.twitter}
            titleId="sns-card-x-title"
            captionId="sns-card-x-caption"
          />
          <SnsCard
            title="Bluesky"
            method="書記素 (grapheme)"
            caption="絵文字や合字も 1 文字として計上"
            current={sns?.blueskyCount}
            limit={300}
            isOver={isOver.bluesky}
            titleId="sns-card-bluesky-title"
            captionId="sns-card-bluesky-caption"
          />
          <SnsCard
            title="任意上限"
            method="書記素"
            caption="書記素クラスタ単位で計上"
            current={chars?.graphemes}
            limit={customLimit ?? 0}
            isOver={isOver.custom}
            titleId="sns-card-custom-title"
            captionId="sns-card-custom-caption"
            limitNode={
              <span className="inline-block w-24">
                <BareInput
                  type="number"
                  inputMode="numeric"
                  value={snsLimit}
                  onChange={handleSnsLimitChange}
                  aria-label="任意上限"
                  min="1"
                  autoComplete="off"
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
          <dd className="caption font-mono text-right">{manuscript?.genkoSheets ?? '—'} 枚</dd>
          <dt className="caption text-muted">段落数</dt>
          <dd className="caption font-mono text-right">{manuscript?.paragraphs ?? '—'}</dd>
          <dt className="caption text-muted">
            推定読了時間 <span className="caption text-muted">（概算）</span>
          </dt>
          <dd className="caption font-mono text-right">{manuscript?.readingMinutes ?? '—'} 分</dd>
          <dt className="caption text-muted">英単語数 概算</dt>
          <dd className="caption font-mono text-right">{manuscript?.englishWords ?? '—'}</dd>
        </dl>
      </Section>

      <div className="flex justify-end">
        <ClearButton onClick={reset} />
      </div>
    </div>
  );
}
