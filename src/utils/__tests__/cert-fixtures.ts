/**
 * テスト用証明書チェーン生成ヘルパー
 *
 * pkijs + Web Crypto (ECDSA P-256) で root → intermediate → leaf の自己署名チェーンを
 * テスト実行時に動的に生成する。実証明書ハードコードによる有効期限切れ問題を回避。
 */
import * as asn1js from 'asn1js';
import {
  Certificate,
  AttributeTypeAndValue,
  BasicConstraints,
  Extension,
  GeneralName,
  GeneralNames,
  AuthorityKeyIdentifier,
} from 'pkijs';
import { ensureCryptoEngine } from '@/utils/cert/engine';

/** DER バイト列を PEM 文字列に変換する */
function derToPem(der: Uint8Array): string {
  const b64 = Buffer.from(der).toString('base64');
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}

/** ECDSA P-256 鍵ペアを生成する */
async function generateEcKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
}

/**
 * 証明書を構築する共通ヘルパー
 *
 * @param subject - subjectの CN 文字列
 * @param issuerDn - issuer の typesAndValues（自己署名の場合は subject と同じ）
 * @param subjectKeyPair - subject の鍵ペア
 * @param issuerKeyPair - 署名に使う issuer の秘密鍵
 * @param serial - シリアル番号
 * @param isCa - BasicConstraints で cA フラグを立てるか
 * @param notBefore - 有効期限開始
 * @param notAfter - 有効期限終了
 * @param extensions - 追加拡張
 */
async function buildCert(options: {
  subjectCN: string;
  issuerCN: string;
  subjectKeyPair: CryptoKeyPair;
  issuerPrivateKey: CryptoKey;
  serial: number;
  isCa: boolean;
  notBefore: Date;
  notAfter: Date;
  extraExtensions?: Extension[];
}): Promise<Certificate> {
  const {
    subjectCN,
    issuerCN,
    subjectKeyPair,
    issuerPrivateKey,
    serial,
    isCa,
    notBefore,
    notAfter,
    extraExtensions = [],
  } = options;

  const cert = new Certificate();
  cert.version = 2; // X.509 v3

  // シリアル番号
  cert.serialNumber = new asn1js.Integer({ value: serial });

  // Subject
  cert.subject.typesAndValues.push(
    new AttributeTypeAndValue({
      type: '2.5.4.3', // CN
      value: new asn1js.Utf8String({ value: subjectCN }),
    })
  );

  // Issuer
  cert.issuer.typesAndValues.push(
    new AttributeTypeAndValue({
      type: '2.5.4.3', // CN
      value: new asn1js.Utf8String({ value: issuerCN }),
    })
  );

  // 有効期限
  cert.notBefore.value = notBefore;
  cert.notAfter.value = notAfter;

  // 公開鍵を subjectPublicKeyInfo に設定
  await cert.subjectPublicKeyInfo.importKey(subjectKeyPair.publicKey);

  // 拡張を追加
  cert.extensions = [];

  // BasicConstraints
  const basicConstr = new BasicConstraints({ cA: isCa });
  cert.extensions.push(
    new Extension({
      extnID: '2.5.29.19',
      critical: true,
      extnValue: basicConstr.toSchema().toBER(false),
      parsedValue: basicConstr,
    })
  );

  // 追加の拡張（SAN 等）
  for (const ext of extraExtensions) {
    cert.extensions.push(ext);
  }

  // 署名（ECDSA P-256 + SHA-256）
  await cert.sign(issuerPrivateKey, 'SHA-256');

  return cert;
}

/** Certificate を DER バイト列に変換する */
function certToDer(cert: Certificate): Uint8Array {
  return new Uint8Array(cert.toSchema().toBER(false));
}

export interface TestChain {
  rootDer: Uint8Array;
  intermediateDer: Uint8Array;
  leafDer: Uint8Array;
  rootPem: string;
  intermediatePem: string;
  leafPem: string;
}

/**
 * ECDSA P-256 で 3 段の証明書チェーンを生成する。
 *
 * root（自己署名） → intermediate（root 署名） → leaf（intermediate 署名）
 * leaf に SAN（DNS:example.test）を付与。
 * notBefore = 昨日、notAfter = 1年後。
 */
export async function makeTestChain(): Promise<TestChain> {
  ensureCryptoEngine();

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400_000);
  const nextYear = new Date(now.getTime() + 365 * 86400_000);

  // 鍵ペア生成
  const rootKeys = await generateEcKeyPair();
  const intermediateKeys = await generateEcKeyPair();
  const leafKeys = await generateEcKeyPair();

  // root 証明書（自己署名）
  const rootCert = await buildCert({
    subjectCN: 'Test Root CA',
    issuerCN: 'Test Root CA',
    subjectKeyPair: rootKeys,
    issuerPrivateKey: rootKeys.privateKey,
    serial: 1,
    isCa: true,
    notBefore: yesterday,
    notAfter: nextYear,
  });

  // intermediate 証明書（root で署名）
  const intermediateCert = await buildCert({
    subjectCN: 'Test Intermediate CA',
    issuerCN: 'Test Root CA',
    subjectKeyPair: intermediateKeys,
    issuerPrivateKey: rootKeys.privateKey,
    serial: 2,
    isCa: true,
    notBefore: yesterday,
    notAfter: nextYear,
  });

  // leaf 証明書（intermediate で署名）、SAN 付き
  const sanExt = buildSanExtension(['example.test']);
  const leafCert = await buildCert({
    subjectCN: 'CN=example.test',
    issuerCN: 'Test Intermediate CA',
    subjectKeyPair: leafKeys,
    issuerPrivateKey: intermediateKeys.privateKey,
    serial: 3,
    isCa: false,
    notBefore: yesterday,
    notAfter: nextYear,
    extraExtensions: [sanExt],
  });

  const rootDer = certToDer(rootCert);
  const intermediateDer = certToDer(intermediateCert);
  const leafDer = certToDer(leafCert);

  return {
    rootDer,
    intermediateDer,
    leafDer,
    rootPem: derToPem(rootDer),
    intermediatePem: derToPem(intermediateDer),
    leafPem: derToPem(leafDer),
  };
}

/**
 * 期限切れの自己署名証明書を生成する（notAfter = 昨日）。
 */
export async function makeExpiredCert(): Promise<Uint8Array> {
  ensureCryptoEngine();

  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 86400_000);
  const yesterday = new Date(now.getTime() - 86400_000);

  const keys = await generateEcKeyPair();
  const cert = await buildCert({
    subjectCN: 'Expired Test Cert',
    issuerCN: 'Expired Test Cert',
    subjectKeyPair: keys,
    issuerPrivateKey: keys.privateKey,
    serial: 99,
    isCa: false,
    notBefore: twoDaysAgo,
    notAfter: yesterday,
  });

  return certToDer(cert);
}

/**
 * 2048bit RSA（RSASSA-PKCS1-v1_5 / SHA-256）の自己署名証明書を生成する。
 * 鍵長算出（parsePublicKeyInfo）の検証に使う。
 */
export async function makeRsaCert(): Promise<Uint8Array> {
  ensureCryptoEngine();

  const keys = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  const now = new Date();
  const cert = await buildCert({
    subjectCN: 'RSA Test Cert',
    issuerCN: 'RSA Test Cert',
    subjectKeyPair: keys,
    issuerPrivateKey: keys.privateKey,
    serial: 7,
    isCa: false,
    notBefore: new Date(now.getTime() - 86400_000),
    notAfter: new Date(now.getTime() + 365 * 86400_000),
  });

  return certToDer(cert);
}

/**
 * Subject Alternative Name 拡張を構築する。
 * @param dnsNames - DNS 名の配列
 */
function buildSanExtension(dnsNames: string[]): Extension {
  const altNames = new GeneralNames({
    names: dnsNames.map(
      (name) =>
        new GeneralName({
          type: 2, // dNSName
          value: name,
        })
    ),
  });

  return new Extension({
    extnID: '2.5.29.17', // Subject Alternative Name
    critical: false,
    extnValue: altNames.toSchema().toBER(false),
    parsedValue: altNames,
  });
}

/** SubjectKeyIdentifier 拡張（2.5.29.14）を構築する */
function buildSkiExtension(keyId: Uint8Array): Extension {
  // 拡張値の内側は OCTET STRING { keyId }。pkijs Extension が外側 OCTET STRING で包む。
  const inner = new asn1js.OctetString({ valueHex: keyId.buffer.slice(0) });
  return new Extension({
    extnID: '2.5.29.14',
    critical: false,
    extnValue: inner.toBER(false),
  });
}

/** AuthorityKeyIdentifier 拡張（2.5.29.35）を keyIdentifier だけ持たせて構築する */
function buildAkiExtension(keyId: Uint8Array): Extension {
  const aki = new AuthorityKeyIdentifier({
    keyIdentifier: new asn1js.OctetString({
      idBlock: { tagClass: 3, tagNumber: 0 }, // context [0] IMPLICIT
      valueHex: keyId.buffer.slice(0),
    }),
  });
  return new Extension({
    extnID: '2.5.29.35',
    critical: false,
    extnValue: aki.toSchema().toBER(false),
  });
}

export interface DuplicateDnChain {
  /** 同一 Subject DN "CN=Dup CA" を持つ自己署名 CA 2 枚（SKI 違い）。 */
  caAPem: string; // SKI = 0xAA×20
  caBPem: string; // SKI = 0xBB×20
  /** issuer=Dup CA、AKI=skiB、caB の鍵で署名された leaf。 */
  leafPem: string;
  /** caB の SubjectKeyIdentifier の期待値（lowercase hex）。 */
  skiBHex: string;
}

/**
 * 同一 Subject DN の CA が複数ある状況を再現するフィクスチャ。
 * leaf は caB の鍵で署名され AKI=skiB を持つため、AKI/SKI による親解決が
 * 正しく caB を選べるかを検証できる。
 */
export async function makeDuplicateDnChain(): Promise<DuplicateDnChain> {
  ensureCryptoEngine();

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400_000);
  const nextYear = new Date(now.getTime() + 365 * 86400_000);

  const skiA = new Uint8Array(20).fill(0xaa);
  const skiB = new Uint8Array(20).fill(0xbb);

  const caAKeys = await generateEcKeyPair();
  const caBKeys = await generateEcKeyPair();
  const leafKeys = await generateEcKeyPair();

  const caA = await buildCert({
    subjectCN: 'Dup CA',
    issuerCN: 'Dup CA',
    subjectKeyPair: caAKeys,
    issuerPrivateKey: caAKeys.privateKey,
    serial: 11,
    isCa: true,
    notBefore: yesterday,
    notAfter: nextYear,
    extraExtensions: [buildSkiExtension(skiA)],
  });

  const caB = await buildCert({
    subjectCN: 'Dup CA',
    issuerCN: 'Dup CA',
    subjectKeyPair: caBKeys,
    issuerPrivateKey: caBKeys.privateKey,
    serial: 12,
    isCa: true,
    notBefore: yesterday,
    notAfter: nextYear,
    extraExtensions: [buildSkiExtension(skiB)],
  });

  const leaf = await buildCert({
    subjectCN: 'dup-leaf.test',
    issuerCN: 'Dup CA',
    subjectKeyPair: leafKeys,
    issuerPrivateKey: caBKeys.privateKey, // caB の鍵で署名
    serial: 13,
    isCa: false,
    notBefore: yesterday,
    notAfter: nextYear,
    extraExtensions: [buildAkiExtension(skiB)],
  });

  return {
    caAPem: derToPem(certToDer(caA)),
    caBPem: derToPem(certToDer(caB)),
    leafPem: derToPem(certToDer(leaf)),
    skiBHex: 'bb'.repeat(20),
  };
}
