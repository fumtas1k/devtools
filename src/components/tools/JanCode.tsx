import { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { CopyButton } from '../ui/CopyButton';
import { calcJan, validateJanInput, type JanMode } from '../../utils/jan-code';
import { bodyEmphasis, caption } from '../../utils/styles';

export function JanCodeTool() {
  const [mode, setMode] = useState<JanMode>('jan13');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);

  const result = input && !error && input.length === (mode === 'jan13' ? 12 : 7)
    ? calcJan(input, mode)
    : null;

  // バーコード描画
  useEffect(() => {
    if (!result || !svgRef.current) return;
    try {
      JsBarcode(svgRef.current, result.fullCode, {
        format: mode === 'jan13' ? 'EAN13' : 'EAN8',
        width: 2,
        height: 80,
        displayValue: true,
        fontSize: 14,
        margin: 10,
        background: '#ffffff',
        lineColor: '#111827',
        fontOptions: '',
        font: 'Noto Sans JP',
      });
    } catch {
      // 不正コードは描画しない
    }
  }, [result, mode]);

  const handleModeChange = (next: JanMode) => {
    setMode(next);
    setInput('');
    setError('');
  };

  const handleInput = (value: string) => {
    setInput(value);
    setError(validateJanInput(value, mode));
  };

  const downloadSvg = () => {
    if (!svgRef.current) return;
    const svg = svgRef.current.outerHTML;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jan-${result!.fullCode}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPng = () => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    const { width, height } = svg.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    const scale = 2; // Retina
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    const img = new Image();
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `jan-${result!.fullCode}.png`;
      a.click();
    };
    img.src = url;
  };

  const SAMPLE: Record<JanMode, string> = {
    jan13: '490123456789',
    jan8:  '4901234',
  };

  return (
    <div className="space-y-6">
      {/* モード切替 */}
      <div
        className="flex gap-1 rounded p-1"
        role="tablist"
        aria-label="JANコードモード"
        style={{ background: '#F3F4F6' }}
      >
        {(['jan13', 'jan8'] as JanMode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => handleModeChange(m)}
            className="flex-1 rounded py-1.5 transition-colors"
            style={{
              ...caption,
              fontWeight: 700,
              background: mode === m ? '#ffffff' : 'transparent',
              color: mode === m ? '#111827' : '#6B7280',
              boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {m === 'jan13' ? 'JAN-13' : 'JAN-8'}
          </button>
        ))}
      </div>

      {/* 入力 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="jan-input" style={{ ...bodyEmphasis, color: '#111827' }}>
            {mode === 'jan13' ? '12桁を入力' : '7桁を入力'}
          </label>
          <button
            onClick={() => handleInput(SAMPLE[mode])}
            style={{ ...caption, color: '#2563EB' }}
            className="hover:underline"
          >
            サンプル入力
          </button>
        </div>
        <input
          id="jan-input"
          type="text"
          inputMode="numeric"
          maxLength={mode === 'jan13' ? 12 : 7}
          value={input}
          onChange={(e) => handleInput(e.target.value)}
          placeholder={mode === 'jan13' ? '490123456789（12桁）' : '4901234（7桁）'}
          className="w-full rounded px-3 py-2 font-mono"
          style={{
            ...caption,
            border: `1px solid ${error ? '#DC2626' : '#D1D5DB'}`,
            outline: 'none',
            background: '#ffffff',
            color: '#111827',
          }}
          onFocus={(e) => { e.target.style.outline = '2px solid #2563EB'; e.target.style.outlineOffset = '2px'; }}
          onBlur={(e) => { e.target.style.outline = 'none'; }}
          aria-describedby={error ? 'jan-error' : 'jan-hint'}
        />
        {error ? (
          <p id="jan-error" role="alert" style={{ ...caption, color: '#DC2626', marginTop: '0.25rem' }}>
            {error}
          </p>
        ) : (
          <p id="jan-hint" style={{ ...caption, color: '#6B7280', marginTop: '0.25rem' }}>
            {input.length} / {mode === 'jan13' ? 12 : 7} 桁
          </p>
        )}
      </div>

      {/* 結果 */}
      {result && (
        <div className="space-y-4">
          {/* チェックディジット・完成コード */}
          <div
            className="rounded-lg p-4 space-y-3"
            style={{ border: '1px solid #E5E7EB', background: '#F9FAFB' }}
          >
            <div className="flex items-center justify-between">
              <span style={{ ...caption, color: '#6B7280' }}>チェックディジット</span>
              <span style={{ ...bodyEmphasis, color: '#1A56DB' }}>{result.checkDigit}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ ...caption, color: '#6B7280' }}>完成コード</span>
              <div className="flex items-center gap-2">
                <span className="font-mono" style={{ ...bodyEmphasis, color: '#111827', letterSpacing: '0.1em' }}>
                  {result.fullCode}
                </span>
                <CopyButton text={result.fullCode} label="コピー" />
              </div>
            </div>
          </div>

          {/* 計算過程 */}
          <details className="rounded-lg" style={{ border: '1px solid #E5E7EB' }}>
            <summary
              className="cursor-pointer px-4 py-3 font-bold text-neutral-700 hover:bg-neutral-50 rounded-lg"
              style={{ ...caption, fontWeight: 700, listStyle: 'none' }}
            >
              計算過程を見る
            </summary>
            <div className="px-4 pb-4 pt-2 space-y-1 font-mono" style={{ ...caption, color: '#374151' }}>
              {mode === 'jan13' ? (
                <>
                  <p>奇数位（×1）: {result.steps.weight1Digits.join(' + ')} = {result.steps.weight1Sum}</p>
                  <p>偶数位（×3）: {result.steps.weight3Digits.join(' + ')} = {result.steps.weight3Sum}</p>
                  <p>{result.steps.weight3Sum} × 3 + {result.steps.weight1Sum} = {result.steps.total}</p>
                </>
              ) : (
                <>
                  <p>奇数位（×3）: {result.steps.weight3Digits.join(' + ')} = {result.steps.weight3Sum}</p>
                  <p>偶数位（×1）: {result.steps.weight1Digits.join(' + ')} = {result.steps.weight1Sum}</p>
                  <p>{result.steps.weight3Sum} × 3 + {result.steps.weight1Sum} = {result.steps.total}</p>
                </>
              )}
              <p>
                {result.steps.total} mod 10 = {result.steps.remainder}
                {result.steps.remainder === 0
                  ? ' → チェックディジット = 0'
                  : ` → 10 − ${result.steps.remainder} = ${result.steps.checkDigit}`}
              </p>
            </div>
          </details>

          {/* バーコードプレビュー */}
          <div
            className="rounded-lg flex flex-col items-center gap-4 p-4"
            style={{ border: '1px solid #E5E7EB', background: '#ffffff' }}
          >
            <svg ref={svgRef} aria-label={`JANコード ${result.fullCode} のバーコード`} />
            <div className="flex gap-2">
              <button
                onClick={downloadSvg}
                className="rounded px-4 py-2 font-bold transition-colors hover:bg-blue-50"
                style={{ ...caption, fontWeight: 700, border: '1px solid #1A56DB', color: '#1A56DB' }}
              >
                SVGダウンロード
              </button>
              <button
                onClick={downloadPng}
                className="rounded px-4 py-2 font-bold text-white transition-colors hover:opacity-90"
                style={{ ...caption, fontWeight: 700, background: '#1A56DB' }}
              >
                PNGダウンロード
              </button>
            </div>
          </div>
        </div>
      )}

      {/* クリア */}
      {input && (
        <div className="flex justify-end">
          <button
            onClick={() => { setInput(''); setError(''); }}
            className="rounded px-3 py-2 transition-colors hover:bg-neutral-100"
            style={{ ...caption, color: '#6B7280' }}
          >
            クリア
          </button>
        </div>
      )}
    </div>
  );
}
