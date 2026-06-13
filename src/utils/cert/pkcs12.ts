/**
 * cert/pkcs12.ts
 *
 * PKCS#12（.pfx/.p12）の復号・抽出。
 *
 * pkijs の PFX → AuthenticatedSafe → SafeContents → SafeBag を辿り、
 * 証明書 DER と PKCS#8 秘密鍵を取り出す。
 *
 * ブラウザの Web Crypto は PBES2（AES-CBC + PBKDF2）のみ復号可能。
 * レガシー RC2-40/3DES（OpenSSL 1.x 既定）は復号できず errorKind='unsupported-encryption' を返す。
 *
 * 全処理はブラウザ内で完結し、外部送信しない。
 */
import * as asn1js from 'asn1js';
import { PFX, RSAPrivateKey } from 'pkijs';
import type { Certificate, PrivateKeyInfo } from 'pkijs';
import { ensureCryptoEngine } from './engine';
import type { Pkcs12Result, Pkcs12KeyInfo } from './types';

const CERT_BAG_OID = '1.2.840.113549.1.12.10.1.3';
const SHROUDED_KEY_BAG_OID = '1.2.840.113549.1.12.10.1.2';
const KEY_BAG_OID = '1.2.840.113549.1.12.10.1.1';

const PUBKEY_ALG_OID: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.10045.2.1': 'EC',
  '1.2.840.10040.4.1': 'DSA',
};

const EC_NAMED_CURVE_OID: Record<string, string> = {
  '1.2.840.10045.3.1.7': 'P-256',
  '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521',
};

/** Uint8Array → 専用 ArrayBuffer */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/** DER → PEM（PRIVATE KEY） */
function derToPem(der: Uint8Array, label: string): string {
  let binary = '';
  for (let i = 0; i < der.length; i++) binary += String.fromCharCode(der[i]);
  const b64 = btoa(binary);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

/** PrivateKeyInfo から Pkcs12KeyInfo を構築する */
function buildKeyInfo(pki: PrivateKeyInfo): Pkcs12KeyInfo {
  const der = new Uint8Array(pki.toSchema().toBER(false));
  const pkcs8Pem = derToPem(der, 'PRIVATE KEY');

  const algOid = pki.privateKeyAlgorithm.algorithmId;
  const algorithm = PUBKEY_ALG_OID[algOid] ?? algOid;
  const info: Pkcs12KeyInfo = { algorithm, pkcs8Pem };

  if (algorithm === 'EC') {
    try {
      const params = pki.privateKeyAlgorithm.algorithmParams as
        | { valueBlock?: { toString?: () => string } }
        | undefined;
      if (params?.valueBlock?.toString) {
        const curveOid = params.valueBlock.toString();
        info.namedCurve = EC_NAMED_CURVE_OID[curveOid] ?? curveOid;
      }
    } catch {
      // best-effort
    }
  } else if (algorithm === 'RSA') {
    try {
      // privateKey OCTET STRING の中身が RSAPrivateKey ::= SEQUENCE { version, modulus, ... }
      const inner = (pki.privateKey as unknown as { valueBlock: { valueHexView: Uint8Array } })
        .valueBlock.valueHexView;
      const asn1 = asn1js.fromBER(toArrayBuffer(inner));
      if (asn1.offset !== -1) {
        const rsa = new RSAPrivateKey({ schema: asn1.result });
        const modulus = rsa.modulus.valueBlock.valueHexView;
        const modulusBytes =
          modulus.length > 0 && modulus[0] === 0x00 ? modulus.length - 1 : modulus.length;
        if (modulusBytes > 0) info.keySizeBits = modulusBytes * 8;
      }
    } catch {
      // best-effort
    }
  }

  return info;
}

/**
 * バイト列が PKCS#12（PFX）構造に見えるかを安価に判定する（復号なし）。
 * 貼り付け Base64 が p12 か証明書 DER かを区別するのに使う。
 */
export function looksLikePkcs12(bytes: Uint8Array): boolean {
  try {
    const asn1 = asn1js.fromBER(toArrayBuffer(bytes));
    if (asn1.offset === -1) return false;
    const pfx = new PFX({ schema: asn1.result });
    // PFX version は v3。authSafe.contentType が data / signedData。
    return pfx.version === 3 && typeof pfx.authSafe?.contentType === 'string';
  } catch {
    return false;
  }
}

/**
 * PKCS#12 バイト列をパスワードで復号し、証明書 DER と秘密鍵を抽出する。
 * 不正入力（誤パスワード・非 p12・レガシー暗号）は throw せず errorKind で返す。
 */
export async function parsePkcs12(bytes: Uint8Array, password: string): Promise<Pkcs12Result> {
  ensureCryptoEngine();

  const pwd = toArrayBuffer(new TextEncoder().encode(password));

  // 1. 構造パース
  let pfx: PFX;
  try {
    const asn1 = asn1js.fromBER(toArrayBuffer(bytes));
    if (asn1.offset === -1) throw new Error('ASN.1 デコードに失敗しました');
    pfx = new PFX({ schema: asn1.result });
  } catch {
    return {
      certs: [],
      privateKeys: [],
      error: 'PKCS#12（.pfx/.p12）として解析できませんでした。ファイルが破損している可能性があります。',
      errorKind: 'parse-error',
    };
  }

  // 2. MAC 整合性検証（誤パスワード検出）
  try {
    await pfx.parseInternalValues({ password: pwd, checkIntegrity: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/integrity/i.test(msg)) {
      return {
        certs: [],
        privateKeys: [],
        error: 'パスワードが正しくありません（または MAC 整合性が壊れています）。',
        errorKind: 'wrong-password',
      };
    }
    return {
      certs: [],
      privateKeys: [],
      error: `PKCS#12 の解析に失敗しました: ${msg}`,
      errorKind: 'parse-error',
    };
  }

  // 3. AuthenticatedSafe 復号（レガシー暗号検出）
  const authSafe = pfx.parsedValue?.authenticatedSafe;
  if (!authSafe) {
    return { certs: [], privateKeys: [], error: 'AuthenticatedSafe が見つかりません。', errorKind: 'parse-error' };
  }
  try {
    await authSafe.parseInternalValues({
      safeContents: authSafe.safeContents.map(() => ({ password: pwd })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unknown|unsupported|contentEncryptionAlgorithm/i.test(msg)) {
      return {
        certs: [],
        privateKeys: [],
        error:
          'この PKCS#12 はレガシー暗号（RC2/3DES 等）で保護されており、ブラウザでは復号できません。' +
          '「openssl pkcs12 -keypbe AES-256-CBC -certpbe AES-256-CBC -export ...」で再エクスポートしてください。',
        errorKind: 'unsupported-encryption',
      };
    }
    if (/integrity/i.test(msg)) {
      return { certs: [], privateKeys: [], error: 'パスワードが正しくありません。', errorKind: 'wrong-password' };
    }
    return { certs: [], privateKeys: [], error: `復号に失敗しました: ${msg}`, errorKind: 'parse-error' };
  }

  // 4. SafeBag 走査
  const certs: Uint8Array[] = [];
  const privateKeys: Pkcs12KeyInfo[] = [];

  for (const sc of authSafe.parsedValue.safeContents) {
    const safeBags = (sc as { value: { safeBags: Array<{ bagId: string; bagValue: unknown }> } })
      .value.safeBags;
    for (const bag of safeBags) {
      try {
        if (bag.bagId === CERT_BAG_OID) {
          const certBag = bag.bagValue as { parsedValue?: Certificate };
          if (certBag.parsedValue && 'toSchema' in certBag.parsedValue) {
            certs.push(new Uint8Array(certBag.parsedValue.toSchema().toBER(false)));
          }
        } else if (bag.bagId === SHROUDED_KEY_BAG_OID) {
          const keyBag = bag.bagValue as {
            parseInternalValues: (p: { password: ArrayBuffer }) => Promise<void>;
            parsedValue?: PrivateKeyInfo;
          };
          await keyBag.parseInternalValues({ password: pwd });
          if (keyBag.parsedValue) privateKeys.push(buildKeyInfo(keyBag.parsedValue));
        } else if (bag.bagId === KEY_BAG_OID) {
          privateKeys.push(buildKeyInfo(bag.bagValue as PrivateKeyInfo));
        }
      } catch {
        // 1 バッグの失敗は無視して継続（best-effort）
      }
    }
  }

  return { certs, privateKeys };
}
