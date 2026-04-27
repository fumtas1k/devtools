import { CopyButton } from '@/components/ui/CopyButton';
import { InputField } from '@/components/ui/InputField';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { bodyEmphasis, caption, colors } from '@/utils/styles';
import { generateTicketId } from '@/utils/qr-ticket';
import { ActionButton } from './ActionButton';
import { MAX_TICKETS, sectionStyle, sectionHeaderStyle, sectionBodyStyle } from './index';
import type { TicketRow, GeneratedQr } from './types';

interface GenerateTabProps {
  cryptoKeyPair: CryptoKeyPair | null;
  privateKeyJwkStr: string;
  publicKeyJwkStr: string;
  keyGenerating: boolean;
  keyError: string;
  showImport: boolean;
  importStr: string;
  eventId: string;
  expiry: string;
  tickets: TicketRow[];
  generating: boolean;
  generateError: string;
  generatedQrs: GeneratedQr[];
  zipping: boolean;
  zipError: string;
  onGenerateKeys: () => void;
  onToggleImport: () => void;
  onImportStrChange: (v: string) => void;
  onImportKey: () => void;
  onEventIdChange: (v: string) => void;
  onExpiryChange: (v: string) => void;
  onAddTicket: () => void;
  onRemoveTicket: (i: number) => void;
  onUpdateTicket: (i: number, field: keyof TicketRow, value: string) => void;
  onGenerate: () => void;
  onDownloadSvg: (qr: GeneratedQr) => void;
  onDownloadZip: () => void;
}

export function GenerateTab({
  cryptoKeyPair,
  privateKeyJwkStr,
  publicKeyJwkStr,
  keyGenerating,
  keyError,
  showImport,
  importStr,
  eventId,
  expiry,
  tickets,
  generating,
  generateError,
  generatedQrs,
  zipping,
  zipError,
  onGenerateKeys,
  onToggleImport,
  onImportStrChange,
  onImportKey,
  onEventIdChange,
  onExpiryChange,
  onAddTicket,
  onRemoveTicket,
  onUpdateTicket,
  onGenerate,
  onDownloadSvg,
  onDownloadZip,
}: GenerateTabProps) {
  const encoder = new TextEncoder();

  /** 1行あたりのデータサイズ（バイト数）を計算 */
  const getByteSize = (row: TicketRow) => {
    const data = `${eventId.trim()}|${row.id.trim()}|${row.name.trim()}|${row.category.trim()}`;
    return encoder.encode(data).length;
  };

  return (
    <div className="space-y-6">
      {/* 鍵ペアセクション */}
      <div style={sectionStyle}>
        <h3 style={sectionHeaderStyle}>鍵ペア</h3>
        <div className="space-y-3" style={sectionBodyStyle}>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton onClick={onGenerateKeys} disabled={keyGenerating} variant="primary">
              {keyGenerating ? '生成中…' : '鍵ペアを新規生成'}
            </ActionButton>
            <button
              type="button"
              onClick={onToggleImport}
              style={{
                ...caption,
                color: colors.link,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {showImport ? '▲ 秘密鍵インポートを閉じる' : '▼ 既存の秘密鍵をインポート'}
            </button>
          </div>

          {showImport && (
            <div className="space-y-2">
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
                <div
                  className="flex items-center justify-between"
                  style={{ marginBottom: '0.5rem' }}
                >
                  <span style={{ ...caption, fontWeight: 600, color: colors.text }}>
                    秘密鍵（主催者が保管）
                  </span>
                  <CopyButton text={privateKeyJwkStr} label="コピー" />
                </div>
                <textarea
                  readOnly
                  value={privateKeyJwkStr}
                  rows={4}
                  style={{
                    ...caption,
                    fontFamily: 'monospace',
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: `1px solid ${colors.borderInput}`,
                    background: colors.bgSurface,
                    color: colors.text,
                    resize: 'none',
                  }}
                  aria-label="秘密鍵（主催者が保管）"
                />
              </div>
              <div>
                <div
                  className="flex items-center justify-between"
                  style={{ marginBottom: '0.5rem' }}
                >
                  <span style={{ ...caption, fontWeight: 600, color: colors.text }}>
                    公開鍵（検証スタッフへ共有）
                  </span>
                  <CopyButton text={publicKeyJwkStr} label="コピー" />
                </div>
                <textarea
                  readOnly
                  value={publicKeyJwkStr}
                  rows={4}
                  style={{
                    ...caption,
                    fontFamily: 'monospace',
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: `1px solid ${colors.borderInput}`,
                    background: colors.bgSurface,
                    color: colors.text,
                    resize: 'none',
                  }}
                  aria-label="公開鍵（検証スタッフへ共有）"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* イベント情報セクション */}
      <div style={sectionStyle}>
        <h3 style={sectionHeaderStyle}>イベント情報</h3>
        <div className="space-y-3" style={sectionBodyStyle}>
          <InputField
            id="event-id"
            label="イベントID"
            value={eventId}
            onChange={onEventIdChange}
            placeholder="event-2026-04"
            hint="QRコードに埋め込まれます"
          />
          <div>
            <label
              htmlFor="expiry"
              style={{
                ...bodyEmphasis,
                color: colors.text,
                display: 'block',
                marginBottom: '0.75rem',
              }}
            >
              有効期限
            </label>
            <input
              id="expiry"
              type="datetime-local"
              value={expiry}
              onChange={(e) => onExpiryChange(e.target.value)}
              style={{
                ...caption,
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
                border: `1px solid ${colors.borderInput}`,
                background: colors.bg,
                color: colors.text,
                outline: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* チケットリストセクション */}
      <div style={sectionStyle}>
        <div className="flex items-center justify-between" style={sectionHeaderStyle}>
          <h3>チケットリスト（最大{MAX_TICKETS}件）</h3>
          <span style={{ ...caption, color: colors.muted }}>
            ※全項目の合計で300バイト以内を推奨
          </span>
        </div>

        <div style={sectionBodyStyle}>
          <div className="space-y-2">
            {/* ヘッダ行 */}
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: '1fr 1fr 1fr 60px auto', alignItems: 'center' }}
            >
              {(['チケットID', '参加者名（任意）', '料金区分（任意）', 'サイズ', ''] as const).map(
                (h) => (
                  <span key={h} style={{ ...caption, color: colors.muted, fontWeight: 600 }}>
                    {h}
                  </span>
                )
              )}
            </div>
            {tickets.map((row, i) => {
              const byteSize = getByteSize(row);
              const isOver = byteSize > 300;

              return (
                <div
                  key={row._key}
                  className="grid gap-2"
                  style={{ gridTemplateColumns: '1fr 1fr 1fr 60px auto', alignItems: 'center' }}
                >
                  <input
                    value={row.id}
                    onChange={(e) => onUpdateTicket(i, 'id', e.target.value)}
                    placeholder={generateTicketId(i + 1)}
                    style={{
                      ...caption,
                      fontFamily: 'monospace',
                      padding: '0.4rem 0.5rem',
                      borderRadius: '0.375rem',
                      border: `1px solid ${colors.borderInput}`,
                      background: colors.bg,
                      color: colors.text,
                      outline: 'none',
                      width: '100%',
                    }}
                    aria-label={`チケットID ${i + 1}`}
                  />
                  <input
                    value={row.name}
                    onChange={(e) => onUpdateTicket(i, 'name', e.target.value)}
                    placeholder="山田 太郎"
                    style={{
                      ...caption,
                      padding: '0.4rem 0.5rem',
                      borderRadius: '0.375rem',
                      border: `1px solid ${colors.borderInput}`,
                      background: colors.bg,
                      color: colors.text,
                      outline: 'none',
                      width: '100%',
                    }}
                    aria-label={`参加者名 ${i + 1}`}
                  />
                  <input
                    value={row.category}
                    onChange={(e) => onUpdateTicket(i, 'category', e.target.value)}
                    placeholder="一般・VIP など"
                    style={{
                      ...caption,
                      padding: '0.4rem 0.5rem',
                      borderRadius: '0.375rem',
                      border: `1px solid ${colors.borderInput}`,
                      background: colors.bg,
                      color: colors.text,
                      outline: 'none',
                      width: '100%',
                    }}
                    aria-label={`料金区分 ${i + 1}`}
                  />
                  <span
                    style={{
                      ...caption,
                      textAlign: 'right',
                      color: isOver ? colors.error : colors.muted,
                      fontWeight: isOver ? 600 : 400,
                    }}
                    title="イベントID・チケットID・名前・料金区分の合計バイト数"
                  >
                    {byteSize} B
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveTicket(i)}
                    disabled={tickets.length <= 1}
                    aria-label={`行 ${i + 1} を削除`}
                    style={{
                      ...caption,
                      color: tickets.length <= 1 ? colors.muted : colors.error,
                      background: 'none',
                      border: 'none',
                      cursor: tickets.length <= 1 ? 'not-allowed' : 'pointer',
                      padding: '0.25rem',
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <ActionButton onClick={onAddTicket} disabled={tickets.length >= MAX_TICKETS}>
              ＋ 行を追加
            </ActionButton>
            <ActionButton
              onClick={onGenerate}
              disabled={generating || !cryptoKeyPair}
              variant="primary"
            >
              {generating ? '生成中…' : '一括生成'}
            </ActionButton>
          </div>
          {generateError && (
            <div style={{ marginTop: '0.75rem' }}>
              <ErrorMessage message={generateError} />
            </div>
          )}
        </div>
      </div>

      {/* 生成結果セクション */}
      {generatedQrs.length > 0 && (
        <div style={sectionStyle}>
          <div
            className="flex items-center justify-between flex-wrap gap-2"
            style={sectionHeaderStyle}
          >
            <span>生成結果（{generatedQrs.length}件）</span>
            {generatedQrs.length >= 2 && (
              <DownloadButton
                onClick={onDownloadZip}
                disabled={zipping}
                label={zipping ? '準備中…' : '一括ZIPダウンロード'}
                variant="primary"
              />
            )}
          </div>
          {zipError && (
            <div style={{ padding: '0.5rem 1rem', borderBottom: `1px solid ${colors.border}` }}>
              <ErrorMessage message={zipError} />
            </div>
          )}
          <div
            className="grid gap-4 p-4"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              background: colors.bg,
            }}
          >
            {generatedQrs.map((qr) => (
              <div
                key={qr._key}
                className="flex flex-col items-center gap-2 rounded-lg p-3"
                style={{ border: `1px solid ${colors.border}`, background: colors.bgSurface }}
              >
                <div
                  data-testid="qr-code-container"
                  style={{ width: '160px', height: '160px' }}
                  dangerouslySetInnerHTML={{ __html: qr.svg }}
                />
                <span
                  style={{
                    ...caption,
                    color: colors.text,
                    fontFamily: 'monospace',
                    fontWeight: 600,
                  }}
                >
                  {qr.ticket.t}
                </span>
                {qr.ticket.n && (
                  <span style={{ ...caption, color: colors.muted }}>{qr.ticket.n}</span>
                )}
                {qr.ticket.p && (
                  <span
                    style={{
                      ...caption,
                      color: colors.primary,
                      border: `1px solid ${colors.primary}`,
                      borderRadius: '9999px',
                      padding: '0.1rem 0.5rem',
                    }}
                  >
                    {qr.ticket.p}
                  </span>
                )}
                <DownloadButton
                  onClick={() => onDownloadSvg(qr)}
                  label="SVGダウンロード"
                  variant="secondary"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
