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

// SVG `<title>` に埋め込む文字列は HTML 特殊文字を実体参照化する必要がある
// (text が URL や `<` を含む可能性があるため XSS 二次防衛線も兼ねる)。
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateQrSvg(text: string, errorLevel: ErrorLevel): string | null {
  if (!text) return null;
  try {
    const qr = qrcode(0, errorLevel);
    qr.addData(text);
    qr.make();
    const svg = qr.createSvgTag({ scalable: true });
    // SR が SVG の意味を読み取れるよう role="img" + `<title>` を first child として
    // 注入する (issue #386)。`aria-label` は意図的に付けない: ARIA Accessible Name
    // and Description Computation 4.3.1 で aria-label があると `<title>` が name
    // 計算から除外され、URL 等の本文が読まれなくなる (PR #434 レビュー指摘)。
    const title = `<title>QRコード: ${escapeXml(text)}</title>`;
    return svg.replace(/<svg([^>]*)>/, `<svg$1 role="img">${title}`);
  } catch {
    return null;
  }
}

export function QrCodeGenerator() {
  const [text, setText] = useState('');
  const [errorLevel, setErrorLevel] = useState<ErrorLevel>('M');
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [error, setError] = useState('');
  // sr-only live region 用の announcement テキスト。
  // 視覚プレビュー側 (svgHtml) は即時更新するが、announcement は 300ms debounce 後に
  // 1 度だけ更新することで SR の「QRコード QRコード ...」連呼を防ぐ (issue #435)。
  const [announcement, setAnnouncement] = useState('');
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

  // svgHtml の変化を 300ms debounce して sr-only announcement を更新する。
  // 連続入力中は cleanup で timer をキャンセル + announcement を空に戻すことで、
  // 同一文言「QRコードを生成しました」でも入力 stable のたびに毎回 announce される。
  useEffect(() => {
    if (!svgHtml) {
      setAnnouncement('');
      return;
    }
    setAnnouncement('');
    const t = setTimeout(() => setAnnouncement('QRコードを生成しました'), 300);
    return () => clearTimeout(t);
  }, [svgHtml]);

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

      {/* sr-only live region: 視覚プレビューとは分離し、入力 stable 後にだけ
          一度だけ announce する (issue #435)。SVG <title> を直接 live region に
          含めると入力 1 文字ごとに「QRコード: h, QRコード: ht...」と連呼される
          ため、視覚 div の role="status" は外し、短文だけここで通知する。 */}
      <span role="status" aria-live="polite" className="sr-only" data-testid="qr-announcement">
        {announcement}
      </span>

      {/* QRコード表示 (視覚プレビューは即時更新、live region は持たない) */}
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
