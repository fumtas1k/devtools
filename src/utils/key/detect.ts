/**
 * key/detect.ts
 *
 * 入力（テキスト文字列 / バイナリ Uint8Array）を受け取り、
 * 鍵の種別・アルゴリズム・DER バイト列 / JWK オブジェクトを返す。
 *
 * 検出優先順位:
 *   1. テキストが `{` 始まりで JSON parse 可能かつ `kty` を持つ → JWK
 *   2. `-----BEGIN ... -----` マッチ → PEM
 *   3. Uint8Array または base64-only テキスト（先頭 0x30 DER） → DER
 */

import * as asn1js from 'asn1js';
import type { KeyDetection } from './types';

// ---- OID 定数 ----

/** rsaEncryption: 1.2.840.113549.1.1.1 */
const OID_RSA = '1.2.840.113549.1.1.1';
/** ecPublicKey: 1.2.840.10045.2.1 */
const OID_EC = '1.2.840.10045.2.1';
/** prime256v1 (P-256): 1.2.840.10045.3.1.7 */
const OID_P256 = '1.2.840.10045.3.1.7';
/** secp384r1 (P-384): 1.3.132.0.34 */
const OID_P384 = '1.3.132.0.34';
/** secp521r1 (P-521): 1.3.132.0.35 */
const OID_P521 = '1.3.132.0.35';

const EC_CURVE_MAP: Record<string, string> = {
  [OID_P256]: 'P-256',
  [OID_P384]: 'P-384',
  [OID_P521]: 'P-521',
};

// ---- asn1js valueBlock アクセス用型 ----

/** asn1js の valueBlock を as unknown 経由でアクセスするための型 */
type AsnBlock = {
  valueBlock?: {
    value?: AsnBlock[];
    toString?: () => string;
    tagClass?: number;
    tagNumber?: number;
  };
  idBlock?: {
    tagClass?: number;
    tagNumber?: number;
  };
};

// ---- ヘルパー ----

/**
 * Base64 文字列（改行・空白を含んでいてよい）を Uint8Array にデコードする。
 * cert/detect.ts の実装に倣ったコピー（依存関係を作らない方針）。
 */
export function base64ToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/\s/g, '');
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Uint8Array の buffer を確実に ArrayBuffer として取得する。
 * SharedArrayBuffer は asn1js / Web Crypto API が受け付けないため slice で複製する。
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer;
  }
  // SharedArrayBuffer の場合は slice で通常の ArrayBuffer に変換する
  return bytes.buffer.slice(0) as unknown as ArrayBuffer;
}

/**
 * asn1js でパースした SEQUENCE から AlgorithmIdentifier の OID 文字列を取得する。
 * SPKI: SEQUENCE { SEQUENCE { OID alg, params }, BIT STRING }
 * SPKI の AlgorithmIdentifier OID を返す。取得できない場合は null を返す。
 */
function extractAlgOidFromSpki(seq: AsnBlock): string | null {
  try {
    const algSeq = seq.valueBlock?.value?.[0] as AsnBlock | undefined;
    if (!algSeq) return null;
    const oidBlock = algSeq.valueBlock?.value?.[0] as AsnBlock | undefined;
    if (!oidBlock) return null;
    return oidBlock.valueBlock?.toString?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * EC SPKI から named curve OID を取得する。
 * AlgorithmIdentifier.parameters の OID を返す。
 */
function extractEcCurveOidFromSpki(seq: AsnBlock): string | null {
  try {
    const algSeq = seq.valueBlock?.value?.[0] as AsnBlock | undefined;
    if (!algSeq) return null;
    // AlgorithmIdentifier: SEQUENCE { OID alg, OID namedCurve }
    const paramsBlock = algSeq.valueBlock?.value?.[1] as AsnBlock | undefined;
    if (!paramsBlock) return null;
    return paramsBlock.valueBlock?.toString?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * EC PKCS#8 から named curve OID を取得する。
 * PKCS#8: SEQUENCE { INTEGER version, SEQUENCE { OID alg, OID namedCurve }, OCTET STRING }
 */
function extractEcCurveOidFromPkcs8(seq: AsnBlock): string | null {
  try {
    const algSeq = seq.valueBlock?.value?.[1] as AsnBlock | undefined;
    if (!algSeq) return null;
    const paramsBlock = algSeq.valueBlock?.value?.[1] as AsnBlock | undefined;
    if (!paramsBlock) return null;
    return paramsBlock.valueBlock?.toString?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * PKCS#8 か SPKI かを判定する。
 * PKCS#8: SEQUENCE の第1要素が INTEGER（version=0）
 * SPKI: SEQUENCE の第1要素が SEQUENCE（AlgorithmIdentifier）
 *
 * 返り値: 'pkcs8' | 'spki' | null（判定不能）
 */
function classifyDerStructure(
  asn1Result: ReturnType<typeof asn1js.fromBER>
): 'pkcs8' | 'spki' | null {
  const seq = asn1Result.result as unknown as AsnBlock;
  if (!seq) return null;

  const items = seq.valueBlock?.value;
  if (!Array.isArray(items) || items.length < 2) return null;

  const firstItem = items[0] as AsnBlock;
  const tagClass = firstItem?.idBlock?.tagClass;
  const tagNumber = firstItem?.idBlock?.tagNumber;

  // tagClass=1 (UNIVERSAL), tagNumber=2 (INTEGER) → PKCS#8
  if (tagClass === 1 && tagNumber === 2) {
    return 'pkcs8';
  }

  // tagClass=1 (UNIVERSAL), tagNumber=16 (SEQUENCE) → SPKI
  if (tagClass === 1 && tagNumber === 16) {
    return 'spki';
  }

  return null;
}

/**
 * PKCS#8 の AlgorithmIdentifier OID を取得する。
 * PKCS#8: SEQUENCE { INTEGER version, SEQUENCE { OID alg, ... }, OCTET STRING }
 */
function extractAlgOidFromPkcs8(seq: AsnBlock): string | null {
  try {
    const algSeq = seq.valueBlock?.value?.[1] as AsnBlock | undefined;
    if (!algSeq) return null;
    const oidBlock = algSeq.valueBlock?.value?.[0] as AsnBlock | undefined;
    if (!oidBlock) return null;
    return oidBlock.valueBlock?.toString?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * DER バイト列を解析して鍵情報を返す。
 */
function parseDer(derBytes: Uint8Array): Extract<KeyDetection, { kind: 'ok' | 'unsupported' }> {
  if (derBytes.length === 0 || derBytes[0] !== 0x30) {
    return {
      kind: 'unsupported',
      reason: 'invalid-input',
      message: '入力を解析できませんでした。PEM / DER（Base64）/ JWK 形式で入力してください。',
    };
  }

  let asn1Result: ReturnType<typeof asn1js.fromBER>;
  try {
    asn1Result = asn1js.fromBER(toArrayBuffer(derBytes));
  } catch {
    return {
      kind: 'unsupported',
      reason: 'invalid-input',
      message: '入力を解析できませんでした。DER の形式が正しくない可能性があります。',
    };
  }

  if (asn1Result.offset === -1 || !asn1Result.result) {
    return {
      kind: 'unsupported',
      reason: 'invalid-input',
      message: '入力を解析できませんでした。DER の形式が正しくない可能性があります。',
    };
  }

  const structure = classifyDerStructure(asn1Result);
  const seqBlock = asn1Result.result as unknown as AsnBlock;

  if (structure === 'spki') {
    const algOid = extractAlgOidFromSpki(seqBlock);
    if (algOid === OID_RSA) {
      return { kind: 'ok', visibility: 'public', algorithm: 'RSA', derBytes, source: 'der' };
    }
    if (algOid === OID_EC) {
      const curveOid = extractEcCurveOidFromSpki(seqBlock);
      const namedCurve = curveOid ? EC_CURVE_MAP[curveOid] : undefined;
      if (!namedCurve) {
        return {
          kind: 'unsupported',
          reason: 'unknown-algorithm',
          message: `未対応の EC 曲線です（OID: ${curveOid ?? '不明'}）。P-256 / P-384 / P-521 のみ対応しています。`,
        };
      }
      return {
        kind: 'ok',
        visibility: 'public',
        algorithm: 'EC',
        namedCurve,
        derBytes,
        source: 'der',
      };
    }
    if (algOid) {
      return {
        kind: 'unsupported',
        reason: 'unknown-algorithm',
        message: `未対応の鍵アルゴリズムです（OID: ${algOid}）。RSA / ECDSA（P-256/P-384/P-521）のみ対応しています。`,
      };
    }
  }

  if (structure === 'pkcs8') {
    const algOid = extractAlgOidFromPkcs8(seqBlock);
    if (algOid === OID_RSA) {
      return { kind: 'ok', visibility: 'private', algorithm: 'RSA', derBytes, source: 'der' };
    }
    if (algOid === OID_EC) {
      const curveOid = extractEcCurveOidFromPkcs8(seqBlock);
      const namedCurve = curveOid ? EC_CURVE_MAP[curveOid] : undefined;
      if (!namedCurve) {
        return {
          kind: 'unsupported',
          reason: 'unknown-algorithm',
          message: `未対応の EC 曲線です（OID: ${curveOid ?? '不明'}）。P-256 / P-384 / P-521 のみ対応しています。`,
        };
      }
      return {
        kind: 'ok',
        visibility: 'private',
        algorithm: 'EC',
        namedCurve,
        derBytes,
        source: 'der',
      };
    }
    if (algOid) {
      return {
        kind: 'unsupported',
        reason: 'unknown-algorithm',
        message: `未対応の鍵アルゴリズムです（OID: ${algOid}）。RSA / ECDSA（P-256/P-384/P-521）のみ対応しています。`,
      };
    }
  }

  return {
    kind: 'unsupported',
    reason: 'invalid-input',
    message:
      '入力を解析できませんでした。対応形式は SPKI（公開鍵）/ PKCS#8（秘密鍵）の DER / PEM / JWK です。',
  };
}

// ---- メイン関数 ----

/**
 * 入力（テキスト文字列または Uint8Array）を受け取り、鍵の種別・アルゴリズムを判定する。
 *
 * 検出優先順位:
 *   1. テキストが `{` 始まりで JSON parse 可能かつ `kty` を持つ → JWK
 *   2. `-----BEGIN ... -----` マッチ → PEM
 *   3. Uint8Array または base64-only テキスト → DER
 *
 * @param input テキスト（PEM / JWK / Base64 DER）または Uint8Array（DER バイナリ）
 */
export function detectKeyInput(input: string | Uint8Array): KeyDetection {
  // バイナリ入力
  if (input instanceof Uint8Array) {
    if (input.length === 0) return { kind: 'empty' };
    return parseDer(input);
  }

  // テキスト入力
  const trimmed = input.trim();
  if (trimmed === '') return { kind: 'empty' };

  // ---- JWK 判定 ----
  if (trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {
        kind: 'unsupported',
        reason: 'invalid-input',
        message:
          '入力が JSON として解析できません。JWK の場合は正しい JSON 形式で入力してください。',
      };
    }

    if (typeof parsed !== 'object' || parsed === null || !('kty' in parsed)) {
      return {
        kind: 'unsupported',
        reason: 'invalid-input',
        message: 'kty フィールドがありません。有効な JWK を入力してください。',
      };
    }

    const jwk = parsed as Record<string, unknown>;
    const kty = jwk['kty'];
    const visibility = 'd' in jwk ? 'private' : 'public';

    if (kty === 'RSA') {
      return {
        kind: 'ok',
        visibility,
        algorithm: 'RSA',
        jwkObject: jwk as JsonWebKey,
        source: 'jwk',
      };
    }

    if (kty === 'EC') {
      const crv = jwk['crv'];
      if (crv === 'P-256' || crv === 'P-384' || crv === 'P-521') {
        return {
          kind: 'ok',
          visibility,
          algorithm: 'EC',
          namedCurve: crv,
          jwkObject: jwk as JsonWebKey,
          source: 'jwk',
        };
      }
      return {
        kind: 'unsupported',
        reason: 'unknown-algorithm',
        message: `未対応の EC 曲線です（crv: ${String(crv)}）。P-256 / P-384 / P-521 のみ対応しています。`,
      };
    }

    if (kty === 'OKP') {
      return {
        kind: 'unsupported',
        reason: 'unknown-algorithm',
        message:
          'Ed25519 / Ed448（kty: OKP）は v1 非対応です。RSA または ECDSA（P-256/P-384/P-521）の鍵を入力してください。',
      };
    }

    return {
      kind: 'unsupported',
      reason: 'unknown-algorithm',
      message: `未対応の鍵タイプです（kty: ${String(kty)}）。RSA / EC のみ対応しています。`,
    };
  }

  // ---- PEM 判定 ----
  const pemRegex = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/;
  const pemMatch = pemRegex.exec(trimmed);

  if (pemMatch) {
    const label = pemMatch[1].trim();
    const b64Body = pemMatch[2];

    // 未対応 PEM ラベルの判定（優先）
    if (label === 'RSA PUBLIC KEY' || label === 'RSA PRIVATE KEY' || label === 'EC PRIVATE KEY') {
      return {
        kind: 'unsupported',
        reason: 'legacy-pem',
        message:
          `レガシー PEM 形式（${label}）は v1 非対応です。` +
          (label === 'RSA PUBLIC KEY'
            ? ' openssl rsa -RSAPublicKey_in -in key.pem -pubout でSPKI形式に変換してください。'
            : ' openssl pkcs8 -topk8 -nocrypt -in key.pem -out key_pkcs8.pem でPKCS#8形式に変換してください。'),
      };
    }

    if (label === 'ENCRYPTED PRIVATE KEY') {
      return {
        kind: 'unsupported',
        reason: 'encrypted',
        message:
          '暗号化された秘密鍵（ENCRYPTED PRIVATE KEY）は v1 非対応です。' +
          ' openssl pkcs8 -in key.pem -nocrypt -out key_plain.pem で復号してから変換してください。',
      };
    }

    if (label === 'PUBLIC KEY' || label === 'PRIVATE KEY') {
      let derBytes: Uint8Array;
      try {
        derBytes = base64ToBytes(b64Body);
      } catch {
        return {
          kind: 'unsupported',
          reason: 'invalid-input',
          message: 'PEM の Base64 部分が不正です。',
        };
      }
      return parseDer(derBytes);
    }

    return {
      kind: 'unsupported',
      reason: 'invalid-input',
      message: `未知の PEM ラベル（${label}）です。PUBLIC KEY / PRIVATE KEY ヘッダの PEM を入力してください。`,
    };
  }

  // ---- DER（base64 テキスト）判定 ----
  const stripped = trimmed.replace(/\s/g, '');
  if (/^[A-Za-z0-9+/]+=*$/.test(stripped) && stripped.length > 0) {
    try {
      const derBytes = base64ToBytes(stripped);
      if (derBytes.length > 0 && derBytes[0] === 0x30) {
        return parseDer(derBytes);
      }
    } catch {
      // デコード失敗は下の fallback へ
    }
  }

  return {
    kind: 'unsupported',
    reason: 'invalid-input',
    message: '入力を解析できませんでした。PEM / DER（Base64）/ JWK 形式で入力してください。',
  };
}
