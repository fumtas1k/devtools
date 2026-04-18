import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';

interface UseQrCameraOptions {
  onQrDetected: (data: string) => void;
}

/**
 * QRコードカメラスキャン用フック。
 * カメラの起動/停止と rAF ベースのスキャンループを管理する。
 */
export function useQrCamera({ onQrDetected }: UseQrCameraOptions) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  // stale closure を防ぐため ref で最新コールバックを保持
  const onQrDetectedRef = useRef(onQrDetected);
  useEffect(() => {
    onQrDetectedRef.current = onQrDetected;
  }, [onQrDetected]);

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

  const startCamera = useCallback(async () => {
    setCameraError('');
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
              onQrDetectedRef.current(found.data);
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
  }, [stopCamera]);

  return {
    cameraActive,
    cameraError,
    setCameraError,
    videoRef,
    canvasRef,
    startCamera,
    stopCamera,
  };
}
