import { useState, type CSSProperties } from 'react';
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

  /* Caption Bold: 14px weight 600, line-height 1.29, tracking -0.224px */
  const baseStyle: CSSProperties = {
    fontSize: '0.875rem',
    fontWeight: 600,
    lineHeight: 1.29,
    letterSpacing: '-0.224px',
  };

  return (
    <button
      onClick={handleClick}
      aria-label={copied ? 'コピーしました' : label}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${className}`}
      style={{
        ...baseStyle,
        background: copied ? '#e3f5e1' : '#f5f5f7',
        color: copied ? '#1a6b1a' : 'rgba(0,0,0,0.8)',
      }}
    >
      {copied ? '✓ コピーしました' : `📋 ${label}`}
    </button>
  );
}
