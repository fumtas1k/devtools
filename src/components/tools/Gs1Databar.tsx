import { useState, useEffect, useCallback, useId, useRef, useMemo } from 'react';
import { getErrorMessage } from '@/utils/errors';
import bwipjs from 'bwip-js';
import { CopyButton } from '@/components/ui/CopyButton';
import {
  calcGtin14CheckDigit,
  validateGtin14Input,
  buildBwipText,
  addSvgDimensions,
  AI_DEFS,
  type AiCode,
} from '@/utils/gs1-databar';
import { InputField } from '@/components/ui/InputField';
import { BareInput } from '@/components/ui/BareInput';
import { Select } from '@/components/ui/Select';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { DownloadButtonGroup } from '@/components/ui/DownloadButtonGroup';
import { CloseIcon } from '@/components/ui/CloseIcon';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import {
  downloadSvg as downloadSvgFile,
  downloadPngFromSvgContent,
  svgContentToPngBlob,
} from '@/utils/download';
import { downloadZip } from '@/utils/zip';
import { sanitizeFilename } from '@/utils/filename';

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
  const [downloadError, setDownloadError] = useState('');

  const inputId = `gtin-input-${cardId}`;

  // useMemo で参照安定化。inline で都度生成すると useEffect deps が render 毎に
  // 「変化」と判定され、setDownloadError('') が PNG 失敗直後にも走って
  // ErrorMessage を瞬時に消してしまう (issue #338 対応の race fix)。
  const gtinResult = useMemo(
    () =>
      gtinInput && !gtinError && gtinInput.length === 13 ? calcGtin14CheckDigit(gtinInput) : null,
    [gtinInput, gtinError]
  );

  const allAiValid = aiFields.every((f) => f.error === '');
  const hasAnyAiValue = aiFields.some((f) => f.value.trim() !== '');

  // stale closure を防ぐため ref で最新のコールバックを保持（親の inline arrow 対策）
  const onSvgChangeRef = useRef(onSvgChange);
  useEffect(() => {
    onSvgChangeRef.current = onSvgChange;
  }, [onSvgChange]);

  useEffect(() => {
    setDownloadError('');
    if (!gtinResult || !allAiValid) {
      setSvgContent('');
      setBwipError('');
      onSvgChangeRef.current('', '');
      return;
    }

    const bwipText = buildBwipText(
      gtinResult.fullGtin,
      aiFields.map((f) => ({ ai: f.ai, value: f.value }))
    );

    try {
      const bcid = hasAnyAiValue ? 'databarlimitedcomposite' : 'databarlimited';
      // bwip-js v4.9.0 メモ (composite component):
      //  - `databarlimitedcomposite` は linear を `bwipp_renlinear`、CC を
      //    `bwipp_renmatrix` で別経路描画する。`height` オプションは renmatrix の
      //    processoptions で CC 行高も上書きしてしまうため指定不可 (PR #450)。
      //  - CC-A 行高は ISO/IEC 24723 で 2X 最小と規定されており、bwip-js は
      //    `bwipp_micropdf417` の `rowmult: 2` で実現する。GS1 General Spec
      //    5.9.2.2 が要求する「X-dim 一致」は横方向のみで、CC モジュールが
      //    1X × 2X 長方形なのは仕様準拠 (PR #450 のコメント記述は誤りだった)。
      //  - linear 部は renlinear が `borderleft/right=10` を持つので 10X quiet
      //    zone を確保するが、CC 部は micropdf417 が `borderleft/right=1` しか
      //    渡さないため CC 左右の quiet zone が 1X しかない。GS1 推奨は 10X で、
      //    1X だとスキャナの実装次第で CC を分離検出できず GTIN だけ返って CC-A
      //    (AI 10 等) が decode 不能になる。`paddingwidth: 10` で symbol 外周に
      //    GS1 推奨の 10X quiet zone を確実に確保する。
      const rawSvg = bwipjs.toSVG({
        bcid,
        text: bwipText,
        scale: 3,
        paddingwidth: 10,
        includetext: true,
        textxalign: 'center',
        textsize: 7,
      });

      // composite component 上に AI テキスト ((17)... 等) を SVG injection する
      // 旧実装は、テキストのディセンダーが composite 上端の quiet zone (1X) に
      // 侵入してスキャナが decode 不能になる問題があった (Dynamsoft Reader 0 件 →
      // injection 撤去で `GS1_COMPOSITE` 100% 認識を確認)。textRowH を広げて
      // quiet zone を 3X 確保する案も検証したが decode 不能のため撤回し撤去で確定。
      // 合成シンボル内の AI 値は下部の「GS1文字列を見る」セクションで人間可読として確認できる。
      const finalSvg = addSvgDimensions(rawSvg);
      setSvgContent(finalSvg);
      setBwipError('');
      onSvgChangeRef.current(finalSvg, gtinResult.fullGtin);
    } catch (e) {
      setSvgContent('');
      setBwipError(getErrorMessage(e, 'バーコード生成に失敗しました'));
      onSvgChangeRef.current('', '');
    }
  }, [gtinInput, gtinError, aiFields, gtinResult, allAiValid, hasAnyAiValue]);

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
    setDownloadError('');
    try {
      downloadSvgFile(svgContent, `gs1-databar-${gtinResult.fullGtin}.svg`);
    } catch (e) {
      setDownloadError(getErrorMessage(e, 'SVG ダウンロードに失敗しました'));
    }
  };

  // svgContentToPngBlob は img.onerror / canvas.toBlob 失敗で reject する。
  // await + try/catch で例外を吸収し ErrorMessage 経由でユーザーに通知する
  // (issue #338: 旧実装は fire-and-forget で unhandled promise rejection)。
  const downloadPng = async () => {
    if (!svgContent || !gtinResult) return;
    setDownloadError('');
    try {
      await downloadPngFromSvgContent(svgContent, `gs1-databar-${gtinResult.fullGtin}.png`);
    } catch (e) {
      setDownloadError(getErrorMessage(e, 'PNG ダウンロードに失敗しました'));
    }
  };

  const usedAis = useMemo(() => new Set(aiFields.map((f) => f.ai)), [aiFields]);
  const canAddField = aiFields.length < AI_DEFS.length;
  const sampleGtin = SAMPLE_GTINS[index % SAMPLE_GTINS.length];
  const gs1String = useMemo(
    () =>
      gtinResult
        ? buildBwipText(
            gtinResult.fullGtin,
            aiFields.map((f) => ({ ai: f.ai, value: f.value }))
          )
        : '',
    [gtinResult, aiFields]
  );

  return (
    <div className="rounded-lg border border-input bg-default">
      {/* カードヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 rounded-t-lg bg-subtle border-b border-default">
        <span className="caption font-bold text-default">
          バーコード {index + 1}
          {gtinResult && (
            <span className="font-mono ml-2 caption text-muted">— {gtinResult.fullGtin}</span>
          )}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded px-2 py-1 caption btn-remove-card"
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
          <div className="rounded-lg p-3 flex flex-wrap items-center gap-x-6 gap-y-2 border border-default bg-surface">
            <div className="flex items-center gap-2">
              <span className="caption text-muted">チェックディジット</span>
              <span className="body-emphasis text-primary">{gtinResult.checkDigit}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="caption text-muted">GTIN-14</span>
              <span className="font-mono body-emphasis text-default tracking-widest">
                {gtinResult.fullGtin}
              </span>
              <span className="hidden sm:inline-flex">
                <CopyButton text={gtinResult.fullGtin} label="コピー" />
              </span>
              <span className="sm:hidden inline-flex">
                <CopyButton text={gtinResult.fullGtin} compact />
              </span>
            </div>
          </div>
        )}

        {/* AIフィールド */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="caption text-default font-semibold">合成シンボル（任意）</span>
            {canAddField && (
              <button
                type="button"
                onClick={addAiField}
                className="caption text-link-color hover:underline"
              >
                + フィールド追加
              </button>
            )}
          </div>
          <div className="space-y-3">
            {aiFields.map((field, i) => {
              const def = AI_DEFS.find((d) => d.ai === field.ai)!;
              return (
                <div key={i} className="flex flex-col sm:flex-row gap-2 items-start">
                  <div className="w-full sm:w-50 shrink-0">
                    <Select<AiCode>
                      value={field.ai}
                      onChange={(v) => handleAiSelect(i, v)}
                      ariaLabel={`AI コード ${i + 1}`}
                      options={AI_DEFS.map((d) => ({
                        value: d.ai,
                        label: d.label,
                        disabled: usedAis.has(d.ai) && d.ai !== field.ai,
                      }))}
                    />
                  </div>
                  <div className="flex-1 w-full flex gap-2 items-start">
                    <div className="flex-1">
                      <BareInput
                        type="text"
                        value={field.value}
                        onChange={(v) => handleAiChange(i, v)}
                        placeholder={def.placeholder}
                        mono
                        error={!!field.error}
                        aria-label={`AI フィールド値 ${i + 1}`}
                      />
                      {field.error && (
                        <p role="alert" className="caption text-error mt-1">
                          {field.error}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAiField(i)}
                      className="rounded-lg p-2 shrink-0 caption text-muted bg-transparent hover-bg-subtle mt-0.5 inline-flex items-center justify-center"
                      aria-label="フィールドを削除"
                    >
                      <CloseIcon size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* バーコードプレビュー */}
        {svgContent && (
          <div
            className="rounded-lg flex flex-col items-center gap-4 p-5 border border-default bg-surface"
            role="status"
            aria-live="polite"
          >
            <div
              aria-label={`GS1 DataBar ${gtinResult?.fullGtin} のバーコード`}
              className="barcode-preview"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
            <DownloadButtonGroup onDownloadSvg={downloadSvg} onDownloadPng={downloadPng} />
          </div>
        )}

        {bwipError && (
          <ErrorMessage message={`バーコード生成エラー: ${bwipError}`} variant="block" />
        )}

        {downloadError && (
          <ErrorMessage message={`ダウンロードエラー: ${downloadError}`} variant="block" />
        )}

        {/* GS1文字列プレビュー */}
        {gtinResult && (
          <details className="rounded-lg border border-default">
            <summary className="cursor-pointer px-4 py-3 rounded-lg caption font-bold text-default bg-transparent hover-bg-subtle summary-no-marker">
              GS1文字列を見る
            </summary>
            <div className="px-4 pb-4 pt-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded px-3 py-2 font-mono break-all caption bg-subtle text-default">
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
  // useId は SSR/CSR で同じ値を返すため hydration mismatch を避けられる。
  // 複数 card 用に incremental counter で suffix を付与する (crypto.randomUUID() は SSR/CSR で値が割れるため不可)。
  const idPrefix = useId();
  const cardCounterRef = useRef(1);
  const [cards, setCards] = useState<CardMeta[]>(() => [{ id: `${idPrefix}-card-0` }]);
  const [cardSvgs, setCardSvgs] = useState<Record<string, CardSvgState>>({});
  const [isZipping, setIsZipping] = useState(false);
  const [zipError, setZipError] = useState('');

  const addCard = () => {
    if (cards.length >= MAX_CARDS) return;
    const newId = `${idPrefix}-card-${cardCounterRef.current++}`;
    setCards((prev) => [...prev, { id: newId }]);
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

  // svgContentToPngBlob / downloadZip は reject 可能。旧実装は try/finally のみで
  // unhandled promise rejection を発生させていた (issue #338)。catch を追加し
  // ZipError state 経由でユーザーに通知する。
  const downloadAllZip = async () => {
    if (!canDownloadAll || isZipping) return;
    setIsZipping(true);
    setZipError('');
    try {
      // 各 SVG を PNG 変換してから flat なエントリ一覧を作る。
      // gtin はバリデーション済みだが defense-in-depth でサニタイズする。
      // `gs1-databars/` サブフォルダ配下に格納して従来の ZIP 構造を維持する。
      const fileGroups = await Promise.all(
        validEntries.map(async ([, { svg, gtin }]) => {
          const pngBlob = await svgContentToPngBlob(svg);
          return [
            {
              name: sanitizeFilename(`gs1-databar-${gtin}.svg`, ['svg']),
              content: svg,
              folder: 'gs1-databars',
            },
            {
              name: sanitizeFilename(`gs1-databar-${gtin}.png`, ['png']),
              content: pngBlob,
              folder: 'gs1-databars',
            },
          ];
        })
      );
      await downloadZip(fileGroups.flat(), 'gs1-databars.zip');
    } catch (e) {
      setZipError(getErrorMessage(e, 'ZIP ダウンロードに失敗しました'));
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="space-y-6">
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
            type="button"
            onClick={addCard}
            className="rounded px-4 py-2 caption font-bold border border-primary bg-transparent text-primary hover-bg-active"
          >
            + バーコードを追加
          </button>
        )}
        {cards.length >= MAX_CARDS && (
          <span className="caption text-muted">最大 {MAX_CARDS} 件まで追加できます</span>
        )}

        {canDownloadAll && (
          <DownloadButton
            onClick={downloadAllZip}
            disabled={isZipping}
            label={isZipping ? 'ZIP作成中...' : `全件ZIPダウンロード（${validEntries.length}件）`}
            variant="primary"
          />
        )}
      </div>

      {zipError && <ErrorMessage message={`ZIP ダウンロードエラー: ${zipError}`} variant="block" />}
    </div>
  );
}
