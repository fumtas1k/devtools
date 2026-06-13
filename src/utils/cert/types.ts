export interface CertName {
  /** RFC4514 風の文字列（例: "CN=example.test, O=Test"） */
  full: string;
  /** 主要 RDN を個別に */
  attributes: { type: string; value: string }[];
}

export interface PublicKeyInfo {
  algorithm: string; // 'RSA' | 'EC' | その他 OID 名
  keySizeBits?: number;
  namedCurve?: string;
}

export interface SctEntry {
  version: number;
  logId: string; // hex
  timestamp: number; // ms
}

export interface ParsedCert {
  subject: CertName;
  issuer: CertName;
  serialNumberHex: string;
  notBefore: Date;
  notAfter: Date;
  signatureAlgorithm: string;
  publicKey: PublicKeyInfo;
  san: string[]; // 例: ['DNS:example.test', 'IP:10.0.0.1']
  keyUsage: string[];
  extKeyUsage: string[];
  isCa: boolean;
  pathLen?: number;
  subjectKeyId?: string; // hex
  authorityKeyId?: string; // hex
  fingerprintSha256: string; // hex, colon区切り
  sct: SctEntry[];
  /** 元 DER（チェーン検証で再利用） */
  der: Uint8Array;
  /** このカードのパースに失敗した場合の理由 */
  error?: string;
}

export interface ParseResult {
  certs: ParsedCert[];
  /** 入力全体に対するエラー（空・未対応形式など） */
  topLevelError?: string;
  unsupported?: 'pkcs12';
}

/** 入力から検出した1件分の DER エンコード済み証明書候補 */
export interface DerCandidate {
  /** DER バイト列 */
  der: Uint8Array;
  /** 由来形式（表示・デバッグ用） */
  source: 'pem' | 'der' | 'pkcs7';
}

export interface DetectResult {
  kind: 'pem' | 'der' | 'pkcs7' | 'pkcs12' | 'empty' | 'unknown';
  candidates: DerCandidate[];
  /** PKCS#12 等の未対応形式を検出したときの理由（UI で別issue誘導に使う） */
  unsupported?: 'pkcs12';
}

export interface ChainLink {
  subjectIndex: number; // ParsedCert 配列内の index
  issuerIndex: number | null; // 親（null = 自己署名 or 親不明）
  signatureValid: boolean | null; // null = 検証不能（親不明・アルゴ未対応）
  expired: boolean;
}

export interface ChainResult {
  /** issuer→subject の表示順に並べ替えた ParsedCert の index 列 */
  order: number[];
  links: ChainLink[];
}
