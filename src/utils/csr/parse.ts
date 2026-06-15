/**
 * csr/parse.ts
 *
 * 既存 CSR（PEM / DER）を解析し Subject/SAN/公開鍵/署名アルゴリズムを抽出する。
 * 署名自己整合性を verify() で検証する（改竄検出）。
 */
import * as asn1js from 'asn1js';
import { CertificationRequest, Extensions, GeneralNames, RSAPublicKey } from 'pkijs';
import { ensureCryptoEngine } from '@/utils/cert/engine';
import { formatIpAddress } from '@/utils/cert/parse';
import type { CsrParseResult, CsrPublicKeyInfo } from './types';

const MAX_INPUT_LENGTH = 1024 * 1024;

const OID_TO_SHORT: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '1.2.840.113549.1.9.1': 'emailAddress',
};

const SIG_ALG_OID: Record<string, string> = {
  '1.2.840.113549.1.1.11': 'SHA256withRSA',
  '1.2.840.113549.1.1.12': 'SHA384withRSA',
  '1.2.840.113549.1.1.13': 'SHA512withRSA',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
};

const PUBKEY_ALG_OID: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.10045.2.1': 'EC',
};

const EC_NAMED_CURVE_OID: Record<string, string> = {
  '1.2.840.10045.3.1.7': 'P-256',
  '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521',
};

const GENERAL_NAME_PREFIX: Record<number, string> = {
  1: 'email',
  2: 'DNS',
  6: 'URI',
  7: 'IP',
};

/** PEM / Base64 / DER 入力を DER ArrayBuffer に正規化する */
function toDer(input: string): ArrayBuffer {
  const pemMatch = input.match(
    /-----BEGIN CERTIFICATE REQUEST-----([\s\S]+?)-----END CERTIFICATE REQUEST-----/
  );
  const b64 = (pemMatch ? pemMatch[1] : input).replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function parsePublicKeyInfo(pkcs10: CertificationRequest): CsrPublicKeyInfo {
  const algorithmId = pkcs10.subjectPublicKeyInfo.algorithm.algorithmId;
  const algName = PUBKEY_ALG_OID[algorithmId] ?? algorithmId;
  const info: CsrPublicKeyInfo = { algorithm: algName };

  if (algName === 'EC') {
    try {
      const params = pkcs10.subjectPublicKeyInfo.algorithm.algorithmParams as
        | { valueBlock?: { toString?: () => string } }
        | undefined;
      if (params?.valueBlock?.toString) {
        const curveOid = params.valueBlock.toString();
        info.namedCurve = EC_NAMED_CURVE_OID[curveOid] ?? curveOid;
      }
    } catch {
      /* パラメータなし */
    }
  } else if (algName === 'RSA') {
    try {
      const spkView = pkcs10.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
      const buf = spkView.buffer.slice(
        spkView.byteOffset,
        spkView.byteOffset + spkView.byteLength
      ) as ArrayBuffer;
      const asn1 = asn1js.fromBER(buf);
      if (asn1.offset !== -1) {
        const rsaPub = new RSAPublicKey({ schema: asn1.result });
        const modulus = rsaPub.modulus.valueBlock.valueHexView;
        const modulusBytes =
          modulus.length > 0 && modulus[0] === 0x00 ? modulus.length - 1 : modulus.length;
        if (modulusBytes > 0) info.keySizeBits = modulusBytes * 8;
      }
    } catch {
      /* best-effort */
    }
  }
  return info;
}

function parseSan(pkcs10: CertificationRequest): string[] {
  const san: string[] = [];
  const extAttr = pkcs10.attributes?.find((a) => a.type === '1.2.840.113549.1.9.14');
  if (!extAttr || extAttr.values.length === 0) return san;
  try {
    const extensions = new Extensions({ schema: extAttr.values[0] });
    const sanExt = extensions.extensions.find((e) => e.extnID === '2.5.29.17');
    if (!sanExt) return san;
    const asn1 = asn1js.fromBER(sanExt.extnValue.valueBlock.valueHexView.slice().buffer);
    const gns = new GeneralNames({ schema: asn1.result });
    for (const gn of gns.names) {
      const prefix = GENERAL_NAME_PREFIX[gn.type];
      if (!prefix) continue;
      let val = '';
      if (gn.type === 7 && gn.value instanceof asn1js.OctetString) {
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
  } catch {
    /* SAN 抽出失敗は無視 */
  }
  return san;
}

/** 既存 CSR を解析する。パース失敗時は error フィールド付きで返す（throw しない）。 */
export async function parseCsr(input: string): Promise<CsrParseResult> {
  const empty: CsrParseResult = {
    subjectFull: '',
    subjectAttributes: [],
    san: [],
    publicKey: { algorithm: '' },
    signatureAlgorithm: '',
    signatureValid: null,
  };

  if (!input.trim()) return { ...empty, error: 'CSR を入力してください。' };
  if (input.length > MAX_INPUT_LENGTH) {
    return { ...empty, error: '入力が大きすぎます（最大 1 MiB）。' };
  }

  ensureCryptoEngine();

  let pkcs10: CertificationRequest;
  try {
    const der = toDer(input);
    const asn1 = asn1js.fromBER(der);
    if (asn1.offset === -1) throw new Error('ASN.1 のデコードに失敗しました。');
    pkcs10 = new CertificationRequest({ schema: asn1.result });
  } catch {
    return {
      ...empty,
      error: 'CSR の解析に失敗しました。PEM（CERTIFICATE REQUEST）または DER の Base64 を入力してください。',
    };
  }

  const subjectAttributes = pkcs10.subject.typesAndValues.map((tv) => ({
    type: OID_TO_SHORT[tv.type] ?? tv.type,
    value: String(tv.value.valueBlock.value),
  }));
  const subjectFull = subjectAttributes.map((a) => `${a.type}=${a.value}`).join(', ');

  const sigOid = pkcs10.signatureAlgorithm.algorithmId;
  const signatureAlgorithm = SIG_ALG_OID[sigOid] ?? sigOid;

  let signatureValid: boolean | null;
  try {
    signatureValid = await pkcs10.verify();
  } catch {
    signatureValid = false;
  }

  return {
    subjectFull,
    subjectAttributes,
    san: parseSan(pkcs10),
    publicKey: parsePublicKeyInfo(pkcs10),
    signatureAlgorithm,
    signatureValid,
  };
}
