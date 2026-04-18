import { InputField } from '@/components/ui/InputField';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { bodyEmphasis, caption, micro, colors } from '@/utils/styles';
import type { VerificationResult } from '@/utils/qr-ticket';
import { ActionButton } from './ActionButton';
import { TicketDetail } from './TicketDetail';
import { SCAN_OPTIONS, sectionStyle, sectionHeaderStyle, sectionBodyStyle } from './index';

interface CameraProps {
  cameraActive: boolean;
  cameraError: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

interface VerifyTabProps {
  verifyPubKeyStr: string;
  scanMode: 'camera' | 'upload';
  camera: CameraProps;
  verificationResult: VerificationResult | null;
  verifying: boolean;
  onVerifyPubKeyStrChange: (v: string) => void;
  onScanModeChange: (v: 'camera' | 'upload') => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRescan: () => void;
}

export function VerifyTab({
  verifyPubKeyStr,
  scanMode,
  camera,
  verificationResult,
  verifying,
  onVerifyPubKeyStrChange,
  onScanModeChange,
  onImageUpload,
  onRescan,
}: VerifyTabProps) {
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
              camera.stopCamera();
              onScanModeChange(v);
            }}
            ariaLabel="読取方法"
          />

          {scanMode === 'camera' ? (
            <div className="space-y-3">
              {!camera.cameraActive && !verificationResult && (
                <ActionButton
                  onClick={camera.startCamera}
                  disabled={!verifyPubKeyStr.trim()}
                  variant="primary"
                >
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
                <ActionButton onClick={camera.stopCamera} variant="danger">
                  カメラを停止
                </ActionButton>
              )}
              <canvas ref={camera.canvasRef} style={{ display: 'none' }} aria-hidden="true" />
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

          {camera.cameraError && <ErrorMessage message={camera.cameraError} />}
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
                    {verificationResult.valid
                      ? '✓ 有効なチケット'
                      : verificationResult.expired
                        ? '✕ 有効期限切れ'
                        : '✕ 無効なチケット'}
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
