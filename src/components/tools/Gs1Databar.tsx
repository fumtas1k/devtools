import { useState, useEffect, useCallback } from 'react';
import bwipjs from 'bwip-js';
import JSZip from 'jszip';
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

const SAMPLE_GTINS = [
  '0498700000001',
  '0498700000018',
  '0498700000025',
];

const MAX_CARDS = 10;

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

  const vbMatch = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!vbMatch) return svg;
  const w = parseFloat(vbMatch[1]);
  const h = parseFloat(vbMatch[2]);

  const fontSize = 18;
  const textRowH = fontSize + 6;
  const newH = h + textRowH;

  let result = svg
    .replace(/viewBox="0 0 [\d.]+ [\d.]+"/, `viewBox="0 0 ${w} ${newH}"`)
    .replace(/width="\d+"/, `width="${Math.round(w)}"`)
    .replace(/height="\d+"/, `height="${Math.round(newH)}"`);

  const openEnd = result.indexOf('>') + 1;
  const closeStart = result.lastIndexOf('</svg>');
  const openTag = result.slice(0, openEnd);
  const inner = result.slice(openEnd, closeStart);

  const textEl = `<text x="${(w / 2).toFixed(1)}" y="${textRowH - 3}" `
    + `text-anchor="middle" font-family="'Courier New',Courier,monospace" `
    + `font-size="${fontSize}" fill="#000000">${text}</text>`;

  return `${openTag}${textEl}<g transform="translate(0,${textRowH})">${inner}</g></svg>`;
}

function svgToPngBlob(svgContent: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const m = svgContent.match(/width="(\d+)" height="(\d+)"/);
    if (!m) { reject(new Error('SVG に width/height がありません')); return; }
    const svgW = parseInt(m[1], 10);
    const svgH = parseInt(m[2], 10);

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
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('PNG 変換に失敗しました'));
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG 読み込み失敗')); };
    img.src = url;
  });
}

// ─────────────────────────────────────────────
// BarcodeCard
// ─────────────────────────────────────────────

interface BarcodeCardProps {
  cardId: string;
  index: number;
  canRemove: boolean;
  onRemove: () => void;
  onSvgChange: (svg: string, gtin: string) => void;
}

function BarcodeCard({ cardId, index, canRemove, onRemove, onSvgChange }: BarcodeCardProps) {
  const [gtinInput, setGtinInput] = useState('');
  const [gtinError, setGtinError] = useState('');
  const [aiFields, setAiFields] = useState<AiFieldState[]>(DEFAULT_AI_FIELDS);
  const [svgContent, setSvgContent] = useState('');
  const [bwipError, setBwipError] = useState('');

  const inputId = `gtin-input-${cardId}`;

  const gtinResult =
    gtinInput && !gtinError && gtinInput.length === 13
      ? calcGtin14CheckDigit(gtinInput)
      : null;

  const allAiValid = aiFields.every((f) => f.error === '');
  const hasAnyAiValue = aiFields.some((f) => f.value.trim() !== '');

  useEffect(() => {
    if (!gtinResult || !allAiValid) {
      setSvgContent('');
      setBwipError('');
      onSvgChange('', '');
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

      const compositeText = aiFields
        .filter((f) => f.value.trim() !== '')
        .map((f) => `(${f.ai})${f.value.trim()}`)
        .join('');
      const sizedSvg = addSvgDimensions(rawSvg);
      const finalSvg = compositeText ? injectCompositeText(sizedSvg, compositeText) : sizedSvg;
      setSvgContent(finalSvg);
      setBwipError('');
      onSvgChange(finalSvg, gtinResult.fullGtin);
    } catch (e) {
      setSvgContent('');
      setBwipError(e instanceof Error ? e.message : 'バーコード生成に失敗しました');
      onSvgChange('', '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gtinInput, gtinError, aiFields]);

  const handleGtinInput = (value: string) => {
    setGtinInput(value);
    setGtinError(validateGtin14Input(value));
  };

  const handleAiChange = (i: number, value: string) => {
    const def = AI_DEFS.find((d) => d.ai === aiFields[i].ai)!;
    setAiFields((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, value, error: def.validate(value) } : f)),
    );
  };

  const handleAiSelect = (i: number, ai: AiCode) => {
    setAiFields((prev) =>
      prev.map((f, idx) => (idx === i ? { ai, value: '', error: '' } : f)),
    );
  };

  const addAiField = () => {
    if (aiFields.length >= AI_DEFS.length) return;
    const usedAis = new Set(aiFields.map((f) => f.ai));
    const nextAi = AI_DEFS.find((d) => !usedAis.has(d.ai));
    if (!nextAi) return;
    setAiFields((prev) => [...prev, { ai: nextAi.ai, value: '', error: '' }]);
  };

  const removeAiField = (i: number) => {
    setAiFields((prev) => prev.filter((_, idx) => idx !== i));
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
    svgToPngBlob(svgContent).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gs1-databar-${gtinResult!.fullGtin}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const usedAis = new Set(aiFields.map((f) => f.ai));
  const canAddField = aiFields.length < AI_DEFS.length;
  const sampleGtin = SAMPLE_GTINS[index % SAMPLE_GTINS.length];
  const gs1String = gtinResult
    ? buildBwipText(gtinResult.fullGtin, aiFields.map((f) => ({ ai: f.ai, value: f.value })))
    : '';

  return (
    <div
      className="rounded-lg"
      style={{ border: '1px solid #D1D5DB', background: '#ffffff' }}
    >
      {/* カードヘッダー */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-t-lg"
        style={{ background: '#F3F4F6', borderBottom: '1px solid #E5E7EB' }}
      >
        <span style={{ ...caption, fontWeight: 700, color: '#374151' }}>
          バーコード {index + 1}
          {gtinResult && (
            <span className="font-mono ml-2" style={{ ...caption, color: '#6B7280', fontWeight: 400 }}>
              — {gtinResult.fullGtin}
            </span>
          )}
        </span>
        {canRemove && (
          <button
            onClick={onRemove}
            className="rounded px-2 py-1 hover:bg-red-50 transition-colors"
            style={{ ...caption, color: '#DC2626' }}
            aria-label={`バーコード ${index + 1} を削除`}
          >
            削除
          </button>
        )}
      </div>

      {/* カード本体 */}
      <div className="p-4 space-y-5">
        {/* GTIN入力 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor={inputId} style={{ ...caption, color: '#374151', fontWeight: 600 }}>
              GTIN-14（先頭13桁）
            </label>
            <button
              onClick={() => handleGtinInput(sampleGtin)}
              style={{ ...caption, color: '#2563EB' }}
              className="hover:underline"
            >
              サンプル入力
            </button>
          </div>
          <input
            id={inputId}
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
            aria-describedby={gtinError ? `${inputId}-error` : `${inputId}-hint`}
          />
          {gtinError ? (
            <p id={`${inputId}-error`} role="alert" style={{ ...caption, color: '#DC2626', marginTop: '0.25rem' }}>
              {gtinError}
            </p>
          ) : (
            <p id={`${inputId}-hint`} style={{ ...caption, color: '#6B7280', marginTop: '0.25rem' }}>
              {gtinInput.length} / 13 桁
            </p>
          )}
        </div>

        {/* GTIN計算結果 */}
        {gtinResult && (
          <div
            className="rounded-lg p-3 flex flex-wrap items-center gap-x-6 gap-y-2"
            style={{ border: '1px solid #E5E7EB', background: '#F9FAFB' }}
          >
            <div className="flex items-center gap-2">
              <span style={{ ...caption, color: '#6B7280' }}>チェックディジット</span>
              <span style={{ ...bodyEmphasis, color: '#1A56DB' }}>{gtinResult.checkDigit}</span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ ...caption, color: '#6B7280' }}>GTIN-14</span>
              <span className="font-mono" style={{ ...bodyEmphasis, color: '#111827', letterSpacing: '0.1em' }}>
                {gtinResult.fullGtin}
              </span>
              <CopyButton text={gtinResult.fullGtin} label="コピー" />
            </div>
          </div>
        )}

        {/* AIフィールド */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span style={{ ...caption, color: '#374151', fontWeight: 600 }}>合成シンボル（任意）</span>
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
            {aiFields.map((field, i) => {
              const def = AI_DEFS.find((d) => d.ai === field.ai)!;
              return (
                <div key={i} className="flex gap-2 items-start">
                  <select
                    value={field.ai}
                    onChange={(e) => handleAiSelect(i, e.target.value as AiCode)}
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
                      onChange={(e) => handleAiChange(i, e.target.value)}
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
                    onClick={() => removeAiField(i)}
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
            className="rounded-lg flex flex-col items-center gap-4 p-5"
            style={{ border: '1px solid #E5E7EB', background: '#FAFAFA' }}
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
              className="cursor-pointer px-4 py-3 hover:bg-neutral-50 rounded-lg"
              style={{ ...caption, fontWeight: 700, color: '#374151', listStyle: 'none' }}
            >
              GS1文字列を見る
            </summary>
            <div className="px-4 pb-4 pt-2">
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 rounded px-3 py-2 font-mono break-all"
                  style={{ ...caption, background: '#F3F4F6', color: '#111827' }}
                >
                  {gs1String}
                </code>
                <CopyButton text={gs1String} label="コピー" />
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Gs1DatabarTool（メイン）
// ─────────────────────────────────────────────

interface CardMeta {
  id: string;
}

interface CardSvgState {
  svg: string;
  gtin: string;
}

export function Gs1DatabarTool() {
  const [cards, setCards] = useState<CardMeta[]>(() => [{ id: crypto.randomUUID() }]);
  const [cardSvgs, setCardSvgs] = useState<Record<string, CardSvgState>>({});
  const [isZipping, setIsZipping] = useState(false);

  const addCard = () => {
    if (cards.length >= MAX_CARDS) return;
    setCards((prev) => [...prev, { id: crypto.randomUUID() }]);
  };

  const removeCard = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    setCardSvgs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleSvgChange = useCallback((id: string, svg: string, gtin: string) => {
    setCardSvgs((prev) => ({ ...prev, [id]: { svg, gtin } }));
  }, []);

  const validEntries = Object.entries(cardSvgs).filter(([, v]) => v.svg && v.gtin);
  const canDownloadAll = validEntries.length >= 2;

  const downloadAllZip = async () => {
    if (!canDownloadAll || isZipping) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder('gs1-databars')!;

      await Promise.all(
        validEntries.map(async ([, { svg, gtin }]) => {
          folder.file(`gs1-databar-${gtin}.svg`, svg);
          const pngBlob = await svgToPngBlob(svg);
          folder.file(`gs1-databar-${gtin}.png`, pngBlob);
        }),
      );

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gs1-databars.zip';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* カードリスト */}
      {cards.map((card, index) => (
        <BarcodeCard
          key={card.id}
          cardId={card.id}
          index={index}
          canRemove={cards.length > 1}
          onRemove={() => removeCard(card.id)}
          onSvgChange={(svg, gtin) => handleSvgChange(card.id, svg, gtin)}
        />
      ))}

      {/* 操作バー */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        {cards.length < MAX_CARDS && (
          <button
            onClick={addCard}
            className="rounded px-4 py-2 transition-colors hover:bg-blue-50"
            style={{ ...caption, fontWeight: 700, border: '1px solid #1A56DB', color: '#1A56DB' }}
          >
            + バーコードを追加
          </button>
        )}
        {cards.length >= MAX_CARDS && (
          <span style={{ ...caption, color: '#6B7280' }}>最大 {MAX_CARDS} 件まで追加できます</span>
        )}

        {canDownloadAll && (
          <button
            onClick={downloadAllZip}
            disabled={isZipping}
            className="rounded px-4 py-2 font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
            style={{ ...caption, fontWeight: 700, background: '#1A56DB' }}
          >
            {isZipping ? 'ZIP作成中...' : `全件ZIPダウンロード（${validEntries.length}件）`}
          </button>
        )}
      </div>
    </div>
  );
}
