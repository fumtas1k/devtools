import { useState, useEffect } from 'react';
import bwipjs from 'bwip-js';
import { CopyButton } from '../ui/CopyButton';
import {
  calcGtin14CheckDigit,
  validateGtin14Input,
  buildBwipText,
  AI_DEFS,
  type AiCode,
} from '../../utils/gs1-databar';
import { bodyEmphasis, caption } from '../../utils/styles';

interface AiFieldState {
  ai: AiCode;
  value: string;
  error: string;
}

const DEFAULT_AI_FIELDS: AiFieldState[] = [
  { ai: '17', value: '', error: '' },
  { ai: '10', value: '', error: '' },
];

const SAMPLE_GTIN = '0498700000001';

/**
 * bwip-js の toSVG は viewBox のみで width/height を持たない SVG を返す。
 * width/height がないと:
 *   - flex コンテナでの描画が不安定になる
 *   - Image 要素の natural size が 0x0 になり PNG が空になる
 * viewBox から pixel 寸法を取り出して属性として追加する。
 */
function addSvgDimensions(svg: string): string {
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!m) return svg;
  const w = Math.round(parseFloat(m[1]));
  const h = Math.round(parseFloat(m[2]));
  return svg.replace('<svg viewBox=', `<svg width="${w}" height="${h}" viewBox=`);
}

/**
 * 合成シンボルの上に AI テキストを挿入する。
 * bwip-js の includetext は composite 部上のテキストを出力しないため、
 * SVG 文字列を直接操作してテキスト要素を追加する。
 */
function injectCompositeText(svg: string, text: string): string {
  if (!text) return svg;

  // 現在の viewBox 寸法を取得
  const vbMatch = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!vbMatch) return svg;
  const w = parseFloat(vbMatch[1]);
  const h = parseFloat(vbMatch[2]);

  // bwip-js の textsize:7 は SVG 座標系では 7×scale(3)=21 ユニット相当。
  // cap-height は em の約 0.85 なので 21*0.85≈18 で視覚的にほぼ同サイズになる。
  const fontSize = 18;
  const textRowH = fontSize + 6;
  const newH = h + textRowH;

  // viewBox を拡張し、width/height も更新
  let result = svg
    .replace(/viewBox="0 0 [\d.]+ [\d.]+"/, `viewBox="0 0 ${w} ${newH}"`)
    .replace(/width="\d+"/, `width="${Math.round(w)}"`)
    .replace(/height="\d+"/, `height="${Math.round(newH)}"`);

  // 開始タグの末尾を探してコンテンツを取り出す
  const openEnd = result.indexOf('>') + 1;
  const closeStart = result.lastIndexOf('</svg>');
  const openTag = result.slice(0, openEnd);
  const inner = result.slice(openEnd, closeStart);

  // AI テキスト要素（中央揃え、計算サイズ）
  const textEl = `<text x="${(w / 2).toFixed(1)}" y="${textRowH - 3}" `
    + `text-anchor="middle" font-family="'Courier New',Courier,monospace" `
    + `font-size="${fontSize}" fill="#000000">${text}</text>`;

  // 既存コンテンツを textRowH だけ下にシフト
  return `${openTag}${textEl}<g transform="translate(0,${textRowH})">${inner}</g></svg>`;
}

export function Gs1DatabarTool() {
  const [gtinInput, setGtinInput] = useState('');
  const [gtinError, setGtinError] = useState('');
  const [aiFields, setAiFields] = useState<AiFieldState[]>(DEFAULT_AI_FIELDS);
  const [svgContent, setSvgContent] = useState('');
  const [bwipError, setBwipError] = useState('');

  const gtinResult =
    gtinInput && !gtinError && gtinInput.length === 13
      ? calcGtin14CheckDigit(gtinInput)
      : null;

  const allAiValid = aiFields.every((f) => f.error === '');
  const hasAnyAiValue = aiFields.some((f) => f.value.trim() !== '');

  // バーコード描画
  useEffect(() => {
    if (!gtinResult || !allAiValid) {
      setSvgContent('');
      setBwipError('');
      return;
    }

    const bwipText = buildBwipText(
      gtinResult.fullGtin,
      aiFields.map((f) => ({ ai: f.ai, value: f.value })),
    );

    try {
      const bcid = hasAnyAiValue ? 'databarlimitedcomposite' : 'databarlimited';
      const rawSvg = bwipjs.toSVG({
        bcid,
        text: bwipText,
        scale: 3,
        height: 6,
        includetext: true,
        textxalign: 'center',
        textsize: 7,
      });

      // composite テキストを SVG に埋め込む
      const compositeText = aiFields
        .filter((f) => f.value.trim() !== '')
        .map((f) => `(${f.ai})${f.value.trim()}`)
        .join('');
      const sizedSvg = addSvgDimensions(rawSvg);
      setSvgContent(compositeText ? injectCompositeText(sizedSvg, compositeText) : sizedSvg);
      setBwipError('');
    } catch (e) {
      setSvgContent('');
      setBwipError(e instanceof Error ? e.message : 'バーコード生成に失敗しました');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gtinInput, gtinError, aiFields]);

  const handleGtinInput = (value: string) => {
    setGtinInput(value);
    setGtinError(validateGtin14Input(value));
  };

  const handleAiChange = (index: number, value: string) => {
    const def = AI_DEFS.find((d) => d.ai === aiFields[index].ai)!;
    setAiFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, value, error: def.validate(value) } : f)),
    );
  };

  const handleAiSelect = (index: number, ai: AiCode) => {
    setAiFields((prev) =>
      prev.map((f, i) => (i === index ? { ai, value: '', error: '' } : f)),
    );
  };

  const addAiField = () => {
    if (aiFields.length >= AI_DEFS.length) return;
    const usedAis = new Set(aiFields.map((f) => f.ai));
    const nextAi = AI_DEFS.find((d) => !usedAis.has(d.ai));
    if (!nextAi) return;
    setAiFields((prev) => [...prev, { ai: nextAi.ai, value: '', error: '' }]);
  };

  const removeAiField = (index: number) => {
    setAiFields((prev) => prev.filter((_, i) => i !== index));
  };

  const downloadSvg = () => {
    if (!svgContent || !gtinResult) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gs1-databar-${gtinResult.fullGtin}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPng = () => {
    if (!svgContent || !gtinResult) return;
    // width/height は addSvgDimensions で付与済み
    const m = svgContent.match(/width="(\d+)" height="(\d+)"/);
    if (!m) return;
    const svgW = parseInt(m[1]);
    const svgH = parseInt(m[2]);

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = svgW * scale;
    canvas.height = svgH * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);

    const img = new Image();
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `gs1-databar-${gtinResult!.fullGtin}.png`;
      a.click();
    };
    img.src = url;
  };

  const usedAis = new Set(aiFields.map((f) => f.ai));
  const canAddField = aiFields.length < AI_DEFS.length;

  return (
    <div className="space-y-6">
      {/* GTIN-13入力 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="gtin-input" style={{ ...bodyEmphasis, color: '#111827' }}>
            GTIN-14（先頭13桁）を入力
          </label>
          <button
            onClick={() => handleGtinInput(SAMPLE_GTIN)}
            style={{ ...caption, color: '#2563EB' }}
            className="hover:underline"
          >
            サンプル入力
          </button>
        </div>
        <input
          id="gtin-input"
          type="text"
          inputMode="numeric"
          maxLength={13}
          value={gtinInput}
          onChange={(e) => handleGtinInput(e.target.value)}
          placeholder="0498700000001（13桁、先頭は0か1）"
          className="w-full rounded px-3 py-2 font-mono"
          style={{
            ...caption,
            border: `1px solid ${gtinError ? '#DC2626' : '#D1D5DB'}`,
            outline: 'none',
            background: '#ffffff',
            color: '#111827',
          }}
          onFocus={(e) => { e.target.style.outline = '2px solid #2563EB'; e.target.style.outlineOffset = '2px'; }}
          onBlur={(e) => { e.target.style.outline = 'none'; }}
          aria-describedby={gtinError ? 'gtin-error' : 'gtin-hint'}
        />
        {gtinError ? (
          <p id="gtin-error" role="alert" style={{ ...caption, color: '#DC2626', marginTop: '0.25rem' }}>
            {gtinError}
          </p>
        ) : (
          <p id="gtin-hint" style={{ ...caption, color: '#6B7280', marginTop: '0.25rem' }}>
            {gtinInput.length} / 13 桁 &nbsp;※ GS1 DataBar Limitedは先頭桁が0または1のみ対応
          </p>
        )}
      </div>

      {/* GTIN計算結果 */}
      {gtinResult && (
        <div
          className="rounded-lg p-4 space-y-3"
          style={{ border: '1px solid #E5E7EB', background: '#F9FAFB' }}
        >
          <div className="flex items-center justify-between">
            <span style={{ ...caption, color: '#6B7280' }}>チェックディジット</span>
            <span style={{ ...bodyEmphasis, color: '#1A56DB' }}>{gtinResult.checkDigit}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ ...caption, color: '#6B7280' }}>GTIN-14</span>
            <div className="flex items-center gap-2">
              <span className="font-mono" style={{ ...bodyEmphasis, color: '#111827', letterSpacing: '0.1em' }}>
                {gtinResult.fullGtin}
              </span>
              <CopyButton text={gtinResult.fullGtin} label="コピー" />
            </div>
          </div>
        </div>
      )}

      {/* 合成シンボル（AI）フィールド */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span style={{ ...bodyEmphasis, color: '#111827' }}>合成シンボル（任意）</span>
          {canAddField && (
            <button
              onClick={addAiField}
              style={{ ...caption, color: '#2563EB' }}
              className="hover:underline"
            >
              + フィールド追加
            </button>
          )}
        </div>
        <div className="space-y-3">
          {aiFields.map((field, index) => {
            const def = AI_DEFS.find((d) => d.ai === field.ai)!;
            return (
              <div key={index} className="flex gap-2 items-start">
                <select
                  value={field.ai}
                  onChange={(e) => handleAiSelect(index, e.target.value as AiCode)}
                  className="rounded px-2 py-2 shrink-0"
                  style={{
                    ...caption,
                    border: '1px solid #D1D5DB',
                    background: '#ffffff',
                    color: '#111827',
                    width: '200px',
                  }}
                >
                  {AI_DEFS.map((d) => (
                    <option key={d.ai} value={d.ai} disabled={usedAis.has(d.ai) && d.ai !== field.ai}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <div className="flex-1">
                  <input
                    type="text"
                    value={field.value}
                    onChange={(e) => handleAiChange(index, e.target.value)}
                    placeholder={def.placeholder}
                    className="w-full rounded px-3 py-2 font-mono"
                    style={{
                      ...caption,
                      border: `1px solid ${field.error ? '#DC2626' : '#D1D5DB'}`,
                      outline: 'none',
                      background: '#ffffff',
                      color: '#111827',
                    }}
                    onFocus={(e) => { e.target.style.outline = '2px solid #2563EB'; e.target.style.outlineOffset = '2px'; }}
                    onBlur={(e) => { e.target.style.outline = 'none'; }}
                  />
                  {field.error && (
                    <p role="alert" style={{ ...caption, color: '#DC2626', marginTop: '0.25rem' }}>
                      {field.error}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => removeAiField(index)}
                  className="rounded p-2 hover:bg-neutral-100 transition-colors shrink-0"
                  style={{ ...caption, color: '#6B7280', marginTop: '2px' }}
                  aria-label="フィールドを削除"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* バーコードプレビュー */}
      {svgContent && (
        <div
          className="rounded-lg flex flex-col items-center gap-4 p-6"
          style={{ border: '1px solid #E5E7EB', background: '#ffffff' }}
        >
          <div
            aria-label={`GS1 DataBar ${gtinResult?.fullGtin} のバーコード`}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
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
      )}

      {bwipError && (
        <div
          className="rounded-lg p-4"
          style={{ border: '1px solid #DC2626', background: '#FEF2F2' }}
        >
          <p style={{ ...caption, color: '#DC2626' }}>バーコード生成エラー: {bwipError}</p>
        </div>
      )}

      {/* GS1文字列プレビュー */}
      {gtinResult && (
        <details className="rounded-lg" style={{ border: '1px solid #E5E7EB' }}>
          <summary
            className="cursor-pointer px-4 py-3 font-bold text-neutral-700 hover:bg-neutral-50 rounded-lg"
            style={{ ...caption, fontWeight: 700, listStyle: 'none' }}
          >
            GS1文字列を見る
          </summary>
          <div className="px-4 pb-4 pt-2">
            <div className="flex items-center gap-2">
              <code
                className="flex-1 rounded px-3 py-2 font-mono break-all"
                style={{ ...caption, background: '#F3F4F6', color: '#111827' }}
              >
                {buildBwipText(
                  gtinResult.fullGtin,
                  aiFields.map((f) => ({ ai: f.ai, value: f.value })),
                )}
              </code>
              <CopyButton
                text={buildBwipText(
                  gtinResult.fullGtin,
                  aiFields.map((f) => ({ ai: f.ai, value: f.value })),
                )}
                label="コピー"
              />
            </div>
          </div>
        </details>
      )}

      {/* クリア */}
      {(gtinInput || aiFields.some((f) => f.value)) && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              setGtinInput('');
              setGtinError('');
              setAiFields(DEFAULT_AI_FIELDS);
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
