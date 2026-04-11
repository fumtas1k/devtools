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
      <span className="text-blue-600 dark:text-blue-400">"{k}"</span>
      <span className="text-gray-700 dark:text-gray-300">: </span>
      <span className="text-amber-700 dark:text-amber-400">{JSON.stringify(v)}</span>
      {isTs && (
        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
          → {formatTimestamp(v as number)}
        </span>
      )}
    </span>
  );
}

interface SectionProps {
  title: string;
  colorClass: string;
  data: Record<string, unknown>;
  renderValue?: (k: string, v: unknown) => React.ReactNode;
}

function Section({ title, colorClass, data, renderValue }: SectionProps) {
  const json = JSON.stringify(data, null, 2);
  return (
    <div className={`rounded-lg border-l-4 bg-gray-50 p-4 dark:bg-gray-900 ${colorClass}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
        <CopyButton text={json} label="コピー" />
      </div>
      <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-gray-800 dark:text-gray-200">
        <span className="text-gray-500">{'{'}</span>
        {'\n'}
        {Object.entries(data).map(([k, v]) => (
          <span key={k} className="block pl-4">
            {renderValue ? renderValue(k, v) : (
              <>
                <span className="text-blue-600 dark:text-blue-400">"{k}"</span>
                <span className="text-gray-700 dark:text-gray-300">: </span>
                <span className="text-amber-700 dark:text-amber-400">{JSON.stringify(v)}</span>
              </>
            )}
          </span>
        ))}
        <span className="text-gray-500">{'}'}</span>
      </pre>
    </div>
  );
}

export function JwtDecoder() {
  const [token, setToken] = useState('');
  const parsed = useMemo(() => (token.trim() ? parseJwt(token) : null), [token]);
  const isInvalid = token.trim() !== '' && parsed === null;

  const statusBadge: Record<Status, { label: string; cls: string }> = {
    valid: { label: '✅ 有効', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
    expired: { label: '❌ 期限切れ', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
    'no-exp': { label: '⚠️ 期限なし', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
  };

  return (
    <div className="space-y-4">
      {/* 入力 */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="jwt-input" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            JWTトークンを貼り付け
          </label>
          <button
            onClick={() => setToken(SAMPLE_JWT)}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
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
          className={`w-full rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900 dark:text-white
            ${isInvalid ? 'border-red-400 dark:border-red-600' : 'border-gray-300 dark:border-gray-700'}`}
          aria-describedby={isInvalid ? 'jwt-error' : undefined}
        />
        {isInvalid && (
          <p id="jwt-error" role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
            有効なJWTトークンではありません
          </p>
        )}
      </div>

      {/* ステータス */}
      {parsed && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">ステータス:</span>
          <span className={`rounded-full px-3 py-0.5 text-sm font-medium ${statusBadge[parsed.status].cls}`}>
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
            colorClass="border-red-400 dark:border-red-600"
            data={parsed.header}
          />
          <Section
            title="Payload (Claims)"
            colorClass="border-purple-400 dark:border-purple-600"
            data={parsed.payload}
            renderValue={(k, v) => <PayloadValue k={k} v={v} />}
          />
          <div className="rounded-lg border-l-4 border-blue-400 bg-gray-50 p-4 dark:border-blue-600 dark:bg-gray-900">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Signature</h3>
              <CopyButton text={parsed.signature} label="コピー" />
            </div>
            <p className="break-all font-mono text-xs text-gray-700 dark:text-gray-300">{parsed.signature}</p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">⚠️ 署名の検証は行っていません</p>
          </div>
        </div>
      )}

      {/* クリア */}
      {token && (
        <div className="flex justify-end">
          <button
            onClick={() => setToken('')}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            クリア
          </button>
        </div>
      )}
    </div>
  );
}
