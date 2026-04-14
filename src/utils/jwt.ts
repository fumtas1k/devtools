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

export function base64UrlToBytes(str: string): Uint8Array<ArrayBuffer> {
  const padded = str
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  const binary = atob(padded);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return view;
}

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
