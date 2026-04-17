import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import JSZip from 'jszip';
import {
  generateKeyPair,
  exportKeyPair,
  importPrivateKey,
  importPublicKey,
  signTicket,
  verifyTicket,
  generateQrSvg,
  ticketToQrString,
  generateTicketId,
  type SignedTicket,
  type TicketPayload,
  type VerificationResult,
} from '@/utils/qr-ticket';
import { downloadSvg } from '@/utils/download';
import { InputField } from '@/components/ui/InputField';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { CopyButton } from '@/components/ui/CopyButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { bodyEmphasis, caption, micro, colors, onFocusRing, onBlurRing } from '@/utils/styles';

// ─── 内部型定義 ───────────────────────────────────────────

interface TicketRow {
  _key: number;   // React key用の安定した識別子（削除・並び替え時の取り違えを防ぐ）
  id: string;
  name: string;
  category: string;
}

interface GeneratedQr {
  _key: number;   // チケット行の安定識別子（チケットID重複時のkey衝突を防ぐ）
  ticket: SignedTicket;
  svg: string;
  qrString: string;
}

// ─── 定数 ────────────────────────────────────────────────

const MODE_OPTIONS = [
  { value: 'generate' as const, label: '生成' },
  { value: 'verify' as const, label: '検証' },
];

const SCAN_OPTIONS = [
  { value: 'camera' as const, label: 'カメラ' },
  { value: 'upload' as const, label: '画像アップロード' },
];

const MAX_TICKETS = 20;

// ─── スタイルヘルパー ─────────────────────────────────────

const sectionStyle = {
  borderRadius: '0.75rem',
  border: `1px solid ${colors.border}`,
  overflow: 'hidden' as const,
};

const sectionHeaderStyle = {
  ...bodyEmphasis,
  color: colors.text,
  padding: '0.75rem 1rem',
  margin: 0,
  background: colors.bgSubtle,
  borderBottom: `1px solid ${colors.border}`,
};

const sectionBodyStyle = {
  padding: '1rem',
  background: colors.bg,
};

function ActionButton({
  onClick,
  disabled,
  children,
  variant = 'default',
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'danger';
}) {
  const bgMap = {
    default: colors.bgSubtle,
    primary: colors.primary,
    danger: 'transparent',
  };
  const colorMap = {
    default: colors.text,
    primary: '#ffffff',
    danger: colors.error,
  };
  const borderMap = {
    default: colors.borderInput,
    primary: colors.primary,
    danger: colors.error,
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...caption,
        fontWeight: 600,
        padding: '0.5rem 1rem',
        borderRadius: '0.5rem',
        border: `1px solid ${borderMap[variant]}`,
        background: disabled ? colors.bgSubtle : bgMap[variant],
        color: disabled ? colors.muted : colorMap[variant],
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap' as const,
      }}
      onFocus={onFocusRing}
      onBlur={onBlurRing}
    >
      {children}
    </button>
  );
}

// ─── メインコンポーネント ─────────────────────────────────

export function QrTicketTool() {
  const [mode, setMode] = useState<'generate' | 'verify'>('generate');

  // 鍵ペア状態
  const [cryptoKeyPair, setCryptoKeyPair] = useState<CryptoKeyPair | null>(null);
  const [privateKeyJwkStr, setPrivateKeyJwkStr] = useState('');
  const [publicKeyJwkStr, setPublicKeyJwkStr] = useState('');
  const [keyGenerating, setKeyGenerating] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importStr, setImportStr] = useState('');

  // 生成タブ状態
  const [eventId, setEventId] = useState('');
  const [expiry, setExpiry] = useState('');
  const ticketKeyRef = useRef(1);
  const [tickets, setTickets] = useState<TicketRow[]>([
    { _key: 1, id: generateTicketId(1), name: '', category: '' },
  ]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generatedQrs, setGeneratedQrs] = useState<GeneratedQr[]>([]);
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState('');

  // 検証タブ状態
  const [verifyPubKeyStr, setVerifyPubKeyStr] = useState('');
  const [scanMode, setScanMode] = useState<'camera' | 'upload'>('camera');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  // カメラ refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanningRef = useRef(false);

  // アンマウント検知 ref（非同期処理後のステート更新ガード用）
  const mountedRef = useRef(true);

  // カメラ停止（useEffect cleanup 用）
  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    scanningRef.current = false;
    setCameraActive(false);
  }, []);

  // モード切替時にカメラを停止
  useEffect(() => {
    if (mode !== 'verify') stopCamera();
  }, [mode, stopCamera]);

  // アンマウント時にカメラを停止 + mountedRef を false にセット
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  // ─── 鍵操作 ──────────────────────────────────────────────

  const handleGenerateKeys = async () => {
    setKeyGenerating(true);
    setKeyError('');
    try {
      const pair = await generateKeyPair();
      const exported = await exportKeyPair(pair);
      const privStr = JSON.stringify(exported.privateKey, null, 2);
      const pubStr = JSON.stringify(exported.publicKey, null, 2);
      setCryptoKeyPair(pair);
      setPrivateKeyJwkStr(privStr);
      setPublicKeyJwkStr(pubStr);
      setVerifyPubKeyStr(pubStr);
      setGenerateError('');
    } catch {
      setKeyError('鍵の生成に失敗しました');
    } finally {
      setKeyGenerating(false);
    }
  };

  const handleImportKey = async () => {
    setKeyError('');
    let jwk: JsonWebKey;
    try {
      jwk = JSON.parse(importStr) as JsonWebKey;
    } catch {
      setKeyError('JSON形式が不正です');
      return;
    }
    if (!('d' in jwk)) {
      setKeyError('これは公開鍵です。秘密鍵（"d" フィールドを含むJWK）を入力してください。');
      return;
    }
    try {
      const privKey = await importPrivateKey(jwk);
      // ECDSA JWK から公開鍵部分を抽出（d フィールドを除去）
      const { d: _d, key_ops: _ops, ...pubJwk } = jwk as Record<string, unknown>;
      const pubKeyJwk = { ...pubJwk, key_ops: ['verify'] } as JsonWebKey;
      const pubKey = await importPublicKey(pubKeyJwk);
      const privStr = JSON.stringify(jwk, null, 2);
      const pubStr = JSON.stringify(pubKeyJwk, null, 2);
      setCryptoKeyPair({ privateKey: privKey, publicKey: pubKey });
      setPrivateKeyJwkStr(privStr);
      setPublicKeyJwkStr(pubStr);
      setVerifyPubKeyStr(pubStr);
      setShowImport(false);
      setImportStr('');
    } catch {
      setKeyError('秘密鍵のインポートに失敗しました。有効なECDSA P-256 JWKを入力してください。');
    }
  };

  // ─── チケット編集 ─────────────────────────────────────────

  const addTicket = () => {
    if (tickets.length >= MAX_TICKETS) return;
    ticketKeyRef.current += 1;
    const newKey = ticketKeyRef.current;
    setTickets((prev) => [
      ...prev,
      { _key: newKey, id: generateTicketId(prev.length + 1), name: '', category: '' },
    ]);
  };

  const removeTicket = (index: number) => {
    setTickets((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTicket = (index: number, field: keyof TicketRow, value: string) => {
    setTickets((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  };

  // ─── QR生成 ───────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!cryptoKeyPair) { setGenerateError('先に鍵ペアを生成またはインポートしてください'); return; }
    if (!eventId.trim()) { setGenerateError('イベントIDを入力してください'); return; }
    if (!expiry) { setGenerateError('有効期限を設定してください'); return; }
    if (tickets.length === 0) { setGenerateError('チケットを1件以上追加してください'); return; }
    const emptyId = tickets.find((t) => !t.id.trim());
    if (emptyId) { setGenerateError('チケットIDが空の行があります'); return; }

    setGenerating(true);
    setGenerateError('');
    try {
      const results: GeneratedQr[] = [];
      for (const row of tickets) {
        const payload: TicketPayload = {
          e: eventId.trim(),
          t: row.id.trim(),
          x: expiry,
          ...(row.name.trim() ? { n: row.name.trim() } : {}),
          ...(row.category.trim() ? { p: row.category.trim() } : {}),
        };
        const signed = await signTicket(payload, cryptoKeyPair.privateKey);
        const qrString = ticketToQrString(signed);
        const svg = generateQrSvg(qrString);
        if (!svg) {
          setGenerateError(`チケット ${row.id} のQRコード生成に失敗しました（データが長すぎます）`);
          setGenerating(false);
          return;
        }
        results.push({ _key: row._key, ticket: signed, svg, qrString });
      }
      setGeneratedQrs(results);
    } catch {
      setGenerateError('QRコードの生成中にエラーが発生しました');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadSvg = (qr: GeneratedQr) => {
    downloadSvg(qr.svg, `ticket-${qr.ticket.t}.svg`);
  };

  const handleDownloadZip = async () => {
    if (generatedQrs.length === 0 || zipping) return;
    setZipping(true);
    setZipError('');
    try {
      const zip = new JSZip();
      const folder = zip.folder('tickets')!;
      generatedQrs.forEach(({ ticket, svg }) => {
        folder.file(`ticket-${ticket.t}.svg`, svg);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tickets.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setZipError('ZIPの作成に失敗しました');
    } finally {
      setZipping(false);
    }
  };

  // ─── QR検証 ───────────────────────────────────────────────

  const handleVerify = useCallback(
    async (rawData: string) => {
      setVerifying(true);
      let pubKey: CryptoKey;
      try {
        const jwk = JSON.parse(verifyPubKeyStr) as JsonWebKey;
        pubKey = await importPublicKey(jwk);
      } catch {
        if (!mountedRef.current) return;
        setVerificationResult({
          valid: false,
          ticket: null,
          expired: false,
          error: '公開鍵の形式が不正です。有効なECDSA P-256 JWKを貼り付けてください。',
        });
        setVerifying(false);
        return;
      }
      const result = await verifyTicket(rawData, pubKey);
      if (!mountedRef.current) return;
      setVerificationResult(result);
      setVerifying(false);
    },
    [verifyPubKeyStr],
  );

  const handleStartCamera = async () => {
    setCameraError('');
    setVerificationResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      scanningRef.current = true;

      const scan = () => {
        if (!scanningRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        if (video.readyState >= 2 && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(imageData.data, imageData.width, imageData.height);
            if (found) {
              stopCamera();
              handleVerify(found.data);
              return;
            }
          }
        }
        rafRef.current = requestAnimationFrame(scan);
      };
      rafRef.current = requestAnimationFrame(scan);
    } catch (err) {
      const e = err as DOMException;
      if (e.name === 'NotAllowedError') {
        setCameraError('カメラへのアクセスが拒否されました。ブラウザの設定で許可してください。');
      } else if (e.name === 'NotFoundError') {
        setCameraError('カメラが見つかりません。画像アップロードをお使いください。');
      } else {
        setCameraError('カメラの起動に失敗しました。画像アップロードをお使いください。');
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError('');
    setVerificationResult(null);

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(imageData.data, imageData.width, imageData.height);
      if (!found) {
        setVerificationResult({
          valid: false,
          ticket: null,
          expired: false,
          error: '画像からQRコードを読み取れませんでした',
        });
        return;
      }
      handleVerify(found.data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setCameraError('画像の読み込みに失敗しました');
    };
    img.src = url;
    // 同じファイルを再選択できるようにリセット
    e.target.value = '';
  };

  const handleRescan = () => {
    setVerificationResult(null);
    setCameraError('');
    if (scanMode === 'camera') handleStartCamera();
  };

  // ─── レンダリング ─────────────────────────────────────────

  return (
    <div className="space-y-4">
      <ToggleGroup options={MODE_OPTIONS} value={mode} onChange={setMode} ariaLabel="動作モード" />

      {mode === 'generate' ? (
        <GenerateTab
          cryptoKeyPair={cryptoKeyPair}
          privateKeyJwkStr={privateKeyJwkStr}
          publicKeyJwkStr={publicKeyJwkStr}
          keyGenerating={keyGenerating}
          keyError={keyError}
          showImport={showImport}
          importStr={importStr}
          eventId={eventId}
          expiry={expiry}
          tickets={tickets}
          generating={generating}
          generateError={generateError}
          generatedQrs={generatedQrs}
          zipping={zipping}
          zipError={zipError}
          onGenerateKeys={handleGenerateKeys}
          onToggleImport={() => setShowImport((v) => !v)}
          onImportStrChange={setImportStr}
          onImportKey={handleImportKey}
          onEventIdChange={setEventId}
          onExpiryChange={setExpiry}
          onAddTicket={addTicket}
          onRemoveTicket={removeTicket}
          onUpdateTicket={updateTicket}
          onGenerate={handleGenerate}
          onDownloadSvg={handleDownloadSvg}
          onDownloadZip={handleDownloadZip}
        />
      ) : (
        <VerifyTab
          verifyPubKeyStr={verifyPubKeyStr}
          scanMode={scanMode}
          cameraActive={cameraActive}
          cameraError={cameraError}
          verificationResult={verificationResult}
          verifying={verifying}
          videoRef={videoRef}
          canvasRef={canvasRef}
          onVerifyPubKeyStrChange={setVerifyPubKeyStr}
          onScanModeChange={setScanMode}
          onStartCamera={handleStartCamera}
          onStopCamera={stopCamera}
          onImageUpload={handleImageUpload}
          onRescan={handleRescan}
        />
      )}
    </div>
  );
}

// ─── 生成タブ ─────────────────────────────────────────────

function GenerateTab({
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
}: {
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
}) {
  return (
    <div className="space-y-4">
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
              style={{ ...micro, color: colors.link, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
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
                <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
                  <span style={{ ...caption, fontWeight: 600, color: colors.text }}>秘密鍵（主催者が保管）</span>
                  <CopyButton text={privateKeyJwkStr} label="秘密鍵をコピー" />
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
                />
              </div>
              <div>
                <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
                  <span style={{ ...caption, fontWeight: 600, color: colors.text }}>公開鍵（検証スタッフへ共有）</span>
                  <CopyButton text={publicKeyJwkStr} label="公開鍵をコピー" />
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
              style={{ ...bodyEmphasis, color: colors.text, display: 'block', marginBottom: '0.75rem' }}
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
              onFocus={onFocusRing}
              onBlur={onBlurRing}
            />
          </div>
        </div>
      </div>

      {/* チケットリストセクション */}
      <div style={sectionStyle}>
        <h3 style={sectionHeaderStyle}>チケットリスト（最大{MAX_TICKETS}件）</h3>
        <div style={sectionBodyStyle}>
          <div className="space-y-2">
            {/* ヘッダ行 */}
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: '1fr 1fr 1fr auto', alignItems: 'center' }}
            >
              {(['チケットID', '参加者名（任意）', '料金区分（任意）', ''] as const).map((h) => (
                <span key={h} style={{ ...micro, color: colors.muted, fontWeight: 600 }}>
                  {h}
                </span>
              ))}
            </div>
            {tickets.map((row, i) => (
              <div
                key={row._key}
                className="grid gap-2"
                style={{ gridTemplateColumns: '1fr 1fr 1fr auto', alignItems: 'center' }}
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
                  onFocus={onFocusRing}
                  onBlur={onBlurRing}
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
                  onFocus={onFocusRing}
                  onBlur={onBlurRing}
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
                  onFocus={onFocusRing}
                  onBlur={onBlurRing}
                />
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
            ))}
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
          {generateError && <div style={{ marginTop: '0.75rem' }}><ErrorMessage message={generateError} /></div>}
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
              <ActionButton onClick={onDownloadZip} disabled={zipping}>
                {zipping ? '準備中…' : '一括ZIPダウンロード'}
              </ActionButton>
            )}
          </div>
          {zipError && <div style={{ padding: '0.5rem 1rem', borderBottom: `1px solid ${colors.border}` }}><ErrorMessage message={zipError} /></div>}
          <div
            className="grid gap-4 p-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', background: colors.bg }}
          >
            {generatedQrs.map((qr) => (
              <div
                key={qr._key}
                className="flex flex-col items-center gap-2 rounded-lg p-3"
                style={{ border: `1px solid ${colors.border}`, background: colors.bgSurface }}
              >
                <div
                  style={{ width: '160px', height: '160px' }}
                  dangerouslySetInnerHTML={{ __html: qr.svg }}
                />
                <span style={{ ...micro, color: colors.text, fontFamily: 'monospace', fontWeight: 600 }}>
                  {qr.ticket.t}
                </span>
                {qr.ticket.n && (
                  <span style={{ ...micro, color: colors.muted }}>{qr.ticket.n}</span>
                )}
                {qr.ticket.p && (
                  <span
                    style={{
                      ...micro,
                      color: colors.primary,
                      border: `1px solid ${colors.primary}`,
                      borderRadius: '9999px',
                      padding: '0.1rem 0.5rem',
                    }}
                  >
                    {qr.ticket.p}
                  </span>
                )}
                <ActionButton onClick={() => onDownloadSvg(qr)}>SVG保存</ActionButton>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 検証タブ ─────────────────────────────────────────────

function VerifyTab({
  verifyPubKeyStr,
  scanMode,
  cameraActive,
  cameraError,
  verificationResult,
  verifying,
  videoRef,
  canvasRef,
  onVerifyPubKeyStrChange,
  onScanModeChange,
  onStartCamera,
  onStopCamera,
  onImageUpload,
  onRescan,
}: {
  verifyPubKeyStr: string;
  scanMode: 'camera' | 'upload';
  cameraActive: boolean;
  cameraError: string;
  verificationResult: VerificationResult | null;
  verifying: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onVerifyPubKeyStrChange: (v: string) => void;
  onScanModeChange: (v: 'camera' | 'upload') => void;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRescan: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* 公開鍵セクション */}
      <div style={sectionStyle}>
        <h3 style={sectionHeaderStyle}>公開鍵</h3>
        <div style={sectionBodyStyle}>
          <InputField
            id="verify-pubkey"
            label="公開鍵 JWK"
            value={verifyPubKeyStr}
            onChange={onVerifyPubKeyStrChange}
            multiline
            rows={5}
            mono
            placeholder='{"kty":"EC","crv":"P-256","x":"...","y":"...",...}'
            hint="生成タブで鍵を作成すると自動入力されます"
          />
        </div>
      </div>

      {/* QR読取セクション */}
      <div style={sectionStyle}>
        <h3 style={sectionHeaderStyle}>QR読取</h3>
        <div className="space-y-3" style={sectionBodyStyle}>
          <ToggleGroup
            options={SCAN_OPTIONS}
            value={scanMode}
            onChange={(v) => {
              onStopCamera();
              onScanModeChange(v);
            }}
            ariaLabel="読取方法"
          />

          {scanMode === 'camera' ? (
            <div className="space-y-3">
              {!cameraActive && !verificationResult && (
                <ActionButton onClick={onStartCamera} disabled={!verifyPubKeyStr.trim()} variant="primary">
                  カメラを起動
                </ActionButton>
              )}
              {!verifyPubKeyStr.trim() && (
                <p style={{ ...micro, color: colors.muted }}>
                  公開鍵を入力してからカメラを起動してください
                </p>
              )}
              {/* video/canvas は常時レンダリングして videoRef を確保する。
                  cameraActive=true になる前にsrcObjectをセットするため。 */}
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: '100%',
                  maxWidth: '400px',
                  borderRadius: '0.5rem',
                  display: cameraActive ? 'block' : 'none',
                  background: '#000',
                }}
                aria-label="カメラプレビュー"
              />
              {cameraActive && (
                <ActionButton onClick={onStopCamera} variant="danger">
                  カメラを停止
                </ActionButton>
              )}
              <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true" />
            </div>
          ) : (
            <div className="space-y-2">
              <p style={{ ...caption, color: colors.muted }}>
                QRコードが写った画像（PNG・JPG等）をアップロードしてください
              </p>
              <label
                style={{
                  ...caption,
                  fontWeight: 600,
                  display: 'inline-block',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: `1px solid ${colors.borderInput}`,
                  background: verifyPubKeyStr.trim() ? colors.bgSubtle : colors.bgSurface,
                  color: verifyPubKeyStr.trim() ? colors.text : colors.muted,
                  cursor: verifyPubKeyStr.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                画像を選択
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={onImageUpload}
                  disabled={!verifyPubKeyStr.trim()}
                />
              </label>
              {!verifyPubKeyStr.trim() && (
                <p style={{ ...micro, color: colors.muted }}>公開鍵を入力してください</p>
              )}
            </div>
          )}

          {cameraError && <ErrorMessage message={cameraError} />}
        </div>
      </div>

      {/* 検証結果セクション */}
      {(verifying || verificationResult) && (
        <div style={sectionStyle}>
          <h3 style={sectionHeaderStyle}>検証結果</h3>
          <div style={sectionBodyStyle}>
            {verifying ? (
              <p style={{ ...caption, color: colors.muted }}>検証中…</p>
            ) : verificationResult ? (
              <div className="space-y-3">
                <div
                  className="rounded-lg p-4"
                  style={{
                    background: verificationResult.valid ? colors.successBg : colors.errorBg,
                    border: `1px solid ${verificationResult.valid ? colors.success : colors.error}`,
                  }}
                >
                  <p
                    style={{
                      ...bodyEmphasis,
                      color: verificationResult.valid ? colors.success : colors.error,
                      marginBottom: verificationResult.ticket ? '0.75rem' : 0,
                    }}
                  >
                    {verificationResult.valid ? '✓ 有効なチケット' : verificationResult.expired ? '✕ 有効期限切れ' : '✕ 無効なチケット'}
                  </p>
                  {verificationResult.error && !verificationResult.valid && (
                    <p style={{ ...caption, color: colors.errorText }}>{verificationResult.error}</p>
                  )}
                  {verificationResult.ticket && (
                    <TicketDetail ticket={verificationResult.ticket} />
                  )}
                </div>
                <ActionButton onClick={onRescan}>再スキャン</ActionButton>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── チケット詳細表示 ─────────────────────────────────────

function TicketDetail({ ticket }: { ticket: TicketPayload }) {
  const rows: { label: string; value: string }[] = [
    { label: 'イベントID', value: ticket.e },
    { label: 'チケットID', value: ticket.t },
    { label: '有効期限', value: formatExpiry(ticket.x) },
  ];
  if (ticket.n) rows.push({ label: '参加者名', value: ticket.n });
  if (ticket.p) rows.push({ label: '料金区分', value: ticket.p });

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map(({ label, value }) => (
          <tr key={label}>
            <td style={{ ...micro, color: colors.muted, paddingRight: '1rem', paddingBottom: '0.25rem', whiteSpace: 'nowrap' as const }}>
              {label}
            </td>
            <td style={{ ...caption, color: colors.text, fontFamily: label === 'チケットID' ? 'monospace' : undefined }}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatExpiry(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
