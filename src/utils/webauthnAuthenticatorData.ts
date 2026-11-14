// 構造を読むだけで、署名や認証の正当性は検証しない。
export interface AuthenticatorDataSummary {
  rpIdHash: Uint8Array;
  flags: { up: boolean; uv: boolean; be: boolean; bs: boolean };
  signCount: number;
}

const MAX_ENCODED_LENGTH = 262_144;
const MAX_CBOR_DEPTH = 16;

function bytesFromBase64Url(value: string): Uint8Array {
  if (value.length > MAX_ENCODED_LENGTH) throw new Error('入力が上限を超えています。');
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new Error('base64url が不正です。');
  }
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  let raw: string;
  try {
    raw = atob(padded);
  } catch {
    throw new Error('base64url が不正です。');
  }
  if (btoa(raw).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') !== value) {
    throw new Error('base64url が不正です。');
  }
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function readAuthenticatorData(bytes: Uint8Array): AuthenticatorDataSummary {
  if (bytes.length < 37) throw new Error('authenticatorData が短すぎます。');
  const bits = bytes[32];
  return {
    rpIdHash: bytes.slice(0, 32),
    flags: { up: !!(bits & 1), uv: !!(bits & 4), be: !!(bits & 8), bs: !!(bits & 16) },
    signCount: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(33),
  };
}

/** 認証レスポンスの authenticatorData の先頭 37 バイトを読む。 */
export function decodeAuthenticatorData(encoded: string): AuthenticatorDataSummary {
  return readAuthenticatorData(bytesFromBase64Url(encoded));
}

interface CborItem {
  major: number;
  start: number;
  length: number;
}

class CborReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  private take(): number {
    if (this.offset >= this.bytes.length) throw new Error('CBOR が途中で終わっています。');
    return this.bytes[this.offset++];
  }

  private length(additional: number): number {
    if (additional < 24) return additional;
    const width =
      additional === 24
        ? 1
        : additional === 25
          ? 2
          : additional === 26
            ? 4
            : additional === 27
              ? 8
              : 0;
    if (!width) throw new Error('この CBOR 形式には対応していません。');
    let value = 0;
    for (let i = 0; i < width; i++) value = value * 256 + this.take();
    if (!Number.isSafeInteger(value)) throw new Error('CBOR の値が大きすぎます。');
    return value;
  }

  item(depth = 0): CborItem {
    if (depth > MAX_CBOR_DEPTH) throw new Error('CBOR の入れ子が深すぎます。');
    const header = this.take();
    const major = header >>> 5;
    if (major === 7 && (header & 31) >= 25 && (header & 31) <= 27) {
      const width = (header & 31) === 25 ? 2 : (header & 31) === 26 ? 4 : 8;
      for (let i = 0; i < width; i++) this.take();
      return { major, start: this.offset, length: 0 };
    }
    const length = this.length(header & 31);
    const start = this.offset;
    if (major === 2 || major === 3) {
      if (length > this.bytes.length - this.offset)
        throw new Error('CBOR が途中で終わっています。');
      this.offset += length;
    } else if (major === 4 || major === 5) {
      const count = major === 5 ? length * 2 : length;
      if (count > this.bytes.length - this.offset) throw new Error('CBOR が途中で終わっています。');
      for (let i = 0; i < count; i++) this.item(depth + 1);
    } else if (major === 6) {
      this.item(depth + 1);
    }
    return { major, start, length };
  }

  /** authData だけを取り出し、未知のフィールドも CBOR として走査する。 */
  attestationAuthData(): Uint8Array {
    const header = this.take();
    if (header >>> 5 !== 5) throw new Error('attestationObject は CBOR map が必要です。');
    const count = this.length(header & 31);
    if (count * 2 > this.bytes.length - this.offset)
      throw new Error('CBOR が途中で終わっています。');
    let authData: Uint8Array | undefined;
    for (let i = 0; i < count; i++) {
      const key = this.item(1);
      if (key.major !== 3) throw new Error('attestationObject のキーが不正です。');
      let name: string;
      try {
        name = new TextDecoder('utf-8', { fatal: true }).decode(
          this.bytes.subarray(key.start, key.start + key.length)
        );
      } catch {
        throw new Error('attestationObject のキーが不正です。');
      }
      const value = this.item(1);
      if (name === 'authData') {
        if (authData || value.major !== 2) throw new Error('authData が不正です。');
        authData = this.bytes.slice(value.start, value.start + value.length);
      }
    }
    if (this.offset !== this.bytes.length || !authData)
      throw new Error('attestationObject が不正です。');
    return authData;
  }
}

/** 登録レスポンスの CBOR attestationObject から authData を読む。 */
export function decodeAttestationObject(encoded: string): AuthenticatorDataSummary {
  return readAuthenticatorData(new CborReader(bytesFromBase64Url(encoded)).attestationAuthData());
}

/** RP ID の SHA-256 とデータ内の hash を比較する。認証検証ではない。 */
export async function compareRpIdHash(
  data: AuthenticatorDataSummary,
  rpId: string
): Promise<boolean> {
  if (!rpId || /[\s/:?#@\\]/u.test(rpId)) throw new Error('RP ID はホスト名で指定してください。');
  let host: string;
  try {
    host = new URL(`https://${rpId}/`).hostname;
  } catch {
    throw new Error('RP ID はホスト名で指定してください。');
  }
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(host))
  );
  return digest.every((byte, index) => byte === data.rpIdHash[index]);
}
