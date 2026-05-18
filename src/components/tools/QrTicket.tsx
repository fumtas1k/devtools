import { useState } from 'react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { MODE_OPTIONS, GenerateTab, VerifyTab } from './qr-ticket/index';
import { useTicketKeyPair } from './qr-ticket/useTicketKeyPair';
import { useTicketGeneration } from './qr-ticket/useTicketGeneration';
import { useTicketVerification } from './qr-ticket/useTicketVerification';

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

  // 検証タブの公開鍵欄（生成タブで鍵生成時に自動設定）
  const [verifyPubKeyStr, setVerifyPubKeyStr] = useState('');

  // 鍵ペア管理
  const keyPair = useTicketKeyPair({
    onPubKeyGenerated: setVerifyPubKeyStr,
  });

  // チケット生成管理
  const generation = useTicketGeneration({
    cryptoKeyPair: keyPair.cryptoKeyPair,
  });

  // QR検証管理
  const verification = useTicketVerification({
    pubKeyStr: verifyPubKeyStr,
  });

  // マウント後に有効期限の初期値をセット
  useAbortableEffect(() => {
    generation.setExpiry(getDefaultExpiry());
  }, []);

  // モード切替時 / アンマウント時にカメラを停止する
  useAbortableEffect(() => {
    if (mode !== 'verify') verification.camera.stopCamera();
    return () => {
      verification.camera.stopCamera();
    };
  }, [mode, verification.camera.stopCamera]);

  return (
    <div className="space-y-6">
      <ToggleGroup options={MODE_OPTIONS} value={mode} onChange={setMode} ariaLabel="動作モード" />

      {mode === 'generate' ? (
        <GenerateTab
          keyPair={{
            cryptoKeyPair: keyPair.cryptoKeyPair,
            privateKeyJwkStr: keyPair.privateKeyJwkStr,
            publicKeyJwkStr: keyPair.publicKeyJwkStr,
            keyGenerating: keyPair.keyGenerating,
            keyError: keyPair.keyError,
            showImport: keyPair.showImport,
            importStr: keyPair.importStr,
            onGenerateKeys: keyPair.generateKeys,
            onToggleImport: keyPair.toggleImport,
            onImportStrChange: keyPair.setImportStr,
            onImportKey: keyPair.importKey,
          }}
          generation={{
            eventId: generation.eventId,
            expiry: generation.expiry,
            tickets: generation.tickets,
            generating: generation.generating,
            generateError: generation.generateError,
            generatedQrs: generation.generatedQrs,
            zipping: generation.zipping,
            zipError: generation.zipError,
            onEventIdChange: generation.setEventId,
            onExpiryChange: generation.setExpiry,
            onAddTicket: generation.addTicket,
            onRemoveTicket: generation.removeTicket,
            onUpdateTicket: generation.updateTicket,
            onGenerate: generation.generate,
            onDownloadSvg: generation.downloadSvgQr,
            onDownloadZip: generation.downloadZipQrs,
          }}
        />
      ) : (
        <VerifyTab
          verifyPubKeyStr={verifyPubKeyStr}
          scanMode={verification.scanMode}
          camera={verification.camera}
          verificationResult={verification.verificationResult}
          verifying={verification.verifying}
          onVerifyPubKeyStrChange={setVerifyPubKeyStr}
          onScanModeChange={verification.setScanMode}
          onImageUpload={verification.handleImageUpload}
          onRescan={verification.handleRescan}
        />
      )}
    </div>
  );
}
