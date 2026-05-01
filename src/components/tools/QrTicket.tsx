import { useState, useRef, useEffect, useCallback } from 'react';
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
  estimateTicketByteSize,
  MAX_QR_BYTE_SIZE,
  type TicketPayload,
  type VerificationResult,
} from '@/utils/qr-ticket';
import { downloadSvg } from '@/utils/download';
import { validateFile } from '@/utils/file-validation';
import { sanitizeFilename, isSafeTicketId } from '@/utils/filename';
import { decodeQrFromFile, DEFAULT_QR_MAX_DIM } from '@/utils/qr-reader';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { useQrCamera } from '@/hooks/useQrCamera';
import { MODE_OPTIONS, GenerateTab, VerifyTab } from './qr-ticket/index';
import type { TicketRow, GeneratedQr } from './qr-ticket/types';

/**
 * 有効期限の初期値（1週間後の00:00）を取得する
 */
const getDefaultExpiry = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);

  // sv-SE は確実に "YYYY-MM-DD" 形式を返すのでゼロ埋め不要
  const localDate = d.toLocaleDateString('sv-SE');
  return `${localDate}T00:00`;
};

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
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  // アンマウント検知 ref（非同期処理後のステート更新ガード用）
  const mountedRef = useRef(true);

  // マウント後に初期値をセット
  useEffect(() => {
    setExpiry(getDefaultExpiry());
  }, []);

  // ─── QR検証（カメラ/アップロード共通） ───────────────────

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
    [verifyPubKeyStr]
  );

  const camera = useQrCamera({ onQrDetected: handleVerify });

  // モード切替時にカメラを停止
  useEffect(() => {
    if (mode !== 'verify') camera.stopCamera();
  }, [mode, camera.stopCamera]);

  // アンマウント時にカメラを停止 + mountedRef をリセット
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      camera.stopCamera();
    };
  }, [camera.stopCamera]);

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
    if (tickets.length >= 20) return;
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
    // 状態を即座にリセットしてクリック反応を確保
    setGenerateError('');

    if (!cryptoKeyPair) {
      setGenerateError('先に鍵ペアを生成またはインポートしてください');
      return;
    }
    if (!eventId.trim()) {
      setGenerateError('イベントIDを入力してください');
      return;
    }
    if (!expiry) {
      setGenerateError('有効期限を設定してください');
      return;
    }
    if (tickets.length === 0) {
      setGenerateError('チケットを1件以上追加してください');
      return;
    }
    const emptyId = tickets.find((t) => !t.id.trim());
    if (emptyId) {
      setGenerateError('チケットIDが空の行があります');
      return;
    }
    // チケット ID は ZIP/ダウンロードのファイル名にも使われるため、
    // 危険文字（path separator、`..`、制御文字、日本語等）を含む場合は拒否する。
    const unsafeIdRow = tickets.find((t) => !isSafeTicketId(t.id.trim()));
    if (unsafeIdRow) {
      setGenerateError(
        'チケットIDは英数字・ピリオド・アンダースコア・ハイフンのみ、64 文字以内で入力してください'
      );
      return;
    }

    // データ量制限チェック (全データの合計が MAX_QR_BYTE_SIZE バイト以内)
    const longTicket = tickets.find((t) => {
      const payload: TicketPayload = {
        e: eventId.trim(),
        t: t.id.trim(),
        timestamp: Math.floor(new Date(expiry).getTime() / 1000),
        n: t.name.trim() || undefined,
        p: t.category.trim() || undefined,
      };
      return estimateTicketByteSize(payload) > MAX_QR_BYTE_SIZE;
    });

    if (longTicket) {
      setGenerateError(
        `データ量が上限（${MAX_QR_BYTE_SIZE}バイト）を超えているチケットがあります。`
      );
      return;
    }

    setGenerating(true);
    try {
      const results: GeneratedQr[] = [];
      for (const row of tickets) {
        const payload: TicketPayload = {
          e: eventId.trim(),
          t: row.id.trim(),
          timestamp: Math.floor(new Date(expiry).getTime() / 1000),
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
    // ticket.t は UI 入力（信頼できない）なのでサニタイズしてから filename に組み込む
    const safeName = sanitizeFilename(`ticket-${qr.ticket.t}.svg`, ['svg']);
    downloadSvg(qr.svg.replace('<svg ', '<svg width="160" height="160" '), safeName);
  };

  const handleDownloadZip = async () => {
    if (generatedQrs.length === 0 || zipping) return;
    setZipping(true);
    setZipError('');
    try {
      const zip = new JSZip();
      const folder = zip.folder('tickets')!;
      generatedQrs.forEach(({ ticket, svg }) => {
        // ZIP エントリ名は Zip Slip 類似の攻撃媒体になり得るため必ずサニタイズする
        const entryName = sanitizeFilename(`ticket-${ticket.t}.svg`, ['svg']);
        folder.file(entryName, svg.replace('<svg ', '<svg width="160" height="160" '));
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

  // ─── 画像アップロードからQR検証 ──────────────────────────

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 同じファイルを再選択できるようにリセット
    e.target.value = '';

    const validation = validateFile(file, { kind: 'image', maxBytes: 15 * 1024 * 1024 });
    if (!validation.ok) {
      if (!mountedRef.current) return;
      camera.setCameraError(validation.message);
      return;
    }

    camera.setCameraError('');
    setVerificationResult(null);

    const result = await decodeQrFromFile(file, { maxDim: DEFAULT_QR_MAX_DIM });
    if (!mountedRef.current) return;
    if (!result.ok) {
      if (result.reason === 'load-error') {
        camera.setCameraError('画像を読み込めませんでした');
      } else {
        setVerificationResult({
          valid: false,
          ticket: null,
          expired: false,
          error: 'QRコードが見つかりませんでした',
        });
      }
      return;
    }
    handleVerify(result.data);
  };

  const handleRescan = () => {
    setVerificationResult(null);
    camera.setCameraError('');
    if (scanMode === 'camera') camera.startCamera();
  };

  // ─── レンダリング ─────────────────────────────────────────

  return (
    <div className="space-y-6">
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
          camera={camera}
          verificationResult={verificationResult}
          verifying={verifying}
          onVerifyPubKeyStrChange={setVerifyPubKeyStr}
          onScanModeChange={setScanMode}
          onImageUpload={handleImageUpload}
          onRescan={handleRescan}
        />
      )}
    </div>
  );
}
