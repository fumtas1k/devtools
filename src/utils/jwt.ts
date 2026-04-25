import { base64UrlToBytes } from '@/utils/base64url';

export type ExpStatus = 'valid' | 'expired' | 'no-exp';

export interface ParsedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  rawHeader: string;
  rawPayload: string;
  expStatus: ExpStatus;
  remainingMs?: number;
}

// 既存の利用箇所（JwtDecoder.tsx 等）の互換性のため再エクスポート
export { base64UrlToBytes };

export function parseJwt(token: string): ParsedJwt | null {
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0]))) as Record<
      string,
      unknown
    >;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1]))) as Record<
      string,
      unknown
    >;

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

    return {
      header,
      payload,
      signature: parts[2],
      rawHeader: parts[0],
      rawPayload: parts[1],
      expStatus,
      remainingMs,
    };
  } catch {
    return null;
  }
}

export function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

export function formatRemaining(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `残り ${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `残り ${m}分`;
  const h = Math.floor(m / 60);
  if (h < 24) return `残り ${h}時間`;
  return `残り ${Math.floor(h / 24)}日`;
}
