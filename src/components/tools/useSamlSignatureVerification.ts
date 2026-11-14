import { useEffect, useRef, useState } from 'react';
import {
  MAX_CERT_BYTES,
  MAX_SIGNATURE_XML_BYTES,
  signatureSnapshot,
  targetsFor,
  type SignatureResult,
} from '@/utils/saml/signature-profile';
import { exceedsUtf8ByteLimit } from '@/utils/saml/limits';

export function useSamlSignatureVerification() {
  const [signatureResults, setSignatureResults] = useState<SignatureResult[] | null>(null);
  const [signatureError, setSignatureError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const active = useRef<{ worker: Worker; timer: ReturnType<typeof setTimeout> } | null>(null);
  const generation = useRef(0);
  const cancelVerification = () => {
    generation.current++;
    if (active.current) {
      clearTimeout(active.current.timer);
      active.current.worker.terminate();
      active.current = null;
    }
  };
  const resetVerification = () => {
    cancelVerification();
    setSignatureResults(null);
    setSignatureError('');
    setVerifying(false);
  };
  useEffect(() => {
    const onPageHide = () => resetVerification();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resetVerification();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      cancelVerification();
    };
  }, []);

  const verifySignature = (xml: string, document: Document, certificate: string) => {
    resetVerification();
    const entries = targetsFor(document).map(({ target }) => target);
    const fail = (reason: string) =>
      setSignatureResults(entries.map((target) => ({ ...target, status: 'unsupported', reason })));
    try {
      if (exceedsUtf8ByteLimit(xml, MAX_SIGNATURE_XML_BYTES))
        throw new Error('署名検証は XML 2 MiB 以下に対応しています');
      if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))
        throw new Error('DTD / ENTITY は署名検証に対応していません');
      if (exceedsUtf8ByteLimit(certificate, MAX_CERT_BYTES)) {
        const reason = '証明書は 64 KiB 以下にしてください';
        setSignatureError(reason);
        setSignatureResults(
          entries.map((target) => ({
            ...target,
            status: target.signed ? 'input-error' : 'unsigned',
            reason: target.signed ? reason : '直下に署名がありません',
          }))
        );
        return;
      }
      const snapshot = signatureSnapshot(document);
      const current = generation.current;
      const worker = new Worker(
        new URL('../../workers/saml-signature.worker.ts', import.meta.url),
        { type: 'module' }
      );
      const timer = setTimeout(() => {
        if (current !== generation.current) return;
        cancelVerification();
        setVerifying(false);
        fail('検証が 15 秒を超えたため停止しました');
      }, 15_000);
      active.current = { worker, timer };
      setVerifying(true);
      setSignatureResults(
        entries.map((target) => ({
          ...target,
          status: target.signed ? 'processing' : 'unsigned',
          reason: target.signed ? '検証中です' : '直下に署名がありません',
        }))
      );
      worker.onmessage = (event: MessageEvent<{ results?: SignatureResult[]; error?: string }>) => {
        if (current !== generation.current) return;
        cancelVerification();
        setVerifying(false);
        if (event.data.results) {
          setSignatureResults(event.data.results);
          setSignatureError(
            event.data.results.find((item) => item.status === 'input-error')?.reason || ''
          );
        } else fail(event.data.error || '署名検証に失敗しました');
      };
      worker.onerror = (event) => {
        event.preventDefault();
        if (current !== generation.current) return;
        cancelVerification();
        setVerifying(false);
        fail('署名検証を開始できませんでした');
      };
      worker.onmessageerror = () => {
        if (current !== generation.current) return;
        cancelVerification();
        setVerifying(false);
        fail('署名検証の応答を読み取れませんでした');
      };
      worker.postMessage({ xml, snapshot, pem: certificate });
    } catch (error) {
      cancelVerification();
      setVerifying(false);
      fail(error instanceof Error ? error.message : '署名検証を開始できませんでした');
    }
  };

  return { signatureResults, signatureError, verifying, resetVerification, verifySignature };
}
