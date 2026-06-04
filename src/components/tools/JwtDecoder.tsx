import { useState, useMemo, useEffect } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { InputField } from '@/components/ui/InputField';
import { parseJwt, formatTimestamp, formatRemaining, type ExpStatus } from '@/utils/jwt';
import { bytesToBase64Url } from '@/utils/base64url';
import { verifySignature, type SigStatus } from '@/utils/jwt-verify';

const SAMPLE_SECRET = 'your-256-bit-secret';

async function generateSampleJwt(secret: string): Promise<string> {
  const headerB64 = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  );
  const now = Math.floor(Date.now() / 1000);
  const payloadB64 = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        sub: '1234567890',
        name: 'John Doe',
        iat: now,
        exp: now + 100 * 365 * 24 * 60 * 60,
      })
    )
  );
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const sigB64 = bytesToBase64Url(new Uint8Array(sigBuffer));
  return `${signingInput}.${sigB64}`;
}

const TIMESTAMP_KEYS = ['iat', 'exp', 'nbf'];

function PayloadValue({ k, v }: { k: string; v: unknown }) {
  const isTs = TIMESTAMP_KEYS.includes(k) && typeof v === 'number';
  return (
    <span>
      <span className="jwt-json-key">"{k}"</span>
      <span className="text-default">: </span>
      <span className="jwt-json-value">{JSON.stringify(v)}</span>
      {isTs && <span className="ml-2 hint-xs text-muted">→ {formatTimestamp(v as number)}</span>}
    </span>
  );
}

type SectionVariant = 'header' | 'payload' | 'signature';

const SECTION_CLASSES: Record<SectionVariant, string> = {
  header: 'section-jwt-header',
  payload: 'section-jwt-payload',
  signature: 'section-jwt-signature',
};

interface SectionProps {
  title: string;
  variant: SectionVariant;
  data: Record<string, unknown>;
  renderValue?: (k: string, v: unknown) => React.ReactNode;
  'data-testid'?: string;
}

function Section({ title, variant, data, renderValue, 'data-testid': testId }: SectionProps) {
  const json = JSON.stringify(data, null, 2);
  return (
    <div className={`rounded-lg p-4 bg-subtle ${SECTION_CLASSES[variant]}`} data-testid={testId}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="body-emphasis text-default">{title}</h3>
        <CopyButton text={json} label="コピー" />
      </div>
      <pre className="overflow-x-auto font-mono text-default jwt-pre">
        <span className="text-muted">{'{'}</span>
        {'\n'}
        {Object.entries(data).map(([k, v]) => (
          <span key={k} className="block pl-4">
            {renderValue ? (
              renderValue(k, v)
            ) : (
              <>
                <span className="jwt-json-key">"{k}"</span>
                <span className="text-default">: </span>
                <span className="jwt-json-value">{JSON.stringify(v)}</span>
              </>
            )}
          </span>
        ))}
        <span className="text-muted">{'}'}</span>
      </pre>
    </div>
  );
}

export function JwtDecoderTool() {
  const [token, setToken] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [verifyExp, setVerifyExp] = useState(true);
  const [sigStatus, setSigStatus] = useState<SigStatus>('unchecked');

  const parsed = useMemo(() => (token.trim() ? parseJwt(token) : null), [token]);
  const isInvalid = token.trim() !== '' && parsed === null;

  const alg = typeof parsed?.header?.alg === 'string' ? parsed.header.alg : '';
  const isHmac = alg.startsWith('HS');
  const keyPlaceholder = isHmac
    ? 'your-secret-key'
    : '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----';
  const keyLabel = isHmac
    ? 'シークレットキー（HS*）'
    : alg.startsWith('RS')
      ? '公開鍵 PEM（RS*）'
      : alg.startsWith('ES')
        ? '公開鍵 PEM（ES*）'
        : 'シークレットキー / 公開鍵 PEM';

  // 署名検証
  useEffect(() => {
    if (!parsed || !secretKey.trim()) {
      setSigStatus('unchecked');
      return;
    }
    setSigStatus('verifying');
    let cancelled = false;
    verifySignature(
      parsed.rawHeader,
      parsed.rawPayload,
      parsed.signature,
      parsed.header,
      secretKey.trim()
    ).then((result) => {
      if (!cancelled) setSigStatus(result);
    });
    return () => {
      cancelled = true;
    };
  }, [parsed, secretKey]);

  const expBadge: Record<ExpStatus, { label: string; badgeClass: string }> = {
    valid: { label: '有効', badgeClass: 'bg-success-tint text-success' },
    expired: { label: '期限切れ', badgeClass: 'bg-error-tint text-error-text' },
    'no-exp': { label: 'exp なし', badgeClass: 'bg-warning-tint text-warning' },
  };

  const sigBadge: Record<SigStatus, { label: string; badgeClass: string } | null> = {
    unchecked: null,
    verifying: { label: '検証中…', badgeClass: 'bg-subtle text-muted' },
    valid: { label: '署名: 有効', badgeClass: 'bg-success-tint text-success' },
    invalid: { label: '署名: 無効', badgeClass: 'bg-error-tint text-error-text' },
    unsupported: { label: '署名: 未対応アルゴリズム', badgeClass: 'bg-subtle text-muted' },
    error: {
      label: '署名: 検証エラー（キー形式を確認）',
      badgeClass: 'bg-error-tint text-error-text',
    },
  };

  return (
    <div className="space-y-6">
      {/* トークン入力 */}
      <InputField
        id="jwt-input"
        label="JWTトークンを貼り付け"
        value={token}
        onChange={setToken}
        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
        multiline
        rows={4}
        error={isInvalid ? '有効なJWTトークンではありません' : undefined}
        onSampleClick={async () => {
          setSecretKey(SAMPLE_SECRET);
          setToken(await generateSampleJwt(SAMPLE_SECRET));
        }}
        mono
      />

      {/* 署名検証キー入力 */}
      {parsed && (
        <InputField
          id="jwt-secret"
          label={
            <>
              {keyLabel}
              <span className="caption text-muted ml-2">（任意）</span>
            </>
          }
          value={secretKey}
          onChange={setSecretKey}
          placeholder={keyPlaceholder}
          multiline
          rows={isHmac ? 2 : 4}
          mono
          resize
        />
      )}

      {/* 有効期限チェックトグル */}
      {parsed && (
        <label className="flex items-center gap-2 cursor-pointer caption text-default">
          <input
            type="checkbox"
            checked={verifyExp}
            onChange={(e) => setVerifyExp(e.target.checked)}
            className="w-4 h-4 accent-link"
          />
          有効期限（exp）チェックを行う
        </label>
      )}

      {/* ステータス */}
      {parsed && (
        <div className="flex flex-wrap items-center gap-2">
          {verifyExp && (
            <span
              className={`rounded-full px-3 py-0.5 caption font-medium ${expBadge[parsed.expStatus].badgeClass}`}
            >
              {expBadge[parsed.expStatus].label}
              {parsed.expStatus === 'valid' && parsed.remainingMs !== undefined && (
                <span className="ml-1 opacity-75">（{formatRemaining(parsed.remainingMs)}）</span>
              )}
            </span>
          )}
          {sigBadge[sigStatus] && (
            <span
              className={`rounded-full px-3 py-0.5 caption font-medium ${sigBadge[sigStatus]!.badgeClass}`}
            >
              {sigBadge[sigStatus]!.label}
            </span>
          )}
        </div>
      )}

      {/* デコード結果 */}
      {parsed && (
        <div className="space-y-3" role="status" aria-live="polite">
          <Section
            title="Header (JOSE)"
            variant="header"
            data={parsed.header}
            data-testid="jwt-header"
          />
          <Section
            title="Payload (Claims)"
            variant="payload"
            data={parsed.payload}
            renderValue={(k, v) => <PayloadValue k={k} v={v} />}
            data-testid="jwt-payload"
          />
          <div className="rounded-lg p-4 bg-subtle section-jwt-signature">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="body-emphasis text-default">Signature</h3>
              <CopyButton text={parsed.signature} label="コピー" />
            </div>
            <p className="break-all font-mono caption text-default">{parsed.signature}</p>
            <p className="mt-2 caption text-muted">
              {secretKey.trim()
                ? '上記のキーで署名を検証しています'
                : 'キーを入力すると署名を検証します'}
            </p>
          </div>
        </div>
      )}

      {/* クリア */}
      {token && (
        <div className="flex justify-end">
          <ClearButton
            onClick={() => {
              setToken('');
              setSecretKey('');
              setSigStatus('unchecked');
            }}
          />
        </div>
      )}
    </div>
  );
}
