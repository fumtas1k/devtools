import { InputField } from '@/components/ui/InputField';
import { StatusIcon } from '@/components/ui/StatusIcon';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Section } from '@/components/ui/Section';
import { ActionButton } from '@/components/ui/ActionButton';
import type { VerificationResult } from '@/utils/qr-ticket';
import { TicketDetail } from './TicketDetail';
import { cx } from '@/utils/cx';
import { SCAN_OPTIONS } from './index';

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
    <div className="space-y-6">
      {/* 公開鍵セクション */}
      <Section title="公開鍵">
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
      </Section>

      {/* QR読取セクション */}
      <Section title="QR読取">
        <div className="space-y-3">
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
                <p className="caption text-muted">公開鍵を入力してからカメラを起動してください</p>
              )}
              {/* video/canvas は常時レンダリングして videoRef を確保する。
                  cameraActive=true になる前にsrcObjectをセットするため。 */}
              <video
                ref={camera.videoRef}
                playsInline
                muted
                className="w-full max-w-[400px] rounded-lg bg-black block"
                hidden={!camera.cameraActive}
                aria-label="カメラプレビュー"
              />
              {camera.cameraActive && (
                <ActionButton onClick={camera.stopCamera} variant="danger">
                  カメラを停止
                </ActionButton>
              )}
              <canvas ref={camera.canvasRef} hidden aria-hidden="true" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="caption text-muted">
                QRコードが写った画像（PNG・JPG等）をアップロードしてください
              </p>
              <label
                data-enabled={Boolean(verifyPubKeyStr.trim())}
                className="caption font-semibold inline-block px-4 py-2 rounded-lg border qr-file-picker-label"
              >
                画像を選択
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={onImageUpload}
                  disabled={!verifyPubKeyStr.trim()}
                  aria-label="画像を選択"
                />
              </label>
              <p className="hint-xs text-muted mt-1">
                対応形式: PNG / JPEG / WebP / GIF / SVG・最大 15 MB
              </p>
              {!verifyPubKeyStr.trim() && (
                <p className="caption text-muted">公開鍵を入力してください</p>
              )}
            </div>
          )}

          {camera.cameraError && <ErrorMessage message={camera.cameraError} />}
        </div>
      </Section>

      {/* 検証結果セクション */}
      {(verifying || verificationResult) && (
        <Section title="検証結果">
          {/*
           * aria-live / role="status" をヘッダーごと囲む Section 外側に置かず、
           * body 内側の div に限定している。
           * 理由: aria-live が valid/invalid で polite↔assertive を動的に切り替えるため、
           * Section ヘッダー文言（"検証結果"）まで読み上げ対象に入るのを避けるため。
           */}
          <div
            role="status"
            aria-live={verificationResult && !verificationResult.valid ? 'assertive' : 'polite'}
            aria-atomic="true"
          >
            {verifying ? (
              <p className="caption text-muted">検証中…</p>
            ) : verificationResult ? (
              <div className="space-y-3">
                <div
                  className={cx('rounded-lg p-4 border', verificationResult.valid ? 'alert-success' : 'alert-error')}
                >
                  <p
                    className={cx('body-emphasis', verificationResult.valid ? 'text-success' : 'text-error', verificationResult.ticket && 'mb-3')}
                  >
                    {verificationResult.valid ? (
                      <span className="inline-flex items-center gap-2">
                        <StatusIcon variant="success" size={20} />
                        有効なチケット
                      </span>
                    ) : verificationResult.expired ? (
                      <span className="inline-flex items-center gap-2">
                        <StatusIcon variant="error" size={20} />
                        有効期限切れ
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <StatusIcon variant="error" size={20} />
                        無効なチケット
                      </span>
                    )}
                  </p>
                  {verificationResult.error && !verificationResult.valid && (
                    <p className="caption text-error-text">{verificationResult.error}</p>
                  )}
                  {verificationResult.ticket && <TicketDetail ticket={verificationResult.ticket} />}
                </div>
                <ActionButton onClick={onRescan}>再スキャン</ActionButton>
              </div>
            ) : null}
          </div>
        </Section>
      )}
    </div>
  );
}
