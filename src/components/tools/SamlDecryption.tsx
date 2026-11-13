import { useSamlDecryption } from './useSamlDecryption';
import { ActionButton } from '@/components/ui/ActionButton';
import { CopyButton } from '@/components/ui/CopyButton';
import { InputField } from '@/components/ui/InputField';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { maskSamlXml } from '@/utils/saml';

type View = 'masked' | 'raw';

export function SamlDecryption({ xml, count }: { xml: string; count: number }) {
  const { target, setTarget, key, setKey, running, error, result, view, setView, reset, decrypt } =
    useSamlDecryption(xml);
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
