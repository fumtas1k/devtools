import { useState, useRef, useCallback, useEffect } from 'react';
import { importPublicKey, verifyTicket, type VerificationResult } from '@/utils/qr-ticket';
import { validateFile } from '@/utils/file-validation';
import { decodeQrFromFile, DEFAULT_QR_MAX_DIM } from '@/utils/qr-reader';
import { useQrCamera } from '@/hooks/useQrCamera';

export interface UseTicketVerificationOptions {
  pubKeyStr: string;
}

export interface UseTicketVerificationReturn {
  verificationResult: VerificationResult | null;
  verifying: boolean;
  scanMode: 'camera' | 'upload';
  camera: ReturnType<typeof useQrCamera>;
  setScanMode: (v: 'camera' | 'upload') => void;
  verify: (rawData: string, externalSignal?: AbortSignal) => Promise<void>;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleRescan: () => void;
}

/**
 * QRチケット検証フック。
 * カメラ/画像アップロード経由のQR検証ロジックと状態を管理する。
 */
export function useTicketVerification({
  pubKeyStr,
}: UseTicketVerificationOptions): UseTicketVerificationReturn {
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [scanMode, setScanMode] = useState<'camera' | 'upload'>('camera');

  const uploadAbortRef = useRef<AbortController | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const verify = useCallback(
    async (rawData: string, externalSignal?: AbortSignal) => {
      controllerRef.current?.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;

      if (externalSignal) {
        if (externalSignal.aborted) {
          ctrl.abort();
        } else {
          externalSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
        }
      }

      if (ctrl.signal.aborted) return;
      setVerifying(true);
      try {
        let pubKey: CryptoKey;
        try {
          const jwk = JSON.parse(pubKeyStr) as JsonWebKey;
          pubKey = await importPublicKey(jwk);
        } catch {
          if (ctrl.signal.aborted) return;
          setVerificationResult({
            valid: false,
            ticket: null,
            expired: false,
            error: '公開鍵の形式が不正です。有効なECDSA P-256 JWKを貼り付けてください。',
          });
          return;
        }
        const result = await verifyTicket(rawData, pubKey);
        if (ctrl.signal.aborted) return;
        setVerificationResult(result);
      } finally {
        // abort 中は unmount 後の no-op になるため setState を抑制
        if (!ctrl.signal.aborted) setVerifying(false);
      }
    },
    [pubKeyStr]
  );

  const camera = useQrCamera({ onQrDetected: verify });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const validation = await validateFile(file, { kind: 'image', maxBytes: 15 * 1024 * 1024 });
    if (!validation.ok) {
      camera.setCameraError(validation.message);
      return;
    }

    camera.setCameraError('');
    setVerificationResult(null);

    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    let result;
    try {
      result = await decodeQrFromFile(file, {
        maxDim: DEFAULT_QR_MAX_DIM,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      camera.setCameraError('画像を読み込めませんでした');
      return;
    }

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
    await verify(result.data, controller.signal);
  };

  const handleRescan = () => {
    setVerificationResult(null);
    camera.setCameraError('');
    if (scanMode === 'camera') camera.startCamera();
  };

  return {
    verificationResult,
    verifying,
    scanMode,
    camera,
    setScanMode,
    verify,
    handleImageUpload,
    handleRescan,
  };
}
