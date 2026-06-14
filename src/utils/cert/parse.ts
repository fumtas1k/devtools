/**
 * cert/parse.ts
 *
 * `parseCertificates(input)` — 入力（PEM / DER / PKCS#7）を受け取り、
 * `ParseResult` に正規化された証明書情報を返す。
 *
 * 1枚のパース失敗は error フィールド付き ParsedCert として継続する。
 */

import * as asn1js from 'asn1js';
import {
  Certificate,
  ContentInfo,
  SignedData,
  BasicConstraints,
  GeneralNames,
  AuthorityKeyIdentifier,
  ExtKeyUsage,
  AttributeTypeAndValue,
  RSAPublicKey,
  getAlgorithmByOID,
} from 'pkijs';

import { detectInput } from './detect';
import { ensureCryptoEngine } from './engine';
import { decodeSct } from './sct';
import type { ParsedCert, ParseResult, CertName, PublicKeyInfo } from './types';

// テキスト入力の最大長（1 MiB）。これを超える入力は早期に拒否する（防御多重化）。
const MAX_INPUT_LENGTH = 1024 * 1024;

// ────────────────────────────────────────────────────────────────────────────
// OID → 短縮名マッピング
// ────────────────────────────────────────────────────────────────────────────

const OID_TO_SHORT: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '1.2.840.113549.1.9.1': 'emailAddress',
};

// 署名アルゴリズム OID → 人間が読める名前
const SIG_ALG_OID: Record<string, string> = {
  '1.2.840.113549.1.1.5': 'SHA1withRSA',
  '1.2.840.113549.1.1.11': 'SHA256withRSA',
  '1.2.840.113549.1.1.12': 'SHA384withRSA',
  '1.2.840.113549.1.1.13': 'SHA512withRSA',
  '1.2.840.10045.4.3.1': 'ecdsa-with-SHA224',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
  '2.16.840.1.101.3.4.3.1': 'id-dsa-with-sha224',
  '2.16.840.1.101.3.4.3.2': 'id-dsa-with-sha256',
};

// 公開鍵アルゴリズム OID
const PUBKEY_ALG_OID: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.10045.2.1': 'EC',
  '1.2.840.10040.4.1': 'DSA',
};

// EC named curve OID
const EC_NAMED_CURVE_OID: Record<string, string> = {
  '1.2.840.10045.3.1.7': 'P-256',
  '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521',
};

// KeyUsage ビット名
const KEY_USAGE_NAMES = [
  'digitalSignature',
  'nonRepudiation',
  'keyEncipherment',
  'dataEncipherment',
  'keyAgreement',
  'keyCertSign',
  'cRLSign',
  'encipherOnly',
  'decipherOnly',
];

// GeneralName type → prefix
const GENERAL_NAME_PREFIX: Record<number, string> = {
  1: 'email',
  2: 'DNS',
  6: 'URI',
  7: 'IP',
};

// ────────────────────────────────────────────────────────────────────────────
// ヘルパー関数
// ────────────────────────────────────────────────────────────────────────────

/** Uint8Array を colon 区切り大文字 hex に変換する */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
}

/** Uint8Array を colon なし hex に変換する */
function bytesToHexPlain(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** iPAddress オクテット列を IPv4（4 byte）/ IPv6（16 byte）表記に整形する */
function formatIpAddress(bytes: Uint8Array): string {
  if (bytes.length === 4) {
    return Array.from(bytes).join('.');
  }
  if (bytes.length === 16) {
    // 2 byte ずつ 16 進グループに（省略圧縮はせず素直に表示）
    const groups: string[] = [];
    for (let i = 0; i < 16; i += 2) {
      groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
    }
    return groups.join(':');
  }
  // 想定外長は hex で fallback
  return bytesToHexPlain(bytes);
}

/** AttributeTypeAndValue[] を CertName に変換する */
function parseDn(typesAndValues: AttributeTypeAndValue[]): CertName {
  const attributes: { type: string; value: string }[] = [];

  for (const atv of typesAndValues) {
    const shortName = OID_TO_SHORT[atv.type] ?? atv.type;
    let val = '';
    // asn1js の値オブジェクトから文字列を取り出す
    if (
      atv.value &&
      typeof (atv.value as { valueBlock?: { value?: unknown } }).valueBlock?.value === 'string'
    ) {
      val = (atv.value as { valueBlock: { value: string } }).valueBlock.value;
    } else if (
      atv.value &&
      typeof (atv.value as unknown as { value?: unknown }).value === 'string'
    ) {
      val = (atv.value as unknown as { value: string }).value;
    } else {
      val = String(atv.value ?? '');
    }
    attributes.push({ type: shortName, value: val });
  }

  const full = attributes.map((a) => `${a.type}=${a.value}`).join(', ');
  return { full, attributes };
}

/** SHA-256 フィンガープリントを計算する（colon 区切り大文字 hex） */
async function fingerprintSha256(der: Uint8Array): Promise<string> {
  // Node.js の crypto.subtle は ArrayBuffer を要求するため明示的にコピーする
  const buf = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return bytesToHex(new Uint8Array(hash));
}

/** Extension の extnValue.valueBlock.valueHex から内部 DER を得る */
function getExtensionValueHex(ext: { extnValue: asn1js.OctetString }): Uint8Array {
  // extnValue は OctetString で、その valueBlock.valueHex が内部 DER
  const ov = ext.extnValue as unknown as {
    valueBlock?: { valueHex?: ArrayBuffer; valueHexView?: Uint8Array };
  };
  if (ov.valueBlock?.valueHexView) {
    return ov.valueBlock.valueHexView;
  }
  if (ov.valueBlock?.valueHex) {
    return new Uint8Array(ov.valueBlock.valueHex);
  }
  return new Uint8Array(0);
}

/** pkijs Certificate から PublicKeyInfo を抽出する */
function parsePublicKeyInfo(cert: Certificate): PublicKeyInfo {
  const algorithmId = cert.subjectPublicKeyInfo.algorithm.algorithmId;
  const algName = PUBKEY_ALG_OID[algorithmId] ?? algorithmId;

  const info: PublicKeyInfo = { algorithm: algName };

  if (algName === 'EC') {
    // EC パラメータから namedCurve を取得
    // algorithmParams は asn1js ObjectIdentifier。OID 文字列は valueBlock.toString() で取得する。
    // valueBlock.value は SID ブロックの配列なので直接文字列として使わない。
    try {
      const params = cert.subjectPublicKeyInfo.algorithm.algorithmParams as
        | {
            valueBlock?: { toString?: () => string };
          }
        | undefined;
      if (params?.valueBlock?.toString) {
        const curveOid = params.valueBlock.toString();
        info.namedCurve = EC_NAMED_CURVE_OID[curveOid] ?? curveOid;
      }
    } catch {
      // パラメータなし
    }
  } else if (algName === 'RSA') {
    // subjectPublicKey（BIT STRING）の中身は RSAPublicKey ::= SEQUENCE { modulus, publicExponent }。
    // modulus INTEGER のバイト長（先頭の符号用 0x00 を除く）から正確な鍵長を求める。
    try {
      const spkView = cert.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
      const buf = spkView.buffer.slice(
        spkView.byteOffset,
        spkView.byteOffset + spkView.byteLength
      ) as ArrayBuffer;
      const asn1 = asn1js.fromBER(buf);
      if (asn1.offset !== -1) {
        const rsaPub = new RSAPublicKey({ schema: asn1.result });
        const modulus = rsaPub.modulus.valueBlock.valueHexView;
        // 先頭の符号用 0x00 を除いたバイト長 × 8 が鍵長
        const modulusBytes =
          modulus.length > 0 && modulus[0] === 0x00 ? modulus.length - 1 : modulus.length;
        if (modulusBytes > 0) {
          info.keySizeBits = modulusBytes * 8;
        }
      }
    } catch {
      // 鍵長の算出失敗（best-effort）
    }
  }

  return info;
}

/** pkijs Certificate から SAN を string[] で取得する */
function parseSan(cert: Certificate): string[] {
  const san: string[] = [];
  const sanExt = cert.extensions?.find((e) => e.extnID === '2.5.29.17');
  if (!sanExt) return san;

  try {
    const sanDer = getExtensionValueHex(sanExt);
    const asn1 = asn1js.fromBER(sanDer);
    const gns = new GeneralNames({ schema: asn1.result });
    for (const gn of gns.names) {
      const prefix = GENERAL_NAME_PREFIX[gn.type];
      if (prefix) {
        let val = '';
        if (gn.type === 7 && gn.value instanceof asn1js.OctetString) {
          // IP アドレス（4 byte → IPv4、16 byte → IPv6）
          const ipBytes = (gn.value as unknown as { valueBlock: { valueHexView: Uint8Array } })
            .valueBlock.valueHexView;
          val = formatIpAddress(ipBytes);
        } else if (typeof gn.value === 'string') {
          val = gn.value;
        } else {
          val = String(gn.value);
        }
        san.push(`${prefix}:${val}`);
      }
    }
  } catch {
    // SAN パースエラーは無視
  }

  return san;
}

/** KeyUsage ビットフラグから string[] を取得する */
function parseKeyUsage(cert: Certificate): string[] {
  const kuExt = cert.extensions?.find((e) => e.extnID === '2.5.29.15');
  if (!kuExt) return [];

  try {
    const kuDer = getExtensionValueHex(kuExt);
    const asn1 = asn1js.fromBER(kuDer);
    const bs = asn1.result as asn1js.BitString;
    const view = bs.valueBlock.valueHexView;
    const usages: string[] = [];
    // ビットは MSB first（RFC 5280）
    for (let byteIdx = 0; byteIdx < view.length; byteIdx++) {
      for (let bit = 7; bit >= 0; bit--) {
        const nameIdx = byteIdx * 8 + (7 - bit);
        if (nameIdx >= KEY_USAGE_NAMES.length) break;
        if (view[byteIdx] & (1 << bit)) {
          usages.push(KEY_USAGE_NAMES[nameIdx]);
        }
      }
    }
    return usages;
  } catch {
    return [];
  }
}

/** ExtKeyUsage OID から string[] を取得する */
function parseExtKeyUsage(cert: Certificate): string[] {
  const ekuExt = cert.extensions?.find((e) => e.extnID === '2.5.29.37');
  if (!ekuExt) return [];

  try {
    const ekuDer = getExtensionValueHex(ekuExt);
    const asn1 = asn1js.fromBER(ekuDer);
    const eku = new ExtKeyUsage({ schema: asn1.result });
    return eku.keyPurposes;
  } catch {
    return [];
  }
}

/** BasicConstraints から isCa / pathLen を取得する */
function parseBasicConstraints(cert: Certificate): { isCa: boolean; pathLen?: number } {
  const bcExt = cert.extensions?.find((e) => e.extnID === '2.5.29.19');
  if (!bcExt) return { isCa: false };

  try {
    const bcDer = getExtensionValueHex(bcExt);
    const asn1 = asn1js.fromBER(bcDer);
    const bc = new BasicConstraints({ schema: asn1.result });
    const pathLen =
      bc.pathLenConstraint !== undefined
        ? typeof bc.pathLenConstraint === 'number'
          ? bc.pathLenConstraint
          : undefined
        : undefined;
    return { isCa: bc.cA, pathLen };
  } catch {
    return { isCa: false };
  }
}

/** SubjectKeyIdentifier hex を取得する */
function parseSkId(cert: Certificate): string | undefined {
  const skiExt = cert.extensions?.find((e) => e.extnID === '2.5.29.14');
  if (!skiExt) return undefined;

  try {
    const skiDer = getExtensionValueHex(skiExt);
    const asn1 = asn1js.fromBER(skiDer);
    // SKI の値は OctetString
    const oct = asn1.result as asn1js.OctetString;
    const view = oct.valueBlock.valueHexView ?? new Uint8Array(0);
    return bytesToHexPlain(view);
  } catch {
    return undefined;
  }
}

/** AuthorityKeyIdentifier hex を取得する */
function parseAkId(cert: Certificate): string | undefined {
  const akiExt = cert.extensions?.find((e) => e.extnID === '2.5.29.35');
  if (!akiExt) return undefined;

  try {
    const akiDer = getExtensionValueHex(akiExt);
    const asn1 = asn1js.fromBER(akiDer);
    const aki = new AuthorityKeyIdentifier({ schema: asn1.result });
    if (aki.keyIdentifier) {
      const view = aki.keyIdentifier.valueBlock.valueHexView;
      return bytesToHexPlain(view);
    }
  } catch {
    // AKI パースエラーは無視
  }
  return undefined;
}

/** pkijs Certificate の Integer serialNumber を hex に変換する */
function serialToHex(cert: Certificate): string {
  const view = cert.serialNumber.valueBlock.valueHexView;
  return bytesToHexPlain(view);
}

/** 署名アルゴリズム OID → 人間が読める名前 */
function sigAlgName(cert: Certificate): string {
  const oid = cert.signatureAlgorithm.algorithmId;
  if (SIG_ALG_OID[oid]) return SIG_ALG_OID[oid];
  // pkijs の getAlgorithmByOID で取得を試みる
  try {
    const alg = getAlgorithmByOID(oid) as { name?: string };
    if (alg.name) return alg.name;
  } catch {
    // fallthrough
  }
  return oid;
}

// ────────────────────────────────────────────────────────────────────────────
// DER 1枚 → ParsedCert
// ────────────────────────────────────────────────────────────────────────────

async function parseSingleDer(der: Uint8Array): Promise<ParsedCert> {
  const sct: ParsedCert['sct'] = [];

  const derBuf = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer;
  const asn1 = asn1js.fromBER(derBuf);
  if (asn1.offset === -1) {
    throw new Error('ASN.1 デコードに失敗しました');
  }

  const cert = new Certificate({ schema: asn1.result });

  const subject = parseDn(cert.subject.typesAndValues);
  const issuer = parseDn(cert.issuer.typesAndValues);
  const serialNumberHex = serialToHex(cert);
  const notBefore = cert.notBefore.value;
  const notAfter = cert.notAfter.value;
  const signatureAlgorithm = sigAlgName(cert);
  const publicKey = parsePublicKeyInfo(cert);
  const san = parseSan(cert);
  const keyUsage = parseKeyUsage(cert);
  const extKeyUsage = parseExtKeyUsage(cert);
  const { isCa, pathLen } = parseBasicConstraints(cert);
  const subjectKeyId = parseSkId(cert);
  const authorityKeyId = parseAkId(cert);
  const fp = await fingerprintSha256(der);

  // SCT 拡張（OID: 1.3.6.1.4.1.11129.2.4.2）を処理
  const sctExt = cert.extensions?.find((e) => e.extnID === '1.3.6.1.4.1.11129.2.4.2');
  if (sctExt) {
    try {
      const sctDer = getExtensionValueHex(sctExt);
      // SCT 拡張は OCTET STRING の中に TLS 構造があるため、内部バイト列を渡す
      // extnValue は OctetString で、その valueHex が実際の TLS serialized SCT list
      const inner = asn1js.fromBER(sctDer);
      if (inner.offset !== -1 && inner.result instanceof asn1js.OctetString) {
        const octView =
          (
            inner.result as unknown as {
              valueBlock: { valueHexView?: Uint8Array; valueHex?: ArrayBuffer };
            }
          ).valueBlock.valueHexView ??
          new Uint8Array(
            (inner.result as unknown as { valueBlock: { valueHex?: ArrayBuffer } }).valueBlock
              .valueHex ?? new ArrayBuffer(0)
          );
        sct.push(...decodeSct(octView));
      }
    } catch {
      // SCT デコード失敗は無視（best-effort）
    }
  }

  return {
    subject,
    issuer,
    serialNumberHex,
    notBefore,
    notAfter,
    signatureAlgorithm,
    publicKey,
    san,
    keyUsage,
    extKeyUsage,
    isCa,
    pathLen,
    subjectKeyId,
    authorityKeyId,
    fingerprintSha256: fp,
    sct,
    der,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// PKCS#7 ContentInfo → DER 候補の展開
// ────────────────────────────────────────────────────────────────────────────

function extractCertsFromPkcs7(der: Uint8Array): Uint8Array[] {
  const pkcs7Buf = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer;
  const asn1 = asn1js.fromBER(pkcs7Buf);
  if (asn1.offset === -1) throw new Error('PKCS#7 ASN.1 デコードに失敗しました');

  const contentInfo = new ContentInfo({ schema: asn1.result });
  if (contentInfo.contentType !== ContentInfo.SIGNED_DATA) {
    throw new Error('PKCS#7 は SignedData 形式ではありません');
  }

  const signedData = new SignedData({ schema: contentInfo.content });
  const certs: Uint8Array[] = [];

  for (const item of signedData.certificates ?? []) {
    if (item instanceof Certificate) {
      certs.push(new Uint8Array(item.toSchema().toBER(false)));
    }
  }

  return certs;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * 入力（PEM/DER/PKCS#7 テキストまたはバイナリ）を解析し、
 * `ParseResult` を返す。1枚のパース失敗は継続する。
 */
export async function parseCertificates(input: string | Uint8Array): Promise<ParseResult> {
  if (typeof input === 'string' && input.length > MAX_INPUT_LENGTH) {
    return { certs: [], topLevelError: '入力が大きすぎます（最大 1 MiB）。' };
  }

  ensureCryptoEngine();

  const detected = detectInput(input);

  if (detected.kind === 'empty') {
    return { certs: [], topLevelError: '入力が空です' };
  }

  if (detected.unsupported === 'pkcs12') {
    return {
      certs: [],
      topLevelError: 'PKCS#12 は未対応です',
      unsupported: 'pkcs12',
    };
  }

  if (detected.kind === 'unknown') {
    return {
      certs: [],
      topLevelError: '対応している証明書形式（PEM/DER/PKCS#7）が見つかりませんでした',
    };
  }

  // DER 候補を収集
  const derList: Uint8Array[] = [];

  for (const candidate of detected.candidates) {
    if (candidate.source === 'pkcs7') {
      try {
        const expanded = extractCertsFromPkcs7(candidate.der);
        derList.push(...expanded);
      } catch {
        // PKCS#7 展開失敗は壊れた候補として残す
        derList.push(candidate.der);
      }
    } else {
      derList.push(candidate.der);
    }
  }

  return parseDerCertificates(derList);
}

/**
 * DER エンコード済み証明書の配列を ParsedCert[] に変換する。
 * PKCS#12 経路（pkcs12.ts）と PEM/DER/PKCS#7 経路（parseCertificates）の共通後段。
 * 1 枚のパース失敗は error フィールド付き ParsedCert として継続する。
 */
export async function parseDerCertificates(derList: Uint8Array[]): Promise<ParseResult> {
  ensureCryptoEngine();

  if (derList.length === 0) {
    return { certs: [], topLevelError: '証明書が見つかりませんでした' };
  }

  const certs: ParsedCert[] = [];

  for (const der of derList) {
    try {
      const parsed = await parseSingleDer(der);
      certs.push(parsed);
    } catch (e) {
      certs.push({
        subject: { full: '(パースエラー)', attributes: [] },
        issuer: { full: '(パースエラー)', attributes: [] },
        serialNumberHex: '',
        notBefore: new Date(0),
        notAfter: new Date(0),
        signatureAlgorithm: '',
        publicKey: { algorithm: '' },
        san: [],
        keyUsage: [],
        extKeyUsage: [],
        isCa: false,
        fingerprintSha256: '',
        sct: [],
        der,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { certs };
}
