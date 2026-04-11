import { useState, useMemo, useEffect } from 'react';
import { CopyButton } from '../ui/CopyButton';

const SAMPLE_SECRET = 'your-256-bit-secret';

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

function binaryStringToArrayBuffer(binary: string): ArrayBuffer {
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}

function base64UrlToBytes(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    str.length + ((4 - (str.length % 4)) % 4), '='
  );
  return new Uint8Array(binaryStringToArrayBuffer(atob(padded)));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  return binaryStringToArrayBuffer(atob(b64));
}

function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

type ExpStatus = 'valid' | 'expired' | 'no-exp';
type SigStatus = 'unchecked' | 'verifying' | 'valid' | 'invalid' | 'unsupported' | 'error';

interface ParsedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  rawHeader: string;
  rawPayload: string;
  expStatus: ExpStatus;
  remainingMs?: number;
}

function parseJwt(token: string): ParsedJwt | null {
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0]))) as Record<string, unknown>;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1]))) as Record<string, unknown>;
    let expStatus: ExpStatus = 'no-exp';
    let remainingMs: number | undefined;
    if (typeof payload.exp === 'number') {
      const expMs = payload.exp * 1000;
      if (expMs < Date.now()) {
        expStatus = 'expired';
      } else {
        expStatus = 'valid';
        remainingMs = expMs - Date.now();
      }
    }
    return { header, payload, signature: parts[2], rawHeader: parts[0], rawPayload: parts[1], expStatus, remainingMs };
  } catch {
    return null;
  }
}

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

function formatRemaining(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `残り ${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `残り ${m}分`;
  const h = Math.floor(m / 60);
  if (h < 24) return `残り ${h}時間`;
  return `残り ${Math.floor(h / 24)}日`;
}

const TIMESTAMP_KEYS = ['iat', 'exp', 'nbf'];

function PayloadValue({ k, v }: { k: string; v: unknown }) {
  const isTs = TIMESTAMP_KEYS.includes(k) && typeof v === 'number';
  return (
    <span>
      <span style={{ color: '#0066cc' }}>"{k}"</span>
      <span style={{ color: 'rgba(0,0,0,0.8)' }}>: </span>
      <span style={{ color: '#6e4f0e' }}>{JSON.stringify(v)}</span>
      {isTs && (
        <span className="ml-2" style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.48)' }}>
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
    <div className="rounded-lg p-4" style={{ background: '#f5f5f7', borderLeft: `4px solid ${accentColor}` }}>
      <div className="mb-2 flex items-center justify-between">
        <h3 style={{ fontSize: '1.06rem', fontWeight: 600, lineHeight: 1.24, letterSpacing: '-0.374px', color: '#1d1d1f' }}>{title}</h3>
        <CopyButton text={json} label="コピー" />
      </div>
      <pre className="overflow-x-auto font-mono" style={{ fontSize: '0.75rem', lineHeight: 1.33, letterSpacing: '-0.12px', color: 'rgba(0,0,0,0.8)' }}>
        <span style={{ color: 'rgba(0,0,0,0.48)' }}>{'{'}</span>{'\n'}
        {Object.entries(data).map(([k, v]) => (
          <span key={k} className="block pl-4">
            {renderValue ? renderValue(k, v) : (
              <>
                <span style={{ color: '#0066cc' }}>"{k}"</span>
                <span style={{ color: 'rgba(0,0,0,0.8)' }}>: </span>
                <span style={{ color: '#6e4f0e' }}>{JSON.stringify(v)}</span>
              </>
            )}
          </span>
        ))}
        <span style={{ color: 'rgba(0,0,0,0.48)' }}>{'}'}</span>
      </pre>
    </div>
  );
}

const bodyEmphasis = { fontSize: '1.06rem', fontWeight: 600, lineHeight: 1.24, letterSpacing: '-0.374px' } as const;
const caption = { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.29, letterSpacing: '-0.224px' } as const;
const micro = { fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.33, letterSpacing: '-0.12px' } as const;

export function JwtDecoder() {
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
    valid:    { label: '有効', style: { background: '#e3f5e1', color: '#1a6b1a' } },
    expired:  { label: '期限切れ', style: { background: '#fde8e8', color: '#b91c1c' } },
    'no-exp': { label: 'exp なし', style: { background: '#fef3cd', color: '#854d0e' } },
  };

  const sigBadge: Record<SigStatus, { label: string; style: React.CSSProperties } | null> = {
    unchecked:   null,
    verifying:   { label: '検証中…', style: { background: '#f5f5f7', color: 'rgba(0,0,0,0.48)' } },
    valid:       { label: '署名: 有効', style: { background: '#e3f5e1', color: '#1a6b1a' } },
    invalid:     { label: '署名: 無効', style: { background: '#fde8e8', color: '#b91c1c' } },
    unsupported: { label: '署名: 未対応アルゴリズム', style: { background: '#f5f5f7', color: 'rgba(0,0,0,0.48)' } },
    error:       { label: '署名: 検証エラー（キー形式を確認）', style: { background: '#fde8e8', color: '#b91c1c' } },
  };

  return (
    <div className="space-y-4">
      {/* トークン入力 */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="jwt-input" style={{ ...bodyEmphasis, color: '#1d1d1f' }}>JWTトークンを貼り付け</label>
          <button
            onClick={async () => { setSecretKey(SAMPLE_SECRET); setToken(await generateSampleJwt(SAMPLE_SECRET)); }}
            style={{ ...caption, color: '#0066cc' }}
            className="hover:underline"
          >
            サンプル入力
          </button>
        </div>
        <textarea
          id="jwt-input"
          value={token}
          onInput={(e) => setToken((e.target as HTMLTextAreaElement).value)}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
          rows={4}
          className="w-full rounded-lg px-3 py-2 font-mono"
          style={{
            ...caption,
            border: `1px solid ${isInvalid ? '#dc2626' : 'rgba(0,0,0,0.2)'}`,
            outline: 'none',
            background: '#ffffff',
            color: '#1d1d1f',
          }}
          onFocus={(e) => { e.target.style.outline = '2px solid #0071e3'; e.target.style.outlineOffset = '2px'; }}
          onBlur={(e) => { e.target.style.outline = 'none'; }}
          aria-describedby={isInvalid ? 'jwt-error' : undefined}
        />
        {isInvalid && (
          <p id="jwt-error" role="alert" style={{ ...caption, color: '#dc2626', marginTop: '0.25rem' }}>
            有効なJWTトークンではありません
          </p>
        )}
      </div>

      {/* 署名検証キー入力 */}
      {parsed && (
        <div>
          <label htmlFor="jwt-secret" style={{ ...bodyEmphasis, color: '#1d1d1f', display: 'block', marginBottom: '0.25rem' }}>
            {keyLabel}
            <span style={{ ...micro, color: 'rgba(0,0,0,0.48)', fontWeight: 400, marginLeft: '0.5rem' }}>（任意）</span>
          </label>
          <textarea
            id="jwt-secret"
            value={secretKey}
            onInput={(e) => setSecretKey((e.target as HTMLTextAreaElement).value)}
            placeholder={keyPlaceholder}
            rows={isHmac ? 2 : 4}
            className="w-full rounded-lg px-3 py-2 font-mono"
            style={{
              ...caption,
              border: '1px solid rgba(0,0,0,0.2)',
              outline: 'none',
              background: '#ffffff',
              color: '#1d1d1f',
              resize: 'vertical',
            }}
            onFocus={(e) => { e.target.style.outline = '2px solid #0071e3'; e.target.style.outlineOffset = '2px'; }}
            onBlur={(e) => { e.target.style.outline = 'none'; }}
          />
        </div>
      )}

      {/* 有効期限チェックトグル */}
      {parsed && (
        <label className="flex items-center gap-2 cursor-pointer" style={{ ...caption, color: '#1d1d1f' }}>
          <input
            type="checkbox"
            checked={verifyExp}
            onChange={(e) => setVerifyExp(e.target.checked)}
            style={{ accentColor: '#0071e3', width: '1rem', height: '1rem' }}
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
          <div className="rounded-lg p-4" style={{ background: '#f5f5f7', borderLeft: '4px solid #0071e3' }}>
            <div className="mb-2 flex items-center justify-between">
              <h3 style={{ ...bodyEmphasis, color: '#1d1d1f' }}>Signature</h3>
              <CopyButton text={parsed.signature} label="コピー" />
            </div>
            <p className="break-all font-mono" style={{ ...micro, color: 'rgba(0,0,0,0.8)' }}>{parsed.signature}</p>
            <p className="mt-2" style={{ ...micro, color: 'rgba(0,0,0,0.48)' }}>
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
            className="rounded-lg px-3 py-1.5 transition-colors hover:bg-apple-light"
            style={{ ...caption, color: 'rgba(0,0,0,0.48)' }}
          >
            クリア
          </button>
        </div>
      )}
    </div>
  );
}
