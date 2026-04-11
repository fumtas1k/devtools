import { useState, useMemo } from 'react';
import { CopyButton } from '../ui/CopyButton';

const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IuWxseeUsCDlpKki' +
  'LCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6OTk5OTk5OTk5OX0.SflKxwRJSMeKKF2QT4fwpMeJf36POkHzC5UQYnJuMXc';

function decodeBase64Url(str: string): unknown {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.split('').map((c) => c.charCodeAt(0)));
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

type Status = 'valid' | 'expired' | 'no-exp';

interface ParsedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  status: Status;
  remainingMs?: number;
}

function parseJwt(token: string): ParsedJwt | null {
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  try {
    const header = decodeBase64Url(parts[0]) as Record<string, unknown>;
    const payload = decodeBase64Url(parts[1]) as Record<string, unknown>;
    const signature = parts[2];

    let status: Status = 'no-exp';
    let remainingMs: number | undefined;

    if (typeof payload.exp === 'number') {
      const now = Date.now();
      const expMs = payload.exp * 1000;
      if (expMs < now) {
        status = 'expired';
      } else {
        status = 'valid';
        remainingMs = expMs - now;
      }
    }

    return { header, payload, signature, status, remainingMs };
  } catch {
    return null;
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
      {/* Link Blue on light bg */}
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
        {/* Body Emphasis: 17px weight 600, tracking -0.374px */}
        <h3 style={{ fontSize: '1.06rem', fontWeight: 600, lineHeight: 1.24, letterSpacing: '-0.374px', color: '#1d1d1f' }}>{title}</h3>
        <CopyButton text={json} label="コピー" />
      </div>
      {/* Micro: 12px, font-mono */}
      <pre className="overflow-x-auto font-mono" style={{ fontSize: '0.75rem', lineHeight: 1.33, letterSpacing: '-0.12px', color: 'rgba(0,0,0,0.8)' }}>
        <span style={{ color: 'rgba(0,0,0,0.48)' }}>{'{'}</span>
        {'\n'}
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

export function JwtDecoder() {
  const [token, setToken] = useState('');
  const parsed = useMemo(() => (token.trim() ? parseJwt(token) : null), [token]);
  const isInvalid = token.trim() !== '' && parsed === null;

  const statusBadge: Record<Status, { label: string; style: React.CSSProperties }> = {
    valid:    { label: '✅ 有効',    style: { background: '#e3f5e1', color: '#1a6b1a' } },
    expired:  { label: '❌ 期限切れ', style: { background: '#fde8e8', color: '#b91c1c' } },
    'no-exp': { label: '⚠️ 期限なし', style: { background: '#fef3cd', color: '#854d0e' } },
  };

  return (
    <div className="space-y-4">
      {/* 入力 */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          {/* Body Emphasis: 17px weight 600 */}
          <label htmlFor="jwt-input" style={{ fontSize: '1.06rem', fontWeight: 600, lineHeight: 1.24, letterSpacing: '-0.374px', color: '#1d1d1f' }}>
            JWTトークンを貼り付け
          </label>
          {/* Link: 14px, color #0066cc */}
          <button
            onClick={() => setToken(SAMPLE_JWT)}
            style={{ fontSize: '0.875rem', lineHeight: 1.43, letterSpacing: '-0.224px', color: '#0066cc' }}
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
            fontSize: '0.875rem',
            lineHeight: 1.29,
            letterSpacing: '-0.224px',
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
          /* Caption: 14px */
          <p id="jwt-error" role="alert" style={{ fontSize: '0.875rem', lineHeight: 1.29, letterSpacing: '-0.224px', color: '#dc2626', marginTop: '0.25rem' }}>
            有効なJWTトークンではありません
          </p>
        )}
      </div>

      {/* ステータス */}
      {parsed && (
        <div className="flex items-center gap-3">
          {/* Body: 17px */}
          <span style={{ fontSize: '1.06rem', fontWeight: 400, lineHeight: 1.47, letterSpacing: '-0.374px', color: '#1d1d1f' }}>ステータス:</span>
          <span
            className="rounded-full px-3 py-0.5"
            style={{ fontSize: '0.875rem', fontWeight: 500, ...statusBadge[parsed.status].style }}
          >
            {statusBadge[parsed.status].label}
            {parsed.status === 'valid' && parsed.remainingMs !== undefined && (
              <span className="ml-1 opacity-75">({formatRemaining(parsed.remainingMs)})</span>
            )}
          </span>
        </div>
      )}

      {/* デコード結果 */}
      {parsed && (
        <div className="space-y-3">
          <Section
            title="Header (JOSE)"
            accentColor="#dc2626"
            data={parsed.header}
          />
          <Section
            title="Payload (Claims)"
            accentColor="#9333ea"
            data={parsed.payload}
            renderValue={(k, v) => <PayloadValue k={k} v={v} />}
          />
          <div className="rounded-lg p-4" style={{ background: '#f5f5f7', borderLeft: '4px solid #0071e3' }}>
            <div className="mb-2 flex items-center justify-between">
              <h3 style={{ fontSize: '1.06rem', fontWeight: 600, lineHeight: 1.24, letterSpacing: '-0.374px', color: '#1d1d1f' }}>Signature</h3>
              <CopyButton text={parsed.signature} label="コピー" />
            </div>
            <p className="break-all font-mono" style={{ fontSize: '0.75rem', lineHeight: 1.33, letterSpacing: '-0.12px', color: 'rgba(0,0,0,0.8)' }}>{parsed.signature}</p>
            <p className="mt-2" style={{ fontSize: '0.75rem', lineHeight: 1.33, letterSpacing: '-0.12px', color: 'rgba(0,0,0,0.48)' }}>署名の検証は行っていません</p>
          </div>
        </div>
      )}

      {/* クリア */}
      {token && (
        <div className="flex justify-end">
          <button
            onClick={() => setToken('')}
            className="rounded-lg px-3 py-1.5 transition-colors hover:bg-[#f5f5f7]"
            style={{ fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.29, letterSpacing: '-0.224px', color: 'rgba(0,0,0,0.48)' }}
          >
            クリア
          </button>
        </div>
      )}
    </div>
  );
}
