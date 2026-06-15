/**
 * csr/generate.ts
 *
 * Web Crypto で鍵ペアを生成し、pkijs で PKCS#10 CSR を構築する。
 * 全処理がブラウザ内で完結する（秘密鍵を外部送信しない）。
 */
import * as asn1js from 'asn1js';
import {
  CertificationRequest,
  AttributeTypeAndValue,
  Attribute,
  Extension,
  Extensions,
  GeneralName,
  GeneralNames,
} from 'pkijs';
import { ensureCryptoEngine } from '@/utils/cert/engine';
import type { GenerateParams, GenerateResult, SubjectDn, SanEntry } from './types';

// Subject DN フィールド → OID（push 順は CN→O→OU→C→ST→L→email）
const DN_OID = {
  commonName: '2.5.4.3',
  organization: '2.5.4.10',
  organizationalUnit: '2.5.4.11',
  country: '2.5.4.6',
  state: '2.5.4.8',
  locality: '2.5.4.7',
  email: '1.2.840.113549.1.9.1',
} as const;

const DN_ORDER: (keyof SubjectDn)[] = [
  'commonName',
  'organization',
  'organizationalUnit',
  'country',
  'state',
  'locality',
  'email',
];

/** DN フィールドの ASN.1 文字種を返す（countryName=Printable, email=IA5, それ以外=UTF8） */
function dnAsn1Value(field: keyof SubjectDn, value: string): asn1js.BaseBlock {
  if (field === 'country') return new asn1js.PrintableString({ value });
  if (field === 'email') return new asn1js.IA5String({ value });
  return new asn1js.Utf8String({ value });
}

/** Uint8Array を 64 文字折返し PEM テキストに変換する */
function derToPem(der: ArrayBuffer, label: string): string {
  const bytes = new Uint8Array(der);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const b64 = btoa(binary);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

/** ドット表記 IPv4 を 4 オクテットの Uint8Array に変換する（不正なら null） */
function ipv4ToOctets(value: string): Uint8Array | null {
  const parts = value.trim().split('.');
  if (parts.length !== 4) return null;
  const octets = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets[i] = n;
  }
  return octets;
}

/** SAN エントリ群を pkijs GeneralNames に変換する */
function buildGeneralNames(san: SanEntry[]): GeneralNames {
  const names: GeneralName[] = [];
  for (const entry of san) {
    const v = entry.value.trim();
    if (!v) continue;
    if (entry.type === 'dns') {
      names.push(new GeneralName({ type: 2, value: v }));
    } else if (entry.type === 'email') {
      names.push(new GeneralName({ type: 1, value: v }));
    } else if (entry.type === 'ip') {
      const octets = ipv4ToOctets(v);
      if (octets) {
        names.push(
          new GeneralName({
            type: 7,
            value: new asn1js.OctetString({ valueHex: octets.buffer }),
          })
        );
      }
    }
  }
  return new GeneralNames({ names });
}

/** ECDSA 曲線に対応するハッシュアルゴリズム */
function ecHash(curve: GenerateParams['ecCurve']): string {
  if (curve === 'P-384') return 'SHA-384';
  if (curve === 'P-521') return 'SHA-512';
  return 'SHA-256';
}

/**
 * 鍵ペアを生成して PKCS#10 CSR を構築する。
 * CN も SAN も空の場合はエラーを投げる。
 */
export async function generateCsr(params: GenerateParams): Promise<GenerateResult> {
  ensureCryptoEngine();

  const hasSan = params.san.some((e) => e.value.trim() !== '');
  if (!params.subject.commonName.trim() && !hasSan) {
    throw new Error('CN（コモンネーム）または SAN を1つ以上入力してください。');
  }

  // 1. 鍵ペア生成
  const usages: KeyUsage[] = ['sign', 'verify'];
  let keyPair: CryptoKeyPair;
  let hashAlg: string;
  if (params.algorithm === 'RSA') {
    hashAlg = 'SHA-256';
    keyPair = (await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: params.rsaModulusLength,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: hashAlg,
      },
      true,
      usages
    )) as CryptoKeyPair;
  } else {
    hashAlg = ecHash(params.ecCurve);
    keyPair = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: params.ecCurve },
      true,
      usages
    )) as CryptoKeyPair;
  }

  // 2. CSR 構築
  const pkcs10 = new CertificationRequest();
  pkcs10.version = 0;

  for (const field of DN_ORDER) {
    const value = params.subject[field].trim();
    if (!value) continue;
    pkcs10.subject.typesAndValues.push(
      new AttributeTypeAndValue({
        type: DN_OID[field],
        value: dnAsn1Value(field, value),
      })
    );
  }

  await pkcs10.subjectPublicKeyInfo.importKey(keyPair.publicKey);

  // 3. SAN を extensionRequest 属性として追加
  if (hasSan) {
    const altNames = buildGeneralNames(params.san);
    pkcs10.attributes = [
      new Attribute({
        type: '1.2.840.113549.1.9.14', // pkcs-9-at-extensionRequest
        values: [
          new Extensions({
            extensions: [
              new Extension({
                extnID: '2.5.29.17', // id-ce-subjectAltName
                critical: false,
                extnValue: altNames.toSchema().toBER(false),
              }),
            ],
          }).toSchema(),
        ],
      }),
    ];
  }

  // 4. 署名
  await pkcs10.sign(keyPair.privateKey, hashAlg);

  // 5. PEM 出力
  const csrDer = pkcs10.toSchema(true).toBER(false);
  const csrPem = derToPem(csrDer, 'CERTIFICATE REQUEST');

  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const privateKeyPem = derToPem(pkcs8, 'PRIVATE KEY');

  return { csrPem, privateKeyPem };
}
