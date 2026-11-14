import { useRef, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { InputField } from '@/components/ui/InputField';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { decodeClientData } from '@/utils/webauthnDecoder';
import {
  compareRpIdHash,
  decodeAttestationObject,
  decodeAuthenticatorData,
} from '@/utils/webauthnAuthenticatorData';
import type { AuthenticatorDataSummary } from '@/utils/webauthnAuthenticatorData';
import type { ClientDataSummary } from '@/utils/webauthnDecoder';

const SAMPLES = {
  registration: JSON.stringify(
    {
      response: {
        clientDataJSON:
          'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwib3JpZ2luIjoiaHR0cHM6Ly9leGFtcGxlLnRlc3QifQ',
        attestationObject: 'oWhhdXRoRGF0YVglmyY_vLWJhTE3sz3cr6W8xUA0ZOrU2nZtD4GTSL-NRywdAAAAAQ',
      },
    },
    null,
    2
  ),
  authentication: JSON.stringify(
    {
      response: {
        clientDataJSON:
          'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0Iiwib3JpZ2luIjoiaHR0cHM6Ly9leGFtcGxlLnRlc3QifQ',
        authenticatorData: 'myY_vLWJhTE3sz3cr6W8xUA0ZOrU2nZtD4GTSL-NRywdAAAAAQ',
      },
    },
    null,
    2
  ),
};

type Result = { client: ClientDataSummary; auth: AuthenticatorDataSummary; match: boolean | null };
const FLAGS = [
  ['up', 'UP', 'ユーザーの存在'],
  ['uv', 'UV', 'ユーザー検証'],
  ['be', 'BE', 'バックアップ可能'],
  ['bs', 'BS', 'バックアップ済み'],
] as const;

export function WebAuthnDecoderTool() {
  const [input, setInput] = useState('');
  const [rpId, setRpId] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const revision = useRef(0);
  function invalidate() {
    revision.current++;
    setResult(null);
    setError('');
  }
  function sample(kind: keyof typeof SAMPLES) {
    invalidate();
    setInput(SAMPLES[kind]);
    setRpId('example.test');
  }
  async function decode() {
    const current = ++revision.current;
    setResult(null);
    setError('');
    try {
      const client = decodeClientData(input);
      const parsed: unknown = JSON.parse(input);
      const response = (parsed as { response: Record<string, unknown> }).response;
      const field = client.type === 'webauthn.create' ? 'attestationObject' : 'authenticatorData';
      const encoded = response[field];
      if (typeof encoded !== 'string') throw new Error(`response.${field} が必要です。`);
      const auth =
        client.type === 'webauthn.create'
          ? decodeAttestationObject(encoded)
          : decodeAuthenticatorData(encoded);
      const match = rpId ? await compareRpIdHash(auth, rpId) : null;
      if (current === revision.current) setResult({ client, auth, match });
    } catch (cause) {
      if (current === revision.current)
        setError(cause instanceof Error ? cause.message : '解析できませんでした。');
    }
  }
  return (
    <div className="space-y-6">
      <NotificationBanner variant="info" title="ブラウザ内で解析します">
        <p>入力は送信・保存しません。署名、challenge、認証の正当性を検証するものではありません。</p>
      </NotificationBanner>
      <p className="text-body">
        origin はスキーム・ホスト・ポートを含むページの出所です。RP ID
        は認証対象のホスト名で、origin とは異なります。
      </p>
      <div className="flex flex-wrap gap-4">
        <ActionButton onClick={() => sample('registration')}>登録の合成サンプル</ActionButton>
        <ActionButton onClick={() => sample('authentication')}>認証の合成サンプル</ActionButton>
      </div>
      <InputField
        id="webauthn-response"
        label="レスポンス JSON（必須）"
        value={input}
        onChange={(value) => {
          invalidate();
          setInput(value);
        }}
        multiline
        rows={10}
        mono
        resize
        autoComplete="off"
        hint="response 内の値をパディングなし base64url で指定してください。上限は 262,144 文字です。"
      />
      <InputField
        id="webauthn-rp-id"
        label="想定 RP ID（任意）"
        value={rpId}
        onChange={(value) => {
          invalidate();
          setRpId(value);
        }}
        autoComplete="off"
        hint="例: example.test（URL ではなくホスト名）"
      />
      <ActionButton variant="primary" onClick={() => void decode()}>
        解析する
      </ActionButton>
      {error && <ErrorMessage message={error} variant="block" />}
      {result && (
        <section aria-label="解析結果" className="rounded-lg border border-default p-4 space-y-4">
          <h2 className="section-heading">解析結果</h2>
          <dl className="space-y-2 break-all">
            <div>
              <dt className="body-emphasis">type</dt>
              <dd>{result.client.type}</dd>
            </div>
            <div>
              <dt className="body-emphasis">origin</dt>
              <dd>{result.client.origin}</dd>
            </div>
            <div>
              <dt className="body-emphasis">rpIdHash（16 進数）</dt>
              <dd>
                {Array.from(result.auth.rpIdHash, (byte) =>
                  byte.toString(16).padStart(2, '0')
                ).join('')}
              </dd>
            </div>
            <div>
              <dt className="body-emphasis">RP ID 照合</dt>
              <dd>{result.match === null ? '未実施' : result.match ? '一致' : '不一致'}</dd>
            </div>
            <div>
              <dt className="body-emphasis">signCount</dt>
              <dd>{result.auth.signCount}</dd>
            </div>
          </dl>
          <h3 className="body-emphasis">フラグ</h3>
          <ul className="space-y-2">
            {FLAGS.map(([key, name, description]) => (
              <li key={key}>
                {name}（{description}）: {result.auth.flags[key] ? 'あり' : 'なし'}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
