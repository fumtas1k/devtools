/**
 * QRチケット: ECDSA P-256署名付きチケットの生成・検証ユーティリティ
 *
 * 暗号処理はすべてWeb Crypto API（ブラウザ組み込み）を使用。
 * QR生成はqrcode-generator（既存依存）を使用。
 */

import qrcode from '@/utils/qrcode';
import { base64UrlToBuffer, bufferToBase64Url } from '@/utils/base64url';

// ─── 型定義 ───────────────────────────────────────────────

export interface TicketPayload {
  e: string; // イベントID (event id)
  t: string; // チケットID (ticket id)
  timestamp: number; // 発行/有効期限 Unixタイムスタンプ（秒）
  n?: string; // 参加者名（任意）
  p?: string; // 料金区分（任意）
}

export interface SignedTicket extends TicketPayload {
  s: string; // base64url ECDSA署名
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

/** パイプ区切りを壊さないように | を半角スペースに置換する */
function sanitizeField(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\|/g, ' ');
}

/** 署名対象のペイロード文字列を構築（パイプ区切り形式） */
export function buildPayload(ticket: TicketPayload): string {
  const e = sanitizeField(ticket.e);
  const t = sanitizeField(ticket.t);
  const ts = String(ticket.timestamp);
  const n = sanitizeField(ticket.n);
  const p = sanitizeField(ticket.p);

  // eventId|ticketId|timestamp|name|category
  return [e, t, ts, n, p].join('|');
}

// ─── 鍵操作 ──────────────────────────────────────────────

/** ECDSA P-256 鍵ペアを生成する */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
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
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
}

/** JWK から公開鍵をインポートする */
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'verify',
  ]);
}

// ─── 署名・検証 ───────────────────────────────────────────

/**
 * TicketPayload に署名して SignedTicket を返す
 * @param payload チケットデータ（署名なし）
 * @param privateKey インポート済みECDSA秘密鍵
 */
export async function signTicket(
  payload: TicketPayload,
  privateKey: CryptoKey
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
  publicKey: CryptoKey
): Promise<VerificationResult> {
  const parts = rawData.split('|');
  if (parts.length !== 6) {
    return { valid: false, ticket: null, expired: false, error: 'QRデータの形式が不正です' };
  }

  const [e, t, tsStr, n, p, s] = parts;
  const timestamp = parseInt(tsStr, 10);

  if (!e || !t || isNaN(timestamp) || !s) {
    return { valid: false, ticket: null, expired: false, error: '必須フィールドが欠けています' };
  }

  const payload: TicketPayload = {
    e,
    t,
    timestamp,
    n: n || undefined,
    p: p || undefined,
  };

  let sigValid = false;
  try {
    const data = new TextEncoder().encode(buildPayload(payload));
    const sigBuf = base64UrlToBuffer(s);
    sigValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      sigBuf,
      data
    );
  } catch {
    return {
      valid: false,
      ticket: null,
      expired: false,
      error: '署名の検証中にエラーが発生しました',
    };
  }

  if (!sigValid) {
    return { valid: false, ticket: payload, expired: false, error: '署名が無効です' };
  }

  const expired = timestamp < Math.floor(Date.now() / 1000);
  if (expired) {
    return { valid: false, ticket: payload, expired: true, error: `有効期限切れ（${timestamp}）` };
  }

  return { valid: true, ticket: payload, expired: false };
}

// ─── QR生成 ──────────────────────────────────────────────

/** SignedTicket をパイプ区切り文字列に変換 */
export function ticketToQrString(ticket: SignedTicket): string {
  const payloadStr = buildPayload(ticket);
  return `${payloadStr}|${ticket.s}`;
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
