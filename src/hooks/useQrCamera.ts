import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import jsQR from 'jsqr';

interface UseQrCameraOptions {
  onQrDetected: (data: string) => void;
}

/**
 * QRコードカメラスキャン用フック。
 * カメラの起動/停止と rAF ベースのスキャンループを管理する。
 * 起動ごとの世代を使い、停止後の非同期処理を無効化する。
 */
export function useQrCamera({ onQrDetected }: UseQrCameraOptions) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const generationRef = useRef(0);
  // stale closure を防ぐため ref で最新コールバックを保持
  const onQrDetectedRef = useRef(onQrDetected);
  useEffect(() => {
    onQrDetectedRef.current = onQrDetected;
  }, [onQrDetected]);

  const releaseCamera = useCallback(() => {
    generationRef.current += 1;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      if (videoRef.current?.srcObject === streamRef.current) {
        videoRef.current.srcObject = null;
      }
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    scanningRef.current = false;
  }, []);

  useEffect(() => () => releaseCamera(), [releaseCamera]);

  const stopCamera = useCallback(() => {
    releaseCamera();
    setCameraActive(false);
  }, [releaseCamera]);

  const startCamera = useCallback(async () => {
    stopCamera();
    const generation = generationRef.current;
    setCameraError('');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'カメラの起動には HTTPS 環境または localhost が必要です。画像アップロードをお使いください。'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });

      // 停止・再起動・アンマウント後に取得した stream は使わない
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        // この stream の解放は停止時に完了している
        if (generation !== generationRef.current) return;
      }
      setCameraActive(true);
      scanningRef.current = true;

      const scan = () => {
        if (generation !== generationRef.current) return;
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
              onQrDetectedRef.current(found.data);
              return;
            }
          }
        }
        rafRef.current = requestAnimationFrame(scan);
      };
      rafRef.current = requestAnimationFrame(scan);
    } catch (err) {
      if (generation !== generationRef.current) return;
      releaseCamera();
      const e = err as DOMException;
      if (e.name === 'NotAllowedError') {
        setCameraError('カメラへのアクセスが拒否されました。ブラウザの設定で許可してください。');
      } else if (e.name === 'NotFoundError') {
        setCameraError('カメラが見つかりません。画像アップロードをお使いください。');
      } else {
        setCameraError('カメラの起動に失敗しました。画像アップロードをお使いください。');
      }
    }
  }, [releaseCamera, stopCamera]);

  // 毎レンダでオブジェクトが再生成されないよう useMemo で安定化する。
  // stopCamera / startCamera は useCallback で安定している。
  // cameraActive / cameraError はステート変化時のみ新しいオブジェクトを生成する。
  return useMemo(
    () => ({
      cameraActive,
      cameraError,
      setCameraError,
      videoRef,
      canvasRef,
      startCamera,
      stopCamera,
    }),
    [cameraActive, cameraError, setCameraError, videoRef, canvasRef, startCamera, stopCamera]
  );
}
