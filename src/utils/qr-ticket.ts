/**
 * QRチケット: ECDSA P-256署名付きチケットの生成・検証ユーティリティ
 *
 * 暗号処理はすべてWeb Crypto API（ブラウザ組み込み）を使用。
 * QR生成はqrcode-generator（既存依存）を使用。
 */

import qrcode from '@/utils/qrcode';
import { base64UrlToBuffer, bufferToBase64Url } from '@/utils/base64url';

// ─── 定数 ───────────────────────────────────────────────

/** 署名（P-256 Base64URL）の概算バイト数（64バイトのバイナリをBase64URL化したもの。パディングなしで86文字） */
export const SIGNATURE_BYTE_SIZE = 86;

/** QRコードの最大データサイズ（署名・タイムスタンプ等を含む全データの合計バイト数） */
export const MAX_QR_BYTE_SIZE = 250;

/** ペイロードのフィールド名リスト（シリアライズ順） */
const PAYLOAD_FIELDS = ['e', 't', 'timestamp', 'n', 'p'] as const;

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

/**
 * フィールド値に | が含まれていないことを検証する。
 * | が含まれる場合はパイプ区切りフォーマットが壊れるため throw する。
 */
function sanitizeField(value: string | undefined): string {
  if (!value) return '';
  if (value.includes('|')) {
    throw new Error(`フィールド値に | を含めることはできません: "${value}"`);
  }
  return value;
}

/** 署名対象のペイロード文字列を構築（パイプ区切り形式） */
function buildPayload(ticket: TicketPayload): string {
  const e = sanitizeField(ticket.e);
  const t = sanitizeField(ticket.t);
  const ts = String(ticket.timestamp);
  const n = sanitizeField(ticket.n);
  const p = sanitizeField(ticket.p);

  // eventId|ticketId|timestamp|name|category
  return [e, t, ts, n, p].join('|');
}

/**
 * TicketPayload をパイプ区切りのペイロード文字列にシリアライズする。
 * フィールドに | が含まれる場合は throw する。
 */
export function serializeTicket(payload: TicketPayload): string {
  return buildPayload(payload);
}

/**
 * QR 文字列を payload と signature に分解する。
 *
 * 仕様前提: signature は ECDSA P-256 + base64url エンコーディングなので
 * 文字集合は `A-Za-z0-9_-` のみで `|` を含まない。したがって
 * `lastIndexOf('|')` で payload と signature の境界を一意に特定できる。
 *
 * @returns 分解できれば `{ payload, signature }`、形式不正なら `null`
 */
export function parseQrString(raw: string): { payload: string; signature: string } | null {
  const lastPipe = raw.lastIndexOf('|');
  if (lastPipe === -1) return null;
  const payload = raw.slice(0, lastPipe);
  const signature = raw.slice(lastPipe + 1);
  if (!signature) return null;
  // ペイロードが PAYLOAD_FIELDS.length 個のフィールドに分解できることを確認
  const payloadParts = payload.split('|');
  if (payloadParts.length !== PAYLOAD_FIELDS.length) return null;
  return { payload, signature };
}

/** 署名を除くペイロード部分のバイト数を計算する */
function getPayloadByteSize(payload: TicketPayload): number {
  const payloadStr = buildPayload(payload);
  return new TextEncoder().encode(payloadStr).length;
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
  // serializeTicket と対称な parseQrString で payload / signature を分離する
  const parsed = parseQrString(rawData);
  if (!parsed) {
    return { valid: false, ticket: null, expired: false, error: 'QRデータの形式が不正です' };
  }

  const [e, t, tsStr, n, p] = parsed.payload.split('|');
  const s = parsed.signature;
  const timestamp = Number(tsStr);

  if (!e || !t || !Number.isFinite(timestamp) || timestamp <= 0 || !s) {
    return {
      valid: false,
      ticket: null,
      expired: false,
      error: '必須フィールドの欠落または形式が不正です',
    };
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
    return {
      valid: false,
      ticket: payload,
      expired: true,
      error: `有効期限切れ（${formatTimestamp(timestamp)}）`,
    };
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

/** 最終的なQR文字列の概算バイト数を見積もる（署名込み） */
export function estimateTicketByteSize(payload: TicketPayload): number {
  // payloadStr + | + signature
  return getPayloadByteSize(payload) + 1 + SIGNATURE_BYTE_SIZE;
}

/** タイムスタンプを人間が読める形式に変換する */
export function formatTimestamp(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return '';
  return new Date(timestamp * 1000).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });
}
