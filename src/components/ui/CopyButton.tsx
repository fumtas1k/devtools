import { useState, useEffect, useRef } from 'react';
import { copyToClipboard } from '@/utils/clipboard';
import { COMPACT_BUTTON_SHAPE_CLASSES } from './_compactButton';

function ClipboardIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CopyAnnounce({ copied }: { copied: boolean }) {
  if (!copied) return null;
  return (
    <span role="status" aria-live="polite" className="sr-only">
      コピーしました
    </span>
  );
}

interface Props {
  text: string;
  label?: string;
  /**
   * スクリーンリーダー向けのアクセシブル名。可視テキスト（label）を短くしつつ
   * 文脈を残したい場合に指定する。未指定時は label をそのまま使う。
   * WCAG 2.5.3 (Label in Name) のため label が ariaLabel に内包される値にすること。
   */
  ariaLabel?: string;
  className?: string;
  /** テーブル行など狭い場所向けのコンパクト表示 */
  compact?: boolean;
}

/**
 * クリップボードコピー用ボタン。
 *
 * style: global.css `@layer components` の `.btn-copy` / `.btn-copy.is-copied` /
 * `.btn-copy.is-compact` を参照。状態は `is-copied` / `is-compact` className で切替。
 *
 * default 表示の角丸は COMPACT_BUTTON_SHAPE_CLASSES 経由で ActionButton (size="compact") /
 * DownloadButton と統一（rounded-lg / issue #320）。
 */
export function CopyButton({
  text,
  label = 'コピー',
  ariaLabel,
  className = '',
  compact = false,
}: Props) {
  const accessibleName = ariaLabel ?? label;
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  const stateClass = copied ? 'is-copied' : '';

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={accessibleName}
        className={`btn-copy is-compact ${stateClass} rounded-md inline-flex items-center justify-center text-xs px-2 py-1 min-w-8 min-h-8 whitespace-nowrap`.trim()}
      >
        {copied ? <CheckIcon /> : <ClipboardIcon />}
        <CopyAnnounce copied={copied} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={accessibleName}
      className={`btn-copy ${stateClass} caption inline-flex items-center gap-1.5 ${COMPACT_BUTTON_SHAPE_CLASSES} tracking-wide whitespace-nowrap ${className}`.trim()}
    >
      {copied ? <CheckIcon /> : <ClipboardIcon />}
      {label}
      <CopyAnnounce copied={copied} />
    </button>
  );
}
