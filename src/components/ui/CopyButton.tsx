import { useState } from 'react';
import { copyToClipboard } from '../../utils/clipboard';

interface Props {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label = 'コピー', className = '' }: Props) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleClick}
      aria-label={copied ? 'コピーしました' : label}
      className={`inline-flex items-center gap-1.5 rounded px-3 py-2 font-bold transition-colors ${className}`}
      style={{
        fontSize: '0.875rem',
        lineHeight: 1,
        letterSpacing: '0.02em',
        background: copied ? '#F0FDF4' : '#F3F4F6',
        color: copied ? '#16A34A' : '#111827',
        border: `1px solid ${copied ? '#16A34A' : '#E5E7EB'}`,
      }}
    >
      {copied ? '✓ コピーしました' : `📋 ${label}`}
    </button>
  );
}
