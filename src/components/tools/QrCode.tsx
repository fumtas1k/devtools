import { useState, useEffect, useRef } from 'react';
import qrcode from 'qrcode-generator';
import { bodyEmphasis, caption, micro } from '../../utils/styles';

type ErrorLevel = 'L' | 'M' | 'Q' | 'H';

const ERROR_LEVELS: { value: ErrorLevel; label: string; desc: string }[] = [
  { value: 'L', label: 'L', desc: '7%' },
  { value: 'M', label: 'M', desc: '15%' },
  { value: 'Q', label: 'Q', desc: '25%' },
  { value: 'H', label: 'H', desc: '30%' },
];

function generateQrSvg(text: string, errorLevel: ErrorLevel): string | null {
  if (!text) return null;
  try {
    const qr = qrcode(0, errorLevel);
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ scalable: true });
  } catch {
    return null;
  }
}

export function QrCode() {
  const [text, setText] = useState('');
  const [errorLevel, setErrorLevel] = useState<ErrorLevel>('M');
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!text.trim()) {
      setSvgHtml(null);
      setError('');
      return;
    }
    const svg = generateQrSvg(text.trim(), errorLevel);
    if (svg) {
      setSvgHtml(svg);
      setError('');
    } else {
      setSvgHtml(null);
      setError('QRコードを生成できませんでした。テキストが長すぎる可能性があります。');
    }
  }, [text, errorLevel]);

  const handleDownload = () => {
    if (!containerRef.current) return;
    const svgEl = containerRef.current.querySelector('svg');
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qrcode.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* テキスト入力 */}
      <div>
        <label
          htmlFor="qr-text"
          style={{ ...bodyEmphasis, color: '#1d1d1f', display: 'block', marginBottom: '0.25rem' }}
        >
          テキスト / URL
        </label>
        <textarea
          id="qr-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://example.com"
          rows={3}
          className="w-full rounded-lg px-3 py-2"
          style={{
            ...caption,
            border: '1px solid rgba(0,0,0,0.2)',
            outline: 'none',
            background: '#ffffff',
            color: '#1d1d1f',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
          onFocus={(e) => { e.target.style.outline = '2px solid #0071e3'; e.target.style.outlineOffset = '2px'; }}
          onBlur={(e) => { e.target.style.outline = 'none'; }}
        />
      </div>

      {/* 誤り訂正レベル */}
      <div>
        <p style={{ ...bodyEmphasis, color: '#1d1d1f', marginBottom: '0.25rem' }}>誤り訂正レベル</p>
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: '1px solid rgba(0,0,0,0.2)', display: 'inline-flex' }}
            role="group"
            aria-label="誤り訂正レベル"
          >
            {ERROR_LEVELS.map(({ value, label }, i) => (
              <button
                key={value}
                onClick={() => setErrorLevel(value)}
                style={{
                  ...caption,
                  padding: '0.5rem 1rem',
                  background: errorLevel === value ? '#0071e3' : '#ffffff',
                  color: errorLevel === value ? '#ffffff' : 'rgba(0,0,0,0.6)',
                  border: 'none',
                  borderRight: i < ERROR_LEVELS.length - 1 ? '1px solid rgba(0,0,0,0.2)' : 'none',
                  cursor: 'pointer',
                  fontWeight: errorLevel === value ? 600 : 400,
                }}
                aria-pressed={errorLevel === value}
              >
                {label}
              </button>
            ))}
          </div>
          <span style={{ ...micro, color: 'rgba(0,0,0,0.48)' }}>
            復元率: {ERROR_LEVELS.find(e => e.value === errorLevel)?.desc}
          </span>
        </div>
      </div>

      {/* エラー */}
      {error && (
        <p style={{ ...caption, color: '#d70015' }}>{error}</p>
      )}

      {/* QRコード表示 */}
      {svgHtml && (
        <div className="rounded-lg" style={{ border: '1px solid rgba(0,0,0,0.12)', overflow: 'hidden' }}>
          <div
            className="flex items-center justify-between gap-2 px-4 py-3"
            style={{ background: '#f5f5f7', borderBottom: '1px solid rgba(0,0,0,0.1)' }}
          >
            <span style={{ ...bodyEmphasis, color: '#1d1d1f' }}>プレビュー</span>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5"
              style={{
                ...caption,
                fontWeight: 600,
                background: '#f5f5f7',
                color: 'rgba(0,0,0,0.8)',
                border: '1px solid rgba(0,0,0,0.15)',
                cursor: 'pointer',
              }}
            >
              SVG ダウンロード
            </button>
          </div>
          <div className="flex justify-center p-8" style={{ background: '#ffffff' }}>
            <div
              ref={containerRef}
              style={{ width: '200px', height: '200px' }}
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
