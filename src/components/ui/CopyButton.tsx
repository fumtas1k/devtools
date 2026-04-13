import { useState } from 'react';
import { copyToClipboard } from '@/utils/clipboard';
import { colors } from '@/utils/styles';

interface Props {
  text: string;
  label?: string;
  className?: string;
  /** テーブル行など狭い場所向けのコンパクト表示 */
  compact?: boolean;
}

export function CopyButton({ text, label = 'コピー', className = '', compact = false }: Props) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
        {copied ? '✓' : '📋'}
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
      {copied ? '✓ コピーしました' : `📋 ${label}`}
    </button>
  );
}
