// src/utils/csr/types.ts

/** 鍵アルゴリズム種別 */
export type KeyAlgorithm = 'RSA' | 'ECDSA';

/** RSA 鍵長（bit） */
export type RsaModulusLength = 2048 | 3072 | 4096;

/** ECDSA 曲線 */
export type EcCurve = 'P-256' | 'P-384' | 'P-521';

/** Subject DN（識別名）。各フィールドは空文字なら CSR に含めない。 */
export interface SubjectDn {
  /** commonName (CN) */
  commonName: string;
  /** organizationName (O) */
  organization: string;
  /** organizationalUnitName (OU) */
  organizationalUnit: string;
  /** countryName (C) — 2 文字の国コード */
  country: string;
  /** stateOrProvinceName (ST) */
  state: string;
  /** localityName (L) */
  locality: string;
  /** emailAddress */
  email: string;
}

/** SAN（Subject Alternative Name）1 件 */
export interface SanEntry {
  type: 'dns' | 'ip' | 'email';
  value: string;
}

/** CSR 生成パラメータ */
export interface GenerateParams {
  algorithm: KeyAlgorithm;
  /** algorithm==='RSA' のとき有効 */
  rsaModulusLength: RsaModulusLength;
  /** algorithm==='ECDSA' のとき有効 */
  ecCurve: EcCurve;
  subject: SubjectDn;
  san: SanEntry[];
}

/** CSR 生成結果 */
export interface GenerateResult {
  /** CSR の PEM（-----BEGIN CERTIFICATE REQUEST-----） */
  csrPem: string;
  /** 秘密鍵の PKCS#8 PEM（-----BEGIN PRIVATE KEY-----） */
  privateKeyPem: string;
}

/** 解析した CSR の公開鍵情報 */
export interface CsrPublicKeyInfo {
  algorithm: string; // 'RSA' | 'EC' | OID
  keySizeBits?: number;
  namedCurve?: string;
}

/** 既存 CSR の解析結果 */
export interface CsrParseResult {
  /** RFC4514 風の Subject 文字列（例: "CN=example.test, O=Test"） */
  subjectFull: string;
  /** 主要 RDN を個別に */
  subjectAttributes: { type: string; value: string }[];
  /** SAN（例: ['DNS:example.test', 'IP:10.0.0.1']） */
  san: string[];
  publicKey: CsrPublicKeyInfo;
  /** 署名アルゴリズム（人間可読名 or OID） */
  signatureAlgorithm: string;
  /** 署名自己検証の結果（true=整合 / false=不整合 / null=検証不能） */
  signatureValid: boolean | null;
  /** パース失敗時の理由（成功時は undefined） */
  error?: string;
}
