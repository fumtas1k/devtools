import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { CopyButton } from '@/components/ui/CopyButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { useQrCamera } from '@/hooks/useQrCamera';
import { detectQrContent, decodeQrFromFile, DEFAULT_QR_MAX_DIM } from '@/utils/qr-reader';
import { bodyEmphasis, caption, colors } from '@/utils/styles';
import { validateFile } from '@/utils/file-validation';

const SCAN_OPTIONS = [
  { value: 'camera' as const, label: 'カメラ' },
  { value: 'upload' as const, label: '画像アップロード' },
];

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

const rescanButtonStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 700,
  lineHeight: 1,
  letterSpacing: '0.02em',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.25rem',
  border: `1px solid ${colors.border}`,
  background: colors.bgSubtle,
  color: colors.text,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const startCameraButtonStyle = {
  ...caption,
  fontWeight: 600,
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  padding: '0.5rem 1.25rem',
  borderRadius: '0.5rem',
  border: 'none',
  background: colors.primary,
  color: colors.textOnPrimary,
  cursor: 'pointer' as const,
};

const stopCameraButtonStyle = {
  ...caption,
  fontWeight: 600,
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  padding: '0.5rem 1.25rem',
  borderRadius: '0.5rem',
  border: `1px solid ${colors.error}`,
  background: colors.errorBg,
  color: colors.error,
  cursor: 'pointer' as const,
};

const uploadLabelStyle = (enabled: boolean): React.CSSProperties => ({
  ...caption,
  fontWeight: 600,
  display: 'inline-block',
  padding: '0.5rem 1rem',
  borderRadius: '0.5rem',
  border: `1px solid ${colors.borderInput}`,
  background: enabled ? colors.bgSubtle : colors.bgSurface,
  color: enabled ? colors.text : colors.muted,
  cursor: enabled ? 'pointer' : 'not-allowed',
});

export function QrReaderTool() {
  const [scanMode, setScanMode] = useState<'camera' | 'upload'>('camera');
  const [decoded, setDecoded] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState('');
  const mountedRef = useRef(true);

  const handleQrDetected = useCallback((data: string) => {
    if (!mountedRef.current) return;
    setDecoded(data);
    setDecodeError('');
  }, []);

  const camera = useQrCamera({ onQrDetected: handleQrDetected });
  const { stopCamera } = camera;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (scanMode !== 'camera') stopCamera();
  }, [scanMode, stopCamera]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 同名ファイルを再選択できるよう値をクリア（File 自体は file 変数で参照済み）
    e.target.value = '';

    const validation = validateFile(file, { kind: 'image', maxBytes: 15 * 1024 * 1024 });
    if (!validation.ok) {
      if (mountedRef.current) setDecodeError(validation.message);
      return;
    }

    camera.setCameraError('');
    setDecodeError('');
    setDecoded(null);

    const result = await decodeQrFromFile(file, { maxDim: DEFAULT_QR_MAX_DIM });
    if (!mountedRef.current) return;
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
      <div style={sectionStyle}>
        <h3 style={sectionHeaderStyle}>読取方法</h3>
        <div className="space-y-3" style={sectionBodyStyle}>
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
                <button onClick={camera.startCamera} style={startCameraButtonStyle}>
                  カメラを起動
                </button>
              )}
              {/* video/canvas は常時レンダリングして videoRef を確保する */}
              <video
                ref={camera.videoRef}
                playsInline
                muted
                style={{
                  width: '100%',
                  maxWidth: '400px',
                  borderRadius: '0.5rem',
                  display: camera.cameraActive ? 'block' : 'none',
                  background: '#000',
                }}
                aria-label="カメラプレビュー"
              />
              {camera.cameraActive && (
                <button onClick={stopCamera} style={stopCameraButtonStyle}>
                  カメラを停止
                </button>
              )}
              <canvas ref={camera.canvasRef} style={{ display: 'none' }} aria-hidden="true" />
            </div>
          ) : (
            <div className="space-y-2">
              <p style={{ ...caption, color: colors.muted }}>
                QRコードが写った画像（PNG・JPG 等）をアップロードしてください
              </p>
              {/* input を visually-hidden にしてキーボード・スクリーンリーダーからも操作可能にする */}
              <input
                id="qr-image-input"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  opacity: 0,
                  pointerEvents: 'none',
                }}
              />
              <label htmlFor="qr-image-input" style={uploadLabelStyle(true)}>
                画像を選択
              </label>
              <p style={{ fontSize: '0.75rem', color: colors.muted, marginTop: '0.25rem' }}>
                対応形式: PNG / JPEG / WebP / GIF / SVG・最大 15 MB
              </p>
            </div>
          )}

          {camera.cameraError && <ErrorMessage message={camera.cameraError} />}
          {decodeError && <ErrorMessage message={decodeError} />}
        </div>
      </div>

      {/* 読取結果セクション */}
      {content !== null && (
        <div style={sectionStyle} role="status" aria-live="polite">
          <h3 style={sectionHeaderStyle}>読取結果</h3>
          <div className="space-y-4" style={sectionBodyStyle}>
            {/* テキスト表示 */}
            <div
              className="rounded-lg p-3"
              style={{ background: colors.bgSubtle, border: `1px solid ${colors.border}` }}
            >
              <pre
                style={{
                  ...caption,
                  color: colors.text,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  fontFamily: 'monospace',
                }}
              >
                {content.raw}
              </pre>
            </div>

            {/* コピー & 再スキャンボタン */}
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={content.raw} />
              <button onClick={handleRescan} style={rescanButtonStyle}>
                再スキャン
              </button>
            </div>

            {/* URLの場合のフィッシング警告 */}
            {content.kind === 'url' && (
              <div
                className="rounded-lg p-4 space-y-2"
                style={{
                  background: colors.warningBg,
                  border: `1px solid ${colors.warning}`,
                }}
              >
                <p style={{ ...caption, color: colors.text }}>
                  <strong style={{ color: colors.text }}>{content.hostname}</strong>{' '}
                  への外部リンクが含まれています。URLをよく確認してから開いてください。
                </p>
                <a
                  href={content.raw}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    ...caption,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0.375rem 0.875rem',
                    borderRadius: '0.375rem',
                    border: `1px solid ${colors.warning}`,
                    background: colors.bg,
                    color: colors.text,
                    textDecoration: 'none',
                  }}
                >
                  URLを開く
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
