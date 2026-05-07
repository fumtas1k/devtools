import { useState, useEffect, useRef } from 'react';
import qrcode from '@/utils/qrcode';
import { InputField } from '@/components/ui/InputField';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { downloadSvgElement } from '@/utils/download';
import { ToggleGroup } from '@/components/ui/ToggleGroup';

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

export function QrCodeGenerator() {
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
    downloadSvgElement(svgEl, 'qrcode.svg');
  };

  return (
    <div className="space-y-6">
      {/* テキスト入力 */}
      <InputField
        id="qr-text"
        label="テキスト / URL"
        value={text}
        onChange={setText}
        placeholder="https://example.com"
        multiline
        rows={3}
        resize
        onSampleClick={() => setText('https://example.com')}
      />

      {/* 誤り訂正レベル */}
      <div>
        <p className="body-emphasis text-default mb-1">誤り訂正レベル</p>
        <div className="flex items-center gap-2 flex-wrap">
          <ToggleGroup
            options={ERROR_LEVELS.map(({ value, label }) => ({ value, label }))}
            value={errorLevel}
            onChange={setErrorLevel}
            ariaLabel="誤り訂正レベル"
          />
          <span className="caption text-muted">
            復元率: {ERROR_LEVELS.find((e) => e.value === errorLevel)?.desc}
          </span>
        </div>
      </div>

      {/* エラー */}
      {error && <ErrorMessage message={error} />}

      {/* QRコード表示 */}
      {svgHtml && (
        <div className="rounded-lg border border-default overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-subtle border-b border-default">
            <span className="body-emphasis text-default">プレビュー</span>
            <DownloadButton onClick={handleDownload} label="SVGダウンロード" variant="secondary" />
          </div>
          <div className="flex justify-center p-8 bg-default">
            <div
              ref={containerRef}
              data-testid="qr-code-container"
              className="w-[200px] h-[200px]"
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
