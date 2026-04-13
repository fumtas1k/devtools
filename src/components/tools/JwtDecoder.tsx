import { useState, useMemo, useEffect } from 'react';
import { CopyButton } from '../ui/CopyButton';
import { bodyEmphasis, caption, micro, colors } from '../../utils/styles';
import { InputField } from '../ui/InputField';
import {
  parseJwt, formatTimestamp, formatRemaining, base64UrlToBytes,
  type ExpStatus,
} from '../../utils/jwt';

const SAMPLE_SECRET = 'your-256-bit-secret';

// JWT syntax highlight colors (not UI colors — kept local)
const jsonKeyColor = colors.link;
const jsonValueColor = '#6e4f0e';

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateSampleJwt(secret: string): Promise<string> {
  const headerB64 = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payloadB64 = toBase64Url(JSON.stringify({
    sub: '1234567890', name: 'John Doe', iat: now, exp: now + 100 * 365 * 24 * 60 * 60,
  }));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  let binary = '';
  for (const b of new Uint8Array(sigBuffer)) binary += String.fromCharCode(b);
  const sigB64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${signingInput}.${sigB64}`;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}

type SigStatus = 'unchecked' | 'verifying' | 'valid' | 'invalid' | 'unsupported' | 'error';

async function verifySignature(
  rawHeader: string,
  rawPayload: string,
  signature: string,
  header: Record<string, unknown>,
  secretOrKey: string
): Promise<SigStatus> {
  const alg = typeof header.alg === 'string' ? header.alg : '';
  const encoded = new TextEncoder().encode(`${rawHeader}.${rawPayload}`);
  const buf = new ArrayBuffer(encoded.length);
  const signingInput = new Uint8Array(buf);
  signingInput.set(encoded);
  const sigBytes = base64UrlToBytes(signature);

  try {
    if (alg.startsWith('HS')) {
      const hash = alg === 'HS256' ? 'SHA-256' : alg === 'HS384' ? 'SHA-384' : 'SHA-512';
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secretOrKey), { name: 'HMAC', hash }, false, ['verify']
      );
      return (await crypto.subtle.verify('HMAC', key, sigBytes, signingInput)) ? 'valid' : 'invalid';
    }

    if (alg.startsWith('RS')) {
      const hash = alg === 'RS256' ? 'SHA-256' : alg === 'RS384' ? 'SHA-384' : 'SHA-512';
      const key = await crypto.subtle.importKey(
        'spki', pemToArrayBuffer(secretOrKey), { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify']
      );
      return (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sigBytes, signingInput)) ? 'valid' : 'invalid';
    }

    if (alg.startsWith('ES')) {
      const { hash, namedCurve } =
        alg === 'ES256' ? { hash: 'SHA-256', namedCurve: 'P-256' } :
        alg === 'ES384' ? { hash: 'SHA-384', namedCurve: 'P-384' } :
                          { hash: 'SHA-512', namedCurve: 'P-521' };
      const key = await crypto.subtle.importKey(
        'spki', pemToArrayBuffer(secretOrKey), { name: 'ECDSA', namedCurve }, false, ['verify']
      );
      return (await crypto.subtle.verify({ name: 'ECDSA', hash }, key, sigBytes, signingInput)) ? 'valid' : 'invalid';
    }

    return 'unsupported';
  } catch {
    return 'error';
  }
}


const TIMESTAMP_KEYS = ['iat', 'exp', 'nbf'];

function PayloadValue({ k, v }: { k: string; v: unknown }) {
  const isTs = TIMESTAMP_KEYS.includes(k) && typeof v === 'number';
  return (
    <span>
      <span style={{ color: jsonKeyColor }}>"{k}"</span>
      <span style={{ color: colors.text }}>: </span>
      <span style={{ color: jsonValueColor }}>{JSON.stringify(v)}</span>
      {isTs && (
        <span className="ml-2" style={{ fontSize: '0.75rem', color: colors.muted }}>
          → {formatTimestamp(v as number)}
        </span>
      )}
    </span>
  );
}

interface SectionProps {
  title: string;
  accentColor: string;
  data: Record<string, unknown>;
  renderValue?: (k: string, v: unknown) => React.ReactNode;
}

function Section({ title, accentColor, data, renderValue }: SectionProps) {
  const json = JSON.stringify(data, null, 2);
  return (
    <div className="rounded-lg p-4" style={{ background: colors.bgSubtle, borderLeft: `4px solid ${accentColor}` }}>
      <div className="mb-2 flex items-center justify-between">
        <h3 style={{ ...bodyEmphasis, color: colors.text }}>{title}</h3>
        <CopyButton text={json} label="コピー" />
      </div>
      <pre className="overflow-x-auto font-mono" style={{ fontSize: '0.75rem', lineHeight: 1.33, letterSpacing: '-0.12px', color: colors.text }}>
        <span style={{ color: colors.muted }}>{'{'}</span>{'\n'}
        {Object.entries(data).map(([k, v]) => (
          <span key={k} className="block pl-4">
            {renderValue ? renderValue(k, v) : (
              <>
                <span style={{ color: jsonKeyColor }}>"{k}"</span>
                <span style={{ color: colors.text }}>: </span>
                <span style={{ color: jsonValueColor }}>{JSON.stringify(v)}</span>
              </>
            )}
          </span>
        ))}
        <span style={{ color: colors.muted }}>{'}'}</span>
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
  const keyPlaceholder = isHmac ? 'your-secret-key' : '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----';
  const keyLabel = isHmac ? 'シークレットキー（HS*）' : alg.startsWith('RS') ? '公開鍵 PEM（RS*）' : alg.startsWith('ES') ? '公開鍵 PEM（ES*）' : 'シークレットキー / 公開鍵 PEM';

  // 署名検証
  useEffect(() => {
    if (!parsed || !secretKey.trim()) {
      setSigStatus('unchecked');
      return;
    }
    setSigStatus('verifying');
    verifySignature(parsed.rawHeader, parsed.rawPayload, parsed.signature, parsed.header, secretKey.trim())
      .then(setSigStatus);
  }, [parsed, secretKey]);

  const expBadge: Record<ExpStatus, { label: string; style: React.CSSProperties }> = {
    valid:    { label: '有効', style: { background: colors.successBg, color: colors.success } },
    expired:  { label: '期限切れ', style: { background: colors.errorBg, color: colors.errorText } },
    'no-exp': { label: 'exp なし', style: { background: colors.warningBg, color: colors.warning } },
  };

  const sigBadge: Record<SigStatus, { label: string; style: React.CSSProperties } | null> = {
    unchecked:   null,
    verifying:   { label: '検証中…', style: { background: colors.bgSubtle, color: colors.muted } },
    valid:       { label: '署名: 有効', style: { background: colors.successBg, color: colors.success } },
    invalid:     { label: '署名: 無効', style: { background: colors.errorBg, color: colors.errorText } },
    unsupported: { label: '署名: 未対応アルゴリズム', style: { background: colors.bgSubtle, color: colors.muted } },
    error:       { label: '署名: 検証エラー（キー形式を確認）', style: { background: colors.errorBg, color: colors.errorText } },
  };

  return (
    <div className="space-y-4">
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
        onSampleClick={async () => { setSecretKey(SAMPLE_SECRET); setToken(await generateSampleJwt(SAMPLE_SECRET)); }}
        mono
      />

      {/* 署名検証キー入力 */}
      {parsed && (
        <InputField
          id="jwt-secret"
          label={<>{keyLabel}<span style={{ ...micro, color: colors.muted, fontWeight: 400, marginLeft: '0.5rem' }}>（任意）</span></>}
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
        <label className="flex items-center gap-2 cursor-pointer" style={{ ...caption, color: colors.text }}>
          <input
            type="checkbox"
            checked={verifyExp}
            onChange={(e) => setVerifyExp(e.target.checked)}
            style={{ accentColor: colors.link, width: '1rem', height: '1rem' }}
          />
          有効期限（exp）チェックを行う
        </label>
      )}

      {/* ステータス */}
      {parsed && (
        <div className="flex flex-wrap items-center gap-2">
          {verifyExp && (
            <span
              className="rounded-full px-3 py-0.5"
              style={{ ...caption, fontWeight: 500, ...expBadge[parsed.expStatus].style }}
            >
              {expBadge[parsed.expStatus].label}
              {parsed.expStatus === 'valid' && parsed.remainingMs !== undefined && (
                <span className="ml-1 opacity-75">（{formatRemaining(parsed.remainingMs)}）</span>
              )}
            </span>
          )}
          {sigBadge[sigStatus] && (
            <span
              className="rounded-full px-3 py-0.5"
              style={{ ...caption, fontWeight: 500, ...sigBadge[sigStatus]!.style }}
            >
              {sigBadge[sigStatus]!.label}
            </span>
          )}
        </div>
      )}

      {/* デコード結果 */}
      {parsed && (
        <div className="space-y-3">
          <Section title="Header (JOSE)" accentColor="#dc2626" data={parsed.header} />
          <Section
            title="Payload (Claims)"
            accentColor="#9333ea"
            data={parsed.payload}
            renderValue={(k, v) => <PayloadValue k={k} v={v} />}
          />
          <div className="rounded-lg p-4" style={{ background: colors.bgSubtle, borderLeft: `4px solid ${colors.primary}` }}>
            <div className="mb-2 flex items-center justify-between">
              <h3 style={{ ...bodyEmphasis, color: colors.text }}>Signature</h3>
              <CopyButton text={parsed.signature} label="コピー" />
            </div>
            <p className="break-all font-mono" style={{ ...micro, color: colors.text }}>{parsed.signature}</p>
            <p className="mt-2" style={{ ...micro, color: colors.muted }}>
              {secretKey.trim() ? '上記のキーで署名を検証しています' : 'キーを入力すると署名を検証します'}
            </p>
          </div>
        </div>
      )}

      {/* クリア */}
      {token && (
        <div className="flex justify-end">
          <button
            onClick={() => { setToken(''); setSecretKey(''); setSigStatus('unchecked'); }}
            className="rounded-lg px-3 py-1.5 transition-colors"
            style={{ ...caption, color: colors.muted }}
          >
            クリア
          </button>
        </div>
      )}
    </div>
  );
}
