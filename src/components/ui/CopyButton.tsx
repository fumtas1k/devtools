import { useState, useEffect, useRef } from 'react';
import { copyToClipboard } from '@/utils/clipboard';

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
  className?: string;
  /** テーブル行など狭い場所向けのコンパクト表示 */
  compact?: boolean;
}

/**
 * クリップボードコピー用ボタン。
 *
 * style: global.css `@layer components` の `.btn-copy` / `.btn-copy.is-copied` /
 * `.btn-copy.is-compact` を参照。状態は `is-copied` / `is-compact` className で切替。
 */
export function CopyButton({ text, label = 'コピー', className = '', compact = false }: Props) {
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
        onClick={handleClick}
        aria-label={label}
        className={`btn-copy is-compact ${stateClass} rounded-md inline-flex items-center justify-center text-xs px-2 py-1 min-w-8 min-h-8 whitespace-nowrap`.trim()}
      >
        {copied ? <CheckIcon /> : <ClipboardIcon />}
        <CopyAnnounce copied={copied} />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      aria-label={label}
      className={`btn-copy ${stateClass} caption font-bold inline-flex items-center gap-1.5 rounded px-3 py-2 leading-none tracking-wide whitespace-nowrap ${className}`.trim()}
    >
      {copied ? <CheckIcon /> : <ClipboardIcon />}
      {label}
      <CopyAnnounce copied={copied} />
    </button>
  );
}
