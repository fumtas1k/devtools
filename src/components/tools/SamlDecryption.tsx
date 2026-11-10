import { useEffect, useRef, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { CopyButton } from '@/components/ui/CopyButton';
import { InputField } from '@/components/ui/InputField';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { maskSamlXml } from '@/utils/saml';
import { createDecryptionPlan } from '@/utils/saml/decryption-profile';
import { parsePrivateKeyPem } from '@/utils/saml/decryption-key';
import { validateDecryptedAssertion } from '@/utils/saml/decryption-plaintext';

type View = 'masked' | 'raw';

export function SamlDecryption({ xml, count }: { xml: string; count: number }) {
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
  const masked = result ? maskSamlXml(result.xml) : null;
  const safeMasked =
    masked && masked.xml !== result?.xml ? masked.xml : 'マスク結果を表示できません。';
  const displayed = view === 'raw' ? (result?.xml ?? '') : safeMasked;
  return (
    <section className="rounded-lg p-4 bg-subtle space-y-4">
      <h3 className="body-emphasis text-default">暗号化 Assertion の復号</h3>
      <p className="caption text-muted">
        この端末内で処理し、鍵は保存しません。非暗号化 RSA PKCS#8
        鍵（非空の属性は非対応）、AES-128/256-GCM と、 SHA-1 / MGF1-SHA1 または XML Encryption 1.1
        の SHA-256 / MGF1-SHA256 による RSA-OAEP
        に対応します。CBC、3DES、AES-KW、ECDH、RSA1_5、異なる digest / MGF、外部参照、
        複数鍵や再帰的暗号化には対応しません。復号成功は送信者の認証や SSO の有効性を保証しません。
      </p>
      <div>
        <label className="body-emphasis text-default" htmlFor="saml-decrypt-target">
          復号する Assertion
        </label>
        <select
          id="saml-decrypt-target"
          className="field-control mt-3"
          value={target}
          onChange={(event) => {
            reset();
            setTarget(event.target.value);
          }}
        >
          <option value="">選択してください</option>
          {Array.from({ length: count }, (_, index) => (
            <option value={String(index)} key={index}>
              暗号化された Assertion {index + 1}
            </option>
          ))}
        </select>
      </div>
      <InputField
        id="saml-private-key"
        label="秘密鍵（PKCS#8 PEM）"
        value={key}
        onChange={(value) => {
          reset();
          setKey(value);
        }}
        multiline
        rows={5}
        mono
        autoComplete="off"
        error={error || undefined}
      />
      <div className="flex gap-2 flex-wrap">
        <ActionButton onClick={decrypt} disabled={running}>
          復号する
        </ActionButton>
        {running && (
          <ActionButton onClick={reset} variant="secondary">
            キャンセル
          </ActionButton>
        )}
      </div>
      {running && (
        <p role="status" className="caption">
          復号中です
        </p>
      )}
      {result && (
        <section className="space-y-2">
          <h4 className="body-emphasis text-default">
            暗号化された Assertion {result.index + 1} の復号結果（署名未検証）
          </h4>
          <p className="caption text-muted">
            元の Response の署名結果は暗号文に対する結果です。復号結果の署名、送信者の信頼性や SSO
            の有効性は検証していません。マスクは完全な匿名化を保証しません。
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <ToggleGroup<View>
              options={[
                { value: 'masked', label: 'マスク表示' },
                { value: 'raw', label: '復号した XML' },
              ]}
              value={view}
              onChange={setView}
              ariaLabel="復号結果の表示"
              size="sm"
              layout="wrap"
            />
            <CopyButton text={displayed} label="復号結果をコピー" />
          </div>
          <pre className="overflow-x-auto font-mono caption text-default">{displayed}</pre>
        </section>
      )}
    </section>
  );
}
