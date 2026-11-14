import { useEffect, useRef, useState } from 'react';
import { createDecryptionPlan } from '@/utils/saml/decryption-profile';
import { parsePrivateKeyPem } from '@/utils/saml/decryption-key';
import { validateDecryptedAssertion } from '@/utils/saml/decryption-plaintext';

type View = 'masked' | 'raw';

export function useSamlDecryption(xml: string) {
  const [target, setTarget] = useState('');
  const [key, setKey] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ index: number; xml: string } | null>(null);
  const [view, setView] = useState<View>('masked');
  const active = useRef<{ worker: Worker; timer: ReturnType<typeof setTimeout> } | null>(null);
  const generation = useRef(0);
  const cancel = () => {
    generation.current++;
    if (active.current) {
      clearTimeout(active.current.timer);
      active.current.worker.terminate();
      active.current = null;
    }
  };
  const reset = () => {
    cancel();
    setRunning(false);
    setError('');
    setResult(null);
    setView('masked');
  };
  useEffect(() => {
    const hide = () => {
      reset();
      setKey('');
    };
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) hide();
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      cancel();
    };
  }, []);
  const decrypt = () => {
    reset();
    const source = key;
    setKey('');
    let keyDer: Uint8Array<ArrayBuffer> | undefined;
    try {
      if (target === '') throw new Error('復号する Assertion を選択してください');
      const index = Number(target);
      const plan = createDecryptionPlan(xml, index);
      keyDer = parsePrivateKeyPem(source);
      const current = generation.current;
      const worker = new Worker(
        new URL('../../workers/saml-decryption.worker.ts', import.meta.url),
        { type: 'module' }
      );
      const timer = setTimeout(() => {
        if (current !== generation.current) return;
        cancel();
        setRunning(false);
        setError('復号が 15 秒を超えたため停止しました');
      }, 15_000);
      active.current = { worker, timer };
      setRunning(true);
      worker.onmessage = (event: MessageEvent<{ plaintext?: Uint8Array; error?: string }>) => {
        const bytes = event.data.plaintext;
        if (current !== generation.current) {
          bytes?.fill(0);
          return;
        }
        cancel();
        setRunning(false);
        try {
          if (!bytes) throw new Error(event.data.error || '復号に失敗しました');
          const decrypted = validateDecryptedAssertion(bytes);
          setResult({ index, xml: decrypted });
        } catch (e) {
          setError(e instanceof Error ? e.message : '復号に失敗しました');
        } finally {
          bytes?.fill(0);
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        if (current !== generation.current) return;
        cancel();
        setRunning(false);
        setError('復号を開始できませんでした');
      };
      worker.onmessageerror = () => {
        if (current !== generation.current) return;
        cancel();
        setRunning(false);
        setError('復号に失敗しました');
      };
      worker.postMessage({ plan, keyDer }, [
        keyDer.buffer,
        plan.label.buffer,
        plan.encryptedKey.buffer,
        plan.payload.buffer,
      ]);
    } catch (e) {
      if (keyDer?.byteLength) keyDer.fill(0);
      cancel();
      setRunning(false);
      setError(e instanceof Error ? e.message : '復号を開始できませんでした');
    }
  };
  return { target, setTarget, key, setKey, running, error, result, view, setView, reset, decrypt };
}
