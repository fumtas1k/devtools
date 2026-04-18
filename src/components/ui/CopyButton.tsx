import { useState, useEffect, useRef } from 'react';
import { copyToClipboard } from '@/utils/clipboard';
import { colors } from '@/utils/styles';

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

interface Props {
  text: string;
  label?: string;
  className?: string;
  /** テーブル行など狭い場所向けのコンパクト表示 */
  compact?: boolean;
}

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

  if (compact) {
    return (
      <button
        onClick={handleClick}
        aria-label={copied ? 'コピーしました' : label}
        className="rounded-md transition-colors"
        style={{
          fontSize: '0.75rem',
          padding: '0.25rem 0.5rem',
          background: copied ? colors.successBg : colors.bgSubtle,
          color: copied ? colors.success : colors.muted,
          border: 'none',
          cursor: 'pointer',
          whiteSpace: 'nowrap' as const,
        }}
      >
        {copied ? <CheckIcon /> : <ClipboardIcon />}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      aria-label={copied ? 'コピーしました' : label}
      className={`inline-flex items-center gap-1.5 rounded px-3 py-2 font-bold transition-colors whitespace-nowrap ${className}`}
      style={{
        fontSize: '0.875rem',
        lineHeight: 1,
        letterSpacing: '0.02em',
        background: copied ? colors.successBg : colors.bgSubtle,
        color: copied ? colors.success : colors.text,
        border: `1px solid ${copied ? colors.success : colors.border}`,
      }}
    >
      {copied ? <><CheckIcon /> コピーしました</> : <><ClipboardIcon /> {label}</>}
    </button>
  );
}
