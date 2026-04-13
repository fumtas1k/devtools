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
import { bodyEmphasis, caption, colors, onFocusRing, onBlurRing } from '../../utils/styles';
import { InputField } from '../ui/InputField';
import { DownloadButtonGroup } from '../ui/DownloadButtonGroup';
import {
  downloadSvg as downloadSvgFile,
  downloadPngFromSvgContent,
  svgContentToPngBlob,
} from '../../utils/download';

interface AiFieldState {
  ai: AiCode;
  value: string;
  error: string;
}

const DEFAULT_AI_FIELDS: AiFieldState[] = [
  { ai: '17', value: '', error: '' },
  { ai: '10', value: '', error: '' },
];

const SAMPLE_GTINS = ['0498700000001', '0498700000018', '0498700000025'];

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
  const barcodeW = parseFloat(vbMatch[1]);
  const h = parseFloat(vbMatch[2]);

  const fontSize = 18;
  const textRowH = fontSize + 6;

  // Courier New monospace: ~0.6em per character
  const charW = fontSize * 0.6;
  const padding = 16;
  const estimatedTextW = text.length * charW + padding;

  // Expand width if text is wider than barcode
  const newW = Math.max(barcodeW, estimatedTextW);
  const newH = h + textRowH;

  // If width expanded, center the barcode horizontally
  const barcodeOffsetX = (newW - barcodeW) / 2;

  let result = svg
    .replace(/viewBox="0 0 [\d.]+ [\d.]+"/, `viewBox="0 0 ${newW.toFixed(1)} ${newH.toFixed(1)}"`)
    .replace(/width="\d+"/, `width="${Math.round(newW)}"`)
    .replace(/height="\d+"/, `height="${Math.round(newH)}"`);

  const openEnd = result.indexOf('>') + 1;
  const closeStart = result.lastIndexOf('</svg>');
  const openTag = result.slice(0, openEnd);
  const inner = result.slice(openEnd, closeStart);

  const textEl =
    `<text x="${(newW / 2).toFixed(1)}" y="${textRowH - 3}" ` +
    `text-anchor="middle" font-family="'Courier New',Courier,monospace" ` +
    `font-size="${fontSize}" fill="#000000">${text}</text>`;

  const barcodeTranslate = `translate(${barcodeOffsetX.toFixed(1)},${textRowH})`;

  return `${openTag}${textEl}<g transform="${barcodeTranslate}">${inner}</g></svg>`;
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
    gtinInput && !gtinError && gtinInput.length === 13 ? calcGtin14CheckDigit(gtinInput) : null;

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
      aiFields.map((f) => ({ ai: f.ai, value: f.value }))
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
      prev.map((f, idx) => (idx === i ? { ...f, value, error: def.validate(value) } : f))
    );
  };

  const handleAiSelect = (i: number, ai: AiCode) => {
    setAiFields((prev) => prev.map((f, idx) => (idx === i ? { ai, value: '', error: '' } : f)));
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
    downloadSvgFile(svgContent, `gs1-databar-${gtinResult.fullGtin}.svg`);
  };

  const downloadPng = () => {
    if (!svgContent || !gtinResult) return;
    downloadPngFromSvgContent(svgContent, `gs1-databar-${gtinResult.fullGtin}.png`);
  };

  const usedAis = new Set(aiFields.map((f) => f.ai));
  const canAddField = aiFields.length < AI_DEFS.length;
  const sampleGtin = SAMPLE_GTINS[index % SAMPLE_GTINS.length];
  const gs1String = gtinResult
    ? buildBwipText(
        gtinResult.fullGtin,
        aiFields.map((f) => ({ ai: f.ai, value: f.value }))
      )
    : '';

  return (
    <div
      className="rounded-lg"
      style={{ border: `1px solid ${colors.borderInput}`, background: colors.bg }}
    >
      {/* カードヘッダー */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-t-lg"
        style={{ background: colors.bgSubtle, borderBottom: `1px solid ${colors.border}` }}
      >
        <span style={{ ...caption, fontWeight: 700, color: colors.text }}>
          バーコード {index + 1}
          {gtinResult && (
            <span
              className="font-mono ml-2"
              style={{ ...caption, color: colors.muted, fontWeight: 400 }}
            >
              — {gtinResult.fullGtin}
            </span>
          )}
        </span>
        {canRemove && (
          <button
            onClick={onRemove}
            className="rounded px-2 py-1 hover:bg-red-50 transition-colors"
            style={{ ...caption, color: colors.error }}
            aria-label={`バーコード ${index + 1} を削除`}
          >
            削除
          </button>
        )}
      </div>

      {/* カード本体 */}
      <div className="p-4 space-y-5">
        {/* GTIN入力 */}
        <InputField
          id={inputId}
          label="GTIN-14（先頭13桁）"
          value={gtinInput}
          onChange={handleGtinInput}
          placeholder="0498700000001（13桁、先頭は0か1）"
          inputMode="numeric"
          maxLength={13}
          error={gtinError || undefined}
          hint={`${gtinInput.length} / 13 桁`}
          onSampleClick={() => handleGtinInput(sampleGtin)}
          mono
        />

        {/* GTIN計算結果 */}
        {gtinResult && (
          <div
            className="rounded-lg p-3 flex flex-wrap items-center gap-x-6 gap-y-2"
            style={{ border: `1px solid ${colors.border}`, background: colors.bgSurface }}
          >
            <div className="flex items-center gap-2">
              <span style={{ ...caption, color: colors.muted }}>チェックディジット</span>
              <span style={{ ...bodyEmphasis, color: colors.primary }}>
                {gtinResult.checkDigit}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ ...caption, color: colors.muted }}>GTIN-14</span>
              <span
                className="font-mono"
                style={{ ...bodyEmphasis, color: colors.text, letterSpacing: '0.1em' }}
              >
                {gtinResult.fullGtin}
              </span>
              <CopyButton text={gtinResult.fullGtin} label="コピー" />
            </div>
          </div>
        )}

        {/* AIフィールド */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span style={{ ...caption, color: colors.text, fontWeight: 600 }}>
              合成シンボル（任意）
            </span>
            {canAddField && (
              <button
                onClick={addAiField}
                style={{ ...caption, color: colors.link }}
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
                      border: `1px solid ${colors.borderInput}`,
                      background: colors.bg,
                      color: colors.text,
                      width: '200px',
                    }}
                  >
                    {AI_DEFS.map((d) => (
                      <option
                        key={d.ai}
                        value={d.ai}
                        disabled={usedAis.has(d.ai) && d.ai !== field.ai}
                      >
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
                        border: `1px solid ${field.error ? colors.error : colors.borderInput}`,
                        outline: 'none',
                        background: colors.bg,
                        color: colors.text,
                      }}
                      onFocus={onFocusRing}
                      onBlur={onBlurRing}
                    />
                    {field.error && (
                      <p
                        role="alert"
                        style={{ ...caption, color: colors.error, marginTop: '0.25rem' }}
                      >
                        {field.error}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeAiField(i)}
                    className="rounded p-2 hover:bg-neutral-100 transition-colors shrink-0"
                    style={{ ...caption, color: colors.muted, marginTop: '2px' }}
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
            style={{ border: `1px solid ${colors.border}`, background: colors.bgSurface }}
          >
            <div
              aria-label={`GS1 DataBar ${gtinResult?.fullGtin} のバーコード`}
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
            <DownloadButtonGroup onDownloadSvg={downloadSvg} onDownloadPng={downloadPng} />
          </div>
        )}

        {bwipError && (
          <div
            className="rounded-lg p-4"
            style={{ border: `1px solid ${colors.error}`, background: colors.errorBg }}
          >
            <p style={{ ...caption, color: colors.error }}>バーコード生成エラー: {bwipError}</p>
          </div>
        )}

        {/* GS1文字列プレビュー */}
        {gtinResult && (
          <details className="rounded-lg" style={{ border: `1px solid ${colors.border}` }}>
            <summary
              className="cursor-pointer px-4 py-3 hover:bg-neutral-50 rounded-lg"
              style={{ ...caption, fontWeight: 700, color: colors.text, listStyle: 'none' }}
            >
              GS1文字列を見る
            </summary>
            <div className="px-4 pb-4 pt-2">
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 rounded px-3 py-2 font-mono break-all"
                  style={{ ...caption, background: colors.bgSubtle, color: colors.text }}
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
          const pngBlob = await svgContentToPngBlob(svg);
          folder.file(`gs1-databar-${gtin}.png`, pngBlob);
        })
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
            style={{
              ...caption,
              fontWeight: 700,
              border: `1px solid ${colors.primary}`,
              color: colors.primary,
            }}
          >
            + バーコードを追加
          </button>
        )}
        {cards.length >= MAX_CARDS && (
          <span style={{ ...caption, color: colors.muted }}>
            最大 {MAX_CARDS} 件まで追加できます
          </span>
        )}

        {canDownloadAll && (
          <button
            onClick={downloadAllZip}
            disabled={isZipping}
            className="rounded px-4 py-2 font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
            style={{ ...caption, fontWeight: 700, background: colors.primary }}
          >
            {isZipping ? 'ZIP作成中...' : `全件ZIPダウンロード（${validEntries.length}件）`}
          </button>
        )}
      </div>
    </div>
  );
}
