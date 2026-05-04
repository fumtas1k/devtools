import { CopyButton } from '@/components/ui/CopyButton';
import { InputField } from '@/components/ui/InputField';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { Section } from '@/components/ui/Section';
import { BareInput } from '@/components/ui/BareInput';
import { ActionButton } from '@/components/ui/ActionButton';
import { generateTicketId, estimateTicketByteSize, MAX_QR_BYTE_SIZE } from '@/utils/qr-ticket';
import { MAX_TICKETS } from './index';
import type { TicketRow, GeneratedQr } from './types';
import type { TicketPayload } from '@/utils/qr-ticket';

/** プレビューやバイト数見積もりで使用するデフォルトの有効期限（2025-01-01T00:00:00Z） */
const PREVIEW_FALLBACK_TIMESTAMP = 1735689600;

/** 鍵ペアセクションに渡す props */
export interface KeyPairSectionProps {
  cryptoKeyPair: CryptoKeyPair | null;
  privateKeyJwkStr: string;
  publicKeyJwkStr: string;
  keyGenerating: boolean;
  keyError: string;
  showImport: boolean;
  importStr: string;
  onGenerateKeys: () => void;
  onToggleImport: () => void;
  onImportStrChange: (v: string) => void;
  onImportKey: () => void;
}

/** チケット生成・編集・ZIPに渡す props */
export interface GenerationSectionProps {
  eventId: string;
  expiry: string;
  tickets: TicketRow[];
  generating: boolean;
  generateError: string;
  generatedQrs: GeneratedQr[];
  zipping: boolean;
  zipError: string;
  onEventIdChange: (v: string) => void;
  onExpiryChange: (v: string) => void;
  onAddTicket: () => void;
  onRemoveTicket: (i: number) => void;
  onUpdateTicket: (i: number, field: keyof TicketRow, value: string) => void;
  onGenerate: () => void;
  onDownloadSvg: (qr: GeneratedQr) => void;
  onDownloadZip: () => void;
}

interface GenerateTabProps {
  keyPair: KeyPairSectionProps;
  generation: GenerationSectionProps;
}

export function GenerateTab({ keyPair, generation }: GenerateTabProps) {
  const {
    cryptoKeyPair,
    privateKeyJwkStr,
    publicKeyJwkStr,
    keyGenerating,
    keyError,
    showImport,
    importStr,
    onGenerateKeys,
    onToggleImport,
    onImportStrChange,
    onImportKey,
  } = keyPair;

  const {
    eventId,
    expiry,
    tickets,
    generating,
    generateError,
    generatedQrs,
    zipping,
    zipError,
    onEventIdChange,
    onExpiryChange,
    onAddTicket,
    onRemoveTicket,
    onUpdateTicket,
    onGenerate,
    onDownloadSvg,
    onDownloadZip,
  } = generation;

  /** 共通のペイロードを構築 */
  const buildCurrentPayload = (row: TicketRow): TicketPayload => ({
    e: eventId.trim(),
    t: row.id.trim(),
    timestamp: expiry ? Math.floor(new Date(expiry).getTime() / 1000) : PREVIEW_FALLBACK_TIMESTAMP,
    n: row.name.trim() || undefined,
    p: row.category.trim() || undefined,
  });

  return (
    <div className="space-y-6">
      {/* 鍵ペアセクション */}
      <Section title="鍵ペア">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              onClick={onGenerateKeys}
              disabled={keyGenerating}
              loading={keyGenerating}
              variant="primary"
            >
              {keyGenerating ? '生成中…' : '鍵ペアを新規生成'}
            </ActionButton>
            <button
              type="button"
              onClick={onToggleImport}
              aria-expanded={showImport}
              aria-controls="qr-ticket-import-panel"
              className="caption text-link btn-link-plain"
            >
              <span aria-hidden="true">{showImport ? '▲ ' : '▼ '}</span>
              {showImport ? '秘密鍵インポートを閉じる' : '既存の秘密鍵をインポート'}
            </button>
          </div>

          {showImport && (
            <div id="qr-ticket-import-panel" className="space-y-2">
              <InputField
                id="import-privkey"
                label="秘密鍵 JWK"
                value={importStr}
                onChange={onImportStrChange}
                multiline
                rows={5}
                mono
                placeholder='{"kty":"EC","crv":"P-256",...}'
              />
              <ActionButton onClick={onImportKey} disabled={!importStr.trim()}>
                インポート
              </ActionButton>
            </div>
          )}

          {keyError && <ErrorMessage message={keyError} />}

          {privateKeyJwkStr && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="caption font-semibold text-default">秘密鍵（主催者が保管）</span>
                  <CopyButton text={privateKeyJwkStr} label="コピー" />
                </div>
                <textarea
                  readOnly
                  value={privateKeyJwkStr}
                  rows={4}
                  className="caption font-mono w-full px-3 py-2 rounded-lg border border-input bg-surface text-default resize-none"
                  aria-label="秘密鍵（主催者が保管）"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="caption font-semibold text-default">
                    公開鍵（検証スタッフへ共有）
                  </span>
                  <CopyButton text={publicKeyJwkStr} label="コピー" />
                </div>
                <textarea
                  readOnly
                  value={publicKeyJwkStr}
                  rows={4}
                  className="caption font-mono w-full px-3 py-2 rounded-lg border border-input bg-surface text-default resize-none"
                  aria-label="公開鍵（検証スタッフへ共有）"
                />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* イベント情報セクション */}
      <Section title="イベント情報">
        <div className="space-y-3">
          <InputField
            id="event-id"
            label="イベントID"
            value={eventId}
            onChange={onEventIdChange}
            placeholder="event-2026-04"
            hint="QRコードに埋め込まれます"
            mono
          />
          <div>
            <label htmlFor="expiry" className="body-emphasis text-default block mb-3">
              有効期限
            </label>
            <BareInput id="expiry" type="datetime-local" value={expiry} onChange={onExpiryChange} />
          </div>
        </div>
      </Section>

      {/* チケットリストセクション */}
      <Section
        title={`チケットリスト（最大${MAX_TICKETS}件）`}
        headerSlot={
          <span className="caption text-muted">
            ※全項目の合計で{MAX_QR_BYTE_SIZE}バイト以内を推奨
          </span>
        }
      >
        <div>
          <div className="space-y-2">
            {/* ヘッダ行 (PCのみ) */}
            <div className="hidden md:flex gap-2 items-center mb-1">
              <span className="flex-1 min-w-0 caption text-muted font-semibold">チケットID</span>
              <span className="flex-1 min-w-0 caption text-muted font-semibold">
                参加者名（任意）
              </span>
              <span className="flex-1 min-w-0 caption text-muted font-semibold">
                料金区分（任意）
              </span>
              <span className="w-15 text-right caption text-muted font-semibold">サイズ</span>
              <span className="w-8"></span>
            </div>

            {tickets.map((row, i) => {
              const payload = buildCurrentPayload(row);
              const byteSize = estimateTicketByteSize(payload);
              const isOver = byteSize > MAX_QR_BYTE_SIZE;

              return (
                <div
                  key={row._key}
                  className={`flex flex-col md:flex-row gap-2 items-stretch md:items-center mb-6 md:mb-0 pb-4 md:pb-0 border-b border-(--color-border) md:border-b-0 ${
                    i === tickets.length - 1 ? 'border-none' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className="md:hidden caption text-muted font-semibold leading-none">
                      チケットID
                    </span>
                    <BareInput
                      value={row.id}
                      onChange={(v) => onUpdateTicket(i, 'id', v)}
                      placeholder={generateTicketId(i + 1)}
                      mono
                      aria-label={`チケットID ${i + 1}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className="md:hidden caption text-muted font-semibold leading-none">
                      参加者名（任意）
                    </span>
                    <BareInput
                      value={row.name}
                      onChange={(v) => onUpdateTicket(i, 'name', v)}
                      placeholder="山田 太郎"
                      aria-label={`参加者名 ${i + 1}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className="md:hidden caption text-muted font-semibold leading-none">
                      料金区分（任意）
                    </span>
                    <BareInput
                      value={row.category}
                      onChange={(v) => onUpdateTicket(i, 'category', v)}
                      placeholder="一般・VIP など"
                      aria-label={`料金区分 ${i + 1}`}
                    />
                  </div>
                  <div className="flex items-center justify-between md:justify-end gap-2 mt-2 md:mt-0">
                    <span className="md:hidden caption text-muted font-semibold">合計データ量</span>
                    <span
                      className={`w-auto md:w-15 caption text-right ${isOver ? 'text-error font-semibold' : 'text-muted'}`}
                      title="QRコードに埋め込まれる全データ（署名・時間含む）の合計バイト数"
                    >
                      {byteSize} B
                    </span>
                    <button
                      type="button"
                      className="flex items-center justify-center caption min-w-10 min-h-10 p-3 btn-row-remove"
                      onClick={() => onRemoveTicket(i)}
                      disabled={tickets.length <= 1}
                      aria-label={`行 ${i + 1} を削除`}
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <ActionButton onClick={onAddTicket} disabled={tickets.length >= MAX_TICKETS}>
              <span aria-hidden="true">＋ </span>行を追加
            </ActionButton>
            <ActionButton
              onClick={onGenerate}
              disabled={generating || !cryptoKeyPair}
              loading={generating}
              variant="primary"
            >
              {generating ? '生成中…' : '一括生成'}
            </ActionButton>
          </div>
          {generateError && (
            <div className="mt-3">
              <ErrorMessage message={generateError} />
            </div>
          )}
        </div>
      </Section>

      {/* 生成結果セクション */}
      {generatedQrs.length > 0 && (
        <Section
          title={`生成結果（${generatedQrs.length}件）`}
          headerSlot={
            generatedQrs.length >= 2 ? (
              <DownloadButton
                onClick={onDownloadZip}
                disabled={zipping}
                label={zipping ? '準備中…' : '一括ZIPダウンロード'}
                variant="primary"
              />
            ) : undefined
          }
        >
          <div>
            {zipError && (
              <div className="mb-4">
                <ErrorMessage message={zipError} />
              </div>
            )}
            <div className="gap-4 qr-result-grid">
              {generatedQrs.map((qr) => (
                <div
                  key={qr._key}
                  className="flex flex-col items-center gap-2 rounded-lg p-3 border border-default bg-surface"
                >
                  <div
                    data-testid="qr-code-container"
                    className="w-40 h-40"
                    dangerouslySetInnerHTML={{ __html: qr.svg }}
                  />
                  <span className="caption font-mono font-semibold text-default">
                    {qr.ticket.t}
                  </span>
                  {qr.ticket.n && <span className="caption text-muted">{qr.ticket.n}</span>}
                  {qr.ticket.p && <span className="caption badge-category">{qr.ticket.p}</span>}
                  <DownloadButton
                    onClick={() => onDownloadSvg(qr)}
                    label="SVGダウンロード"
                    variant="secondary"
                  />
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
