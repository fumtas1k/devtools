import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { CopyButton } from '@/components/ui/CopyButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { useQrCamera } from '@/hooks/useQrCamera';
import { detectQrContent } from '@/utils/qr-reader';
import { bodyEmphasis, caption, colors } from '@/utils/styles';

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

const rescanButtonStyle = {
  ...caption,
  fontWeight: 600,
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  padding: '0.5rem 1rem',
  borderRadius: '0.5rem',
  border: `1px solid ${colors.border}`,
  background: colors.bgSubtle,
  color: colors.text,
  cursor: 'pointer' as const,
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      camera.stopCamera();
    };
  }, [camera.stopCamera]);

  useEffect(() => {
    if (scanMode !== 'camera') camera.stopCamera();
  }, [scanMode, camera.stopCamera]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    camera.setCameraError('');
    setDecodeError('');
    setDecoded(null);

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
        if (mountedRef.current) setDecodeError('画像からQRコードを読み取れませんでした');
        return;
      }
      if (mountedRef.current) {
        setDecoded(found.data);
        setDecodeError('');
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (mountedRef.current) setDecodeError('画像の読み込みに失敗しました');
    };
    img.src = url;
    e.target.value = '';
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
              camera.stopCamera();
              setScanMode(v);
            }}
            ariaLabel="読取方法"
          />

          {scanMode === 'camera' ? (
            <div className="space-y-3">
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
                <button onClick={camera.stopCamera} style={stopCameraButtonStyle}>
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
              <label style={uploadLabelStyle(true)}>
                画像を選択
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleImageUpload}
                  aria-label="画像を選択"
                />
              </label>
            </div>
          )}

          {camera.cameraError && <ErrorMessage message={camera.cameraError} />}
          {decodeError && <ErrorMessage message={decodeError} />}
        </div>
      </div>

      {/* 読取結果セクション */}
      {content !== null && (
        <div style={sectionStyle}>
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

            {/* コピーボタン */}
            <CopyButton text={content.raw} />

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

            {/* 再スキャンボタン */}
            <button onClick={handleRescan} style={rescanButtonStyle}>
              再スキャン
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
