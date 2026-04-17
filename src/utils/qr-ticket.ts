/**
 * QRチケット: ECDSA P-256署名付きチケットの生成・検証ユーティリティ
 *
 * 暗号処理はすべてWeb Crypto API（ブラウザ組み込み）を使用。
 * QR生成はqrcode-generator（既存依存）を使用。
 */

import qrcode from 'qrcode-generator';

// ─── 型定義 ───────────────────────────────────────────────

export interface TicketPayload {
  e: string;    // イベントID (event id)
  t: string;    // チケットID (ticket id)
  x: string;    // 有効期限 ISO 8601 (expiry)
  n?: string;   // 参加者名（任意）
  p?: string;   // 料金区分（任意）
}

export interface SignedTicket extends TicketPayload {
  s: string;    // base64url ECDSA署名
}

export interface ExportedKeyPair {
  privateKey: JsonWebKey;
  publicKey: JsonWebKey;
}

export interface VerificationResult {
  valid: boolean;
  ticket: TicketPayload | null;
  expired: boolean;
  error?: string;
}

// ─── 内部ヘルパー ─────────────────────────────────────────

/** ArrayBuffer を base64url 文字列に変換 */
function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url 文字列を ArrayBuffer に変換 */
function base64UrlToBuffer(str: string): ArrayBuffer {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad === 2 ? normalized + '==' : pad === 3 ? normalized + '=' : normalized;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** オブジェクトのキーを昇順ソートした JSON 文字列を返す */
function sortedStringify(obj: Record<string, string>): string {
  const sorted = Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(sorted);
}

/** 署名対象のペイロード文字列を構築（キー昇順ソートで決定論的出力） */
export function buildPayload(ticket: TicketPayload): string {
  const obj: Record<string, string> = { e: ticket.e, t: ticket.t, x: ticket.x };
  if (ticket.n) obj.n = ticket.n;
  if (ticket.p) obj.p = ticket.p;
  return sortedStringify(obj);
}

// ─── 鍵操作 ──────────────────────────────────────────────

/** ECDSA P-256 鍵ペアを生成する */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
}

/** 鍵ペアを JWK 形式でエクスポートする */
export async function exportKeyPair(keyPair: CryptoKeyPair): Promise<ExportedKeyPair> {
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.exportKey('jwk', keyPair.privateKey),
    crypto.subtle.exportKey('jwk', keyPair.publicKey),
  ]);
  return { privateKey, publicKey };
}

/** JWK から秘密鍵をインポートする */
export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/** JWK から公開鍵をインポートする */
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
}

// ─── 署名・検証 ───────────────────────────────────────────

/**
 * TicketPayload に署名して SignedTicket を返す
 * @param payload チケットデータ（署名なし）
 * @param privateKey インポート済みECDSA秘密鍵
 */
export async function signTicket(
  payload: TicketPayload,
  privateKey: CryptoKey,
): Promise<SignedTicket> {
  const data = new TextEncoder().encode(buildPayload(payload));
  const sigBuf = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data);
  return { ...payload, s: bufferToBase64Url(sigBuf) };
}

/**
 * QRコードデータ文字列を検証する
 * @param rawData QRコードから読み取った文字列
 * @param publicKey インポート済みECDSA公開鍵
 */
export async function verifyTicket(
  rawData: string,
  publicKey: CryptoKey,
): Promise<VerificationResult> {
  let parsed: SignedTicket;
  try {
    parsed = JSON.parse(rawData) as SignedTicket;
  } catch {
    return { valid: false, ticket: null, expired: false, error: 'QRデータの形式が不正です' };
  }

  if (!parsed.e || !parsed.t || !parsed.x || !parsed.s) {
    return { valid: false, ticket: null, expired: false, error: '必須フィールドが欠けています' };
  }

  const { s, ...payloadFields } = parsed;
  const payload: TicketPayload = payloadFields;

  let sigValid = false;
  try {
    const data = new TextEncoder().encode(buildPayload(payload));
    const sigBuf = base64UrlToBuffer(s);
    sigValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      sigBuf,
      data,
    );
  } catch {
    return { valid: false, ticket: null, expired: false, error: '署名の検証中にエラーが発生しました' };
  }

  if (!sigValid) {
    return { valid: false, ticket: payload, expired: false, error: '署名が無効です' };
  }

  const expired = new Date(parsed.x) < new Date();
  if (expired) {
    return { valid: false, ticket: payload, expired: true, error: `有効期限切れ（${parsed.x}）` };
  }

  return { valid: true, ticket: payload, expired: false };
}

// ─── QR生成 ──────────────────────────────────────────────

/** SignedTicket をコンパクトなJSON文字列に変換（undefined項目を除外、キー昇順ソート） */
export function ticketToQrString(ticket: SignedTicket): string {
  const obj: Record<string, string> = { e: ticket.e, s: ticket.s, t: ticket.t, x: ticket.x };
  if (ticket.n) obj.n = ticket.n;
  if (ticket.p) obj.p = ticket.p;
  return sortedStringify(obj);
}

/**
 * テキストからQRコードSVG文字列を生成する
 * @returns SVG文字列、またはデータが長すぎる場合は null
 */
export function generateQrSvg(data: string): string | null {
  if (!data) return null;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(data);
    qr.make();
    return qr.createSvgTag({ scalable: true });
  } catch {
    return null;
  }
}

/** チケット連番IDを生成する（例: T-00001） */
export function generateTicketId(index: number): string {
  return `T-${String(index).padStart(5, '0')}`;
}

