/**
 * key/convert.ts
 *
 * 入力（PEM / DER / JWK）を受け取り、PEM / DER（base64）/ JWK の3形式を同時出力する。
 * 処理は全てブラウザ内の Web Crypto API で完結する（外部送信コード厳禁）。
 *
 * Web Crypto importKey の hash パラメータについて:
 *   変換目的での import のため 'SHA-256' は便宜的な値であり、実際に署名/検証には使用しない。
 *   extractable=true で CryptoKey を取得し、exportKey で全形式を生成することが主目的。
 */

import { detectKeyInput } from './detect';
import type { ConvertResult, KeyAlgorithm, KeyVisibility } from './types';

// ---- PEM 構築ヘルパー ----

/** DER バイト列から PEM テキストを構築する（64文字折返し） */
function buildPem(derBytes: Uint8Array, visibility: KeyVisibility): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < derBytes.length; i += CHUNK) {
    binary += String.fromCharCode(...derBytes.subarray(i, i + CHUNK));
  }
  const b64 = btoa(binary);
  const lines = b64.match(/.{1,64}/g) ?? [];
  const label = visibility === 'public' ? 'PUBLIC KEY' : 'PRIVATE KEY';
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

/** Uint8Array を base64 文字列に変換する */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ---- CryptoKey import ヘルパー ----

/** RSA の importKey アルゴリズムパラメータ（変換用途のため hash は便宜値 SHA-256） */
const RSA_ALG = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;
/** EC importKey アルゴリズムパラメータ（変換用途のため hash は便宜値） */
function ecAlg(namedCurve: string) {
  return { name: 'ECDSA', namedCurve } as const;
}

/** Uint8Array の buffer を確実に ArrayBuffer として取得する */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer;
  }
  // SharedArrayBuffer の場合は slice で通常の ArrayBuffer に変換する
  return bytes.buffer.slice(0) as unknown as ArrayBuffer;
}

async function importFromDer(
  derBytes: Uint8Array,
  visibility: KeyVisibility,
  algorithm: KeyAlgorithm,
  namedCurve: string | undefined
): Promise<CryptoKey> {
  const format = visibility === 'public' ? 'spki' : 'pkcs8';
  const usages: KeyUsage[] = visibility === 'public' ? ['verify'] : ['sign'];
  const alg = algorithm === 'RSA' ? RSA_ALG : ecAlg(namedCurve!);

  return crypto.subtle.importKey(format, toArrayBuffer(derBytes), alg, true, usages);
}

async function importFromJwk(
  jwkObject: JsonWebKey,
  visibility: KeyVisibility,
  algorithm: KeyAlgorithm,
  namedCurve: string | undefined
): Promise<CryptoKey> {
  const usages: KeyUsage[] = visibility === 'public' ? ['verify'] : ['sign'];
  const alg = algorithm === 'RSA' ? RSA_ALG : ecAlg(namedCurve!);

  // 用途・アルゴリズム宣言フィールドを除去して鍵素材のみを取り込む。
  // Web Crypto は JWK の alg / key_ops / use / ext と importKey の algorithm/usages の
  // 整合を厳密検証するため、これらが付いた JWK（RS384/RS512/PS256・enc 用途等）は
  // そのままだと DataError になる。本ツールは鍵素材の形式変換が目的で hash/用途は
  // 変換結果に影響しないため、制約フィールドを外して素材だけを import する。
  const {
    alg: _a,
    key_ops: _k,
    use: _u,
    ext: _e,
    ...material
  } = jwkObject as Record<string, unknown>;

  return crypto.subtle.importKey('jwk', material as JsonWebKey, alg, true, usages);
}

// ---- メイン関数 ----

/**
 * 入力（PEM / DER / JWK）を解析し、PEM / DER（base64）/ JWK の3形式を同時出力する。
 * エラー時は throw せず、`error` フィールドを持つ ConvertResult を返す。
 *
 * @param input テキスト（PEM / JWK / Base64 DER）または Uint8Array（DER バイナリ）
 */
export async function convertKey(input: string | Uint8Array): Promise<ConvertResult> {
  // 1. 入力を検出する
  const detection = detectKeyInput(input);

  if (detection.kind === 'empty') {
    return {};
  }

  if (detection.kind === 'unsupported') {
    return {
      error: detection.message,
      unsupportedReason: detection.reason,
    };
  }

  const { visibility, algorithm, namedCurve, derBytes, jwkObject, source } = detection;

  // 2. CryptoKey を import する
  let cryptoKey: CryptoKey;
  try {
    if (source === 'jwk' && jwkObject) {
      cryptoKey = await importFromJwk(jwkObject, visibility, algorithm, namedCurve);
    } else if (derBytes) {
      cryptoKey = await importFromDer(derBytes, visibility, algorithm, namedCurve);
    } else {
      return { error: '内部エラー: DER / JWK が取得できませんでした。' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      error: `鍵のインポートに失敗しました: ${msg}。鍵データが壊れているか、形式が正しくない可能性があります。`,
    };
  }

  // 3. 各形式に export する
  try {
    const exportFormat = visibility === 'public' ? 'spki' : 'pkcs8';

    // DER export
    const derExported = await crypto.subtle.exportKey(exportFormat, cryptoKey);
    const exportedBytes = new Uint8Array(derExported);

    // JWK export（Web Crypto 注入の advisory フィールドを正規化する）
    const jwkOut = (await crypto.subtle.exportKey('jwk', cryptoKey)) as Record<string, unknown>;
    // Web Crypto が付与する advisory フィールドは変換アーティファクトなので除去する。
    // 特に RSA では実際の意図に関わらず alg:"RS256" が注入されるため、鍵素材から
    // 導けない情報を詐称しないよう削除する。
    delete jwkOut.ext;
    delete jwkOut.key_ops;
    delete jwkOut.alg;
    // 入力が JWK の場合、round-trip で失われる利用者由来メタデータを復元する。
    if (source === 'jwk' && jwkObject) {
      const srcJwk = jwkObject as Record<string, unknown>;
      for (const field of ['alg', 'use', 'kid', 'key_ops'] as const) {
        if (srcJwk[field] !== undefined) jwkOut[field] = srcJwk[field];
      }
    }

    // 4. 各形式を文字列として構築する
    const pem = buildPem(exportedBytes, visibility);
    const derBase64 = bytesToBase64(exportedBytes);
    const jwkText = JSON.stringify(jwkOut, null, 2);

    // 5. 鍵サイズを取得する
    let keySizeBits: number | undefined;
    if (algorithm === 'RSA') {
      keySizeBits = (cryptoKey.algorithm as RsaKeyAlgorithm).modulusLength;
    }

    return {
      visibility,
      algorithm,
      keySizeBits,
      namedCurve,
      pem,
      derBase64,
      derBytes: exportedBytes,
      jwk: jwkText,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      error: `鍵の変換中にエラーが発生しました: ${msg}`,
    };
  }
}
