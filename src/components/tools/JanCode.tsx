import { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { CopyButton } from '../ui/CopyButton';
import { ToggleGroup } from '../ui/ToggleGroup';
import { InputField } from '../ui/InputField';
import { DownloadButtonGroup } from '../ui/DownloadButtonGroup';
import { calcJan, validateJanInput, type JanMode } from '../../utils/jan-code';
import { bodyEmphasis, caption, colors } from '../../utils/styles';
import { downloadSvg as downloadSvgFile, downloadPngFromSvgElement } from '../../utils/download';

export function JanCodeTool() {
  const [mode, setMode] = useState<JanMode>('jan13');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);

  const result =
    input && !error && input.length === (mode === 'jan13' ? 12 : 7) ? calcJan(input, mode) : null;

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
    downloadSvgFile(svgRef.current.outerHTML, `jan-${result!.fullCode}.svg`);
  };

  const downloadPng = () => {
    if (!svgRef.current) return;
    downloadPngFromSvgElement(svgRef.current, `jan-${result!.fullCode}.png`);
  };

  const SAMPLE: Record<JanMode, string> = {
    jan13: '490123456789',
    jan8: '4901234',
  };

  return (
    <div className="space-y-6">
      {/* モード切替 */}
      <ToggleGroup
        options={[
          { value: 'jan13', label: 'JAN-13' },
          { value: 'jan8', label: 'JAN-8' },
        ]}
        value={mode}
        onChange={handleModeChange}
        ariaLabel="JANコードモード"
      />

      {/* 入力 */}
      <InputField
        id="jan-input"
        label={mode === 'jan13' ? '12桁を入力' : '7桁を入力'}
        value={input}
        onChange={handleInput}
        placeholder={mode === 'jan13' ? '490123456789（12桁）' : '4901234（7桁）'}
        inputMode="numeric"
        maxLength={mode === 'jan13' ? 12 : 7}
        error={error || undefined}
        hint={`${input.length} / ${mode === 'jan13' ? 12 : 7} 桁`}
        onSampleClick={() => handleInput(SAMPLE[mode])}
        mono
      />

      {/* 結果 */}
      {result && (
        <div className="space-y-4">
          {/* チェックディジット・完成コード */}
          <div
            className="rounded-lg p-4 space-y-3"
            style={{ border: `1px solid ${colors.border}`, background: colors.bgSurface }}
          >
            <div className="flex items-center justify-between">
              <span style={{ ...caption, color: colors.muted }}>チェックディジット</span>
              <span style={{ ...bodyEmphasis, color: colors.primary }}>{result.checkDigit}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ ...caption, color: colors.muted }}>完成コード</span>
              <div className="flex items-center gap-2">
                <span
                  className="font-mono"
                  style={{ ...bodyEmphasis, color: colors.text, letterSpacing: '0.1em' }}
                >
                  {result.fullCode}
                </span>
                <CopyButton text={result.fullCode} label="コピー" />
              </div>
            </div>
          </div>

          {/* 計算過程 */}
          <details className="rounded-lg" style={{ border: `1px solid ${colors.border}` }}>
            <summary
              className="cursor-pointer px-4 py-3 font-bold text-neutral-700 hover:bg-neutral-50 rounded-lg"
              style={{ ...caption, fontWeight: 700, listStyle: 'none' }}
            >
              計算過程を見る
            </summary>
            <div
              className="px-4 pb-4 pt-2 space-y-1 font-mono"
              style={{ ...caption, color: colors.text }}
            >
              {mode === 'jan13' ? (
                <>
                  <p>
                    奇数位（×1）: {result.steps.weight1Digits.join(' + ')} ={' '}
                    {result.steps.weight1Sum}
                  </p>
                  <p>
                    偶数位（×3）: {result.steps.weight3Digits.join(' + ')} ={' '}
                    {result.steps.weight3Sum}
                  </p>
                  <p>
                    {result.steps.weight3Sum} × 3 + {result.steps.weight1Sum} = {result.steps.total}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    奇数位（×3）: {result.steps.weight3Digits.join(' + ')} ={' '}
                    {result.steps.weight3Sum}
                  </p>
                  <p>
                    偶数位（×1）: {result.steps.weight1Digits.join(' + ')} ={' '}
                    {result.steps.weight1Sum}
                  </p>
                  <p>
                    {result.steps.weight3Sum} × 3 + {result.steps.weight1Sum} = {result.steps.total}
                  </p>
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
            style={{ border: `1px solid ${colors.border}`, background: colors.bg }}
          >
            <svg ref={svgRef} aria-label={`JANコード ${result.fullCode} のバーコード`} />
            <DownloadButtonGroup onDownloadSvg={downloadSvg} onDownloadPng={downloadPng} />
          </div>
        </div>
      )}

      {/* クリア */}
      {input && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              setInput('');
              setError('');
            }}
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
