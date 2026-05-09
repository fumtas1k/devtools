import { useState, useMemo } from 'react';
import { Section } from '@/components/ui/Section';
import { InputField } from '@/components/ui/InputField';
import { ClearButton } from '@/components/ui/ClearButton';
import { BareInput } from '@/components/ui/BareInput';
import { count } from '@/utils/char-count';
import type { EncodingCompat } from '@/utils/char-count/types';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

function formatBreakdown(bd: EncodingCompat['breakdown']): string {
  const parts: string[] = [];
  if (bd.emoji > 0) parts.push(`絵文字 ${bd.emoji}`);
  if (bd.zwj > 0) parts.push(`ZWJ ${bd.zwj}`);
  if (bd.vs > 0) parts.push(`VS ${bd.vs}`);
  if (bd.cjkExt > 0) parts.push(`CJK拡張 ${bd.cjkExt}`);
  if (bd.other > 0) parts.push(`その他 ${bd.other}`);
  return parts.join(' / ');
}

function EncRow({ label, compat }: { label: string; compat: EncodingCompat }) {
  const breakdown = !compat.ok ? formatBreakdown(compat.breakdown) : '';
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
            {breakdown ? ` (${breakdown})` : ''}
          </span>
        )}
      </dd>
    </>
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

  function handleSnsLimitChange(val: string) {
    const n = parseInt(val, 10);
    setSnsLimit(isNaN(n) || n < 1 ? '1' : val);
  }

  const { chars, bytes: enc, lines, sns, manuscript } = result;
  const snsLimitNum = Math.max(1, parseInt(snsLimit, 10) || 1);
  const snsRemaining = snsLimitNum - chars.graphemes;

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
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 mb-3">
          <dt className="caption text-muted">
            Twitter weight <span className="caption text-muted">（概算）</span>
          </dt>
          <dd className="caption font-mono text-right">{sns.twitterWeight} / 280</dd>
          <dt className="caption text-muted">Bluesky</dt>
          <dd className="caption font-mono text-right">{sns.blueskyCount} / 300</dd>
        </dl>
        <div className="flex items-center gap-2 caption text-muted">
          <BareInput
            type="number"
            inputMode="numeric"
            value={snsLimit}
            onChange={handleSnsLimitChange}
            aria-label="任意上限"
            className="w-20"
            min="1"
          />
          <span>上限　残り:</span>
          <span className={`font-mono${snsRemaining < 0 ? ' text-error' : ''}`}>
            {snsRemaining}
          </span>
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
