export type MaskCategory = 'SECRET' | 'EMAIL' | 'JWT' | 'IP' | 'CREDIT_CARD' | 'PHONE_JP';

export interface MaskOptions {
  enabled: Record<MaskCategory, boolean>;
}

export interface MaskResult {
  masked: unknown;
  counts: Record<MaskCategory, number>;
}

export const MASK_CATEGORIES: MaskCategory[] = [
  'SECRET',
  'EMAIL',
  'JWT',
  'IP',
  'CREDIT_CARD',
  'PHONE_JP',
];

// キー名に部分一致したら値全体を [REDACTED:SECRET] にする。
const SECRET_KEY_PARTS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'credential',
  'private_key',
  'access_key',
  'client_secret',
];

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_KEY_PARTS.some((p) => k.includes(p));
}

// 値パターン（g フラグで部分一致を全置換）
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const JWT_RE = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const CARD_RE = /\b\d(?:[ -]?\d){12,15}\b/g;
const PHONE_RE = /\b0\d{1,3}[-\s]?\d{1,4}[-\s]?\d{3,4}\b/g;

function isValidIpv4(s: string): boolean {
  const parts = s.split('.');
  return parts.length === 4 && parts.every((p) => Number(p) <= 255);
}

function luhnOk(s: string): boolean {
  const digits = s.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 16) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function maskString(s: string, options: MaskOptions, counts: Record<MaskCategory, number>): string {
  let out = s;
  if (options.enabled.EMAIL) {
    out = out.replace(EMAIL_RE, () => {
      counts.EMAIL++;
      return '[REDACTED:EMAIL]';
    });
  }
  if (options.enabled.JWT) {
    out = out.replace(JWT_RE, () => {
      counts.JWT++;
      return '[REDACTED:JWT]';
    });
  }
  if (options.enabled.IP) {
    out = out.replace(IP_RE, (m) => {
      if (!isValidIpv4(m)) return m;
      counts.IP++;
      return '[REDACTED:IP]';
    });
  }
  if (options.enabled.CREDIT_CARD) {
    out = out.replace(CARD_RE, (m) => {
      if (!luhnOk(m)) return m;
      counts.CREDIT_CARD++;
      return '[REDACTED:CREDIT_CARD]';
    });
  }
  if (options.enabled.PHONE_JP) {
    out = out.replace(PHONE_RE, () => {
      counts.PHONE_JP++;
      return '[REDACTED:PHONE_JP]';
    });
  }
  return out;
}

function walk(value: unknown, options: MaskOptions, counts: Record<MaskCategory, number>): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, options, counts));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (options.enabled.SECRET && isSecretKey(k)) {
        counts.SECRET++;
        out[k] = '[REDACTED:SECRET]';
      } else {
        out[k] = walk(v, options, counts);
      }
    }
    return out;
  }
  if (typeof value === 'string') {
    return maskString(value, options, counts);
  }
  // 数値で格納された機密（カード番号等）も検出する。文字列値と同じパターンを
  // String(value) に適用し、置換が起きた場合のみプレースホルダー文字列にする
  // （非機密の数値は型を変えずそのまま返す）。レビュー #513-🔴 の false-negative 対策。
  if (typeof value === 'number' && Number.isFinite(value)) {
    const asText = String(value);
    const masked = maskString(asText, options, counts);
    return masked === asText ? value : masked;
  }
  return value;
}

/**
 * パース済み JS 値を走査し、キー名規則＋値パターンで機密を [REDACTED:<種別>] に置換する。
 * counts に種別別の置換件数を積算する。純関数（入力は破壊しない）。
 */
export function maskValue(value: unknown, options: MaskOptions): MaskResult {
  const counts: Record<MaskCategory, number> = {
    SECRET: 0,
    EMAIL: 0,
    JWT: 0,
    IP: 0,
    CREDIT_CARD: 0,
    PHONE_JP: 0,
  };
  const masked = walk(value, options, counts);
  return { masked, counts };
}
