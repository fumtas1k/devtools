import React, { useState, useCallback, useRef } from 'react';
import { cx } from '@/utils/cx';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { CopyButton } from '@/components/ui/CopyButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Section } from '@/components/ui/Section';
import { FileInputButton } from '@/components/ui/FileInputButton';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { useQrCamera } from '@/hooks/useQrCamera';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { detectQrContent, decodeQrFromFile, DEFAULT_QR_MAX_DIM } from '@/utils/qr-reader';
import { validateFile } from '@/utils/file-validation';

const SCAN_OPTIONS = [
  { value: 'camera' as const, label: 'カメラ' },
  { value: 'upload' as const, label: '画像アップロード' },
];

export function QrReaderTool() {
  const [scanMode, setScanMode] = useState<'camera' | 'upload'>('camera');
  const [decoded, setDecoded] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState('');

  const handleQrDetected = useCallback((data: string) => {
    setDecoded(data);
    setDecodeError('');
  }, []);

  const camera = useQrCamera({ onQrDetected: handleQrDetected });
  const { stopCamera } = camera;

  // 画像アップロード処理の AbortController を保持する ref。
  // アンマウント時・連打時に前回の処理をキャンセルする。
  const uploadAbortRef = useRef<AbortController | null>(null);

  // アンマウント時にカメラを停止し、進行中のアップロードをキャンセルする
  useAbortableEffect(() => {
    return () => {
      stopCamera();
      uploadAbortRef.current?.abort();
    };
  }, [stopCamera]);

  // scanMode が camera 以外に切り替わった時にカメラを停止する
  useAbortableEffect(() => {
    if (scanMode !== 'camera') stopCamera();
  }, [scanMode, stopCamera]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 同名ファイルを再選択できるよう値をクリア（File 自体は file 変数で参照済み）
    e.target.value = '';

    const validation = validateFile(file, { kind: 'image', maxBytes: 15 * 1024 * 1024 });
    if (!validation.ok) {
      setDecodeError(validation.message);
      return;
    }

    camera.setCameraError('');
    setDecodeError('');
    setDecoded(null);

    // 連打時に前回のアップロードをキャンセルし、新しい controller を設定する
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
      setDecodeError('画像を読み込めませんでした');
      return;
    }

    if (!result.ok) {
      if (result.reason === 'load-error') {
        setDecodeError('画像を読み込めませんでした');
      } else {
        setDecodeError('QRコードが見つかりませんでした');
      }
      return;
    }
    setDecoded(result.data);
    setDecodeError('');
  };

  const handleRescan = () => {
    setDecoded(null);
    setDecodeError('');
    camera.setCameraError('');
    if (scanMode === 'camera') camera.startCamera();
  };

  const content = decoded !== null ? detectQrContent(decoded) : null;

  return (
    <div className="space-y-6">
      {/* 読取方法セクション */}
      <Section title="読取方法">
        <div className="space-y-3">
          <ToggleGroup
            options={SCAN_OPTIONS}
            value={scanMode}
            onChange={(v) => {
              stopCamera();
              setDecoded(null);
              setDecodeError('');
              camera.setCameraError('');
              setScanMode(v);
            }}
            ariaLabel="読取方法"
          />

          {scanMode === 'camera' ? (
            <div className="space-y-3">
              {/* カメラ未起動・結果なし時に「起動」ボタンを表示。エラー後もボタンを残すことでリトライを可能にしている */}
              {!camera.cameraActive && !decoded && (
                <button
                  type="button"
                  onClick={camera.startCamera}
                  className="caption font-semibold inline-flex items-center px-5 py-2 rounded-lg bg-primary text-on-primary border-0 cursor-pointer"
                >
                  カメラを起動
                </button>
              )}
              {/* video/canvas は常時レンダリングして videoRef を確保する */}
              <video
                ref={camera.videoRef}
                playsInline
                muted
                className={cx(
                  'w-full max-w-[400px] rounded-lg qr-video-preview',
                  !camera.cameraActive && 'hidden'
                )}
                aria-label="カメラプレビュー"
              />
              {camera.cameraActive && (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="caption font-semibold inline-flex items-center px-5 py-2 rounded-lg border border-error bg-error-tint text-error cursor-pointer"
                >
                  カメラを停止
                </button>
              )}
              <canvas ref={camera.canvasRef} className="hidden" aria-hidden="true" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="caption text-muted">
                QRコードが写った画像（PNG・JPG 等）をアップロードしてください
              </p>
              {/* FileInputButton: label 内包 input 構造でキーボードフォーカス時の outline ring を可視化 */}
              <FileInputButton accept="image/*" onChange={handleImageUpload} id="qr-image-input">
                画像を選択
              </FileInputButton>
              <p className="hint-xs text-muted mt-1">
                対応形式: PNG / JPEG / WebP / GIF / SVG・最大 15 MB
              </p>
            </div>
          )}

          {camera.cameraError && <ErrorMessage message={camera.cameraError} />}
          {decodeError && <ErrorMessage message={decodeError} />}
        </div>
      </Section>

      {/* 読取結果セクション */}
      {content !== null && (
        <Section title="読取結果" role="status" aria-live="polite">
          <div className="space-y-4">
            {/* テキスト表示 */}
            <div className="rounded-lg p-3 border border-default bg-subtle">
              <pre className="caption text-default m-0 whitespace-pre-wrap break-all font-mono">
                {content.raw}
              </pre>
            </div>

            {/* コピー & 再スキャンボタン */}
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={content.raw} />
              <button
                type="button"
                onClick={handleRescan}
                className="caption font-bold leading-none inline-flex items-center gap-1.5 px-3 py-2 rounded border border-default bg-subtle text-default cursor-pointer whitespace-nowrap"
              >
                再スキャン
              </button>
            </div>

            {/* URLの場合のフィッシング警告 */}
            {content.kind === 'url' && (
              <NotificationBanner title="外部リンクが含まれています">
                <p className="m-0">
                  <strong className="text-default">{content.hostname}</strong>{' '}
                  への外部リンクです。URL をよく確認してから開いてください。
                </p>
                <a
                  href={content.raw}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="caption font-semibold inline-flex items-center mt-2 px-3.5 py-1.5 rounded-md border border-warning bg-default text-default no-underline"
                >
                  URLを開く
                </a>
              </NotificationBanner>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
