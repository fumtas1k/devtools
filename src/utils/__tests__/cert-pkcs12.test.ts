import { describe, it, expect } from 'vitest';
import { parsePkcs12 } from '@/utils/cert/pkcs12';
import { parseDerCertificates } from '@/utils/cert/parse';
import {
  PKCS12_PASSWORD,
  PKCS12_RSA_BASE64,
  PKCS12_EC_BASE64,
  PKCS12_LEGACY_BASE64,
  base64ToBytes,
} from './cert-pkcs12-fixtures';

// ── 陰性対照（正常系: 正しいパスワードで抽出できる）──────────────────
describe('parsePkcs12 — 正常系', () => {
  it('RSA の .p12 から証明書と秘密鍵を抽出する', async () => {
    const result = await parsePkcs12(base64ToBytes(PKCS12_RSA_BASE64), PKCS12_PASSWORD);
    expect(result.error).toBeUndefined();
    expect(result.certs.length).toBeGreaterThanOrEqual(1);
    expect(result.privateKeys.length).toBeGreaterThanOrEqual(1);
    expect(result.privateKeys[0].algorithm).toBe('RSA');
    expect(result.privateKeys[0].keySizeBits).toBe(2048);
    expect(result.privateKeys[0].pkcs8Pem).toContain('-----BEGIN PRIVATE KEY-----');
  });

  it('抽出した証明書を parseDerCertificates で解析できる', async () => {
    const result = await parsePkcs12(base64ToBytes(PKCS12_RSA_BASE64), PKCS12_PASSWORD);
    const parsed = await parseDerCertificates(result.certs);
    expect(parsed.certs[0].error).toBeUndefined();
    expect(parsed.certs[0].subject.full).toContain('pkcs12-test.example');
  });

  it('EC の .p12 から EC 秘密鍵を抽出する', async () => {
    const result = await parsePkcs12(base64ToBytes(PKCS12_EC_BASE64), PKCS12_PASSWORD);
    expect(result.error).toBeUndefined();
    expect(result.privateKeys[0].algorithm).toBe('EC');
    expect(result.privateKeys[0].namedCurve).toBe('P-256');
  });
});

// ── 陽性対照（検知能力: 不正入力を throw せず errorKind で返す）──────
describe('parsePkcs12 — 陽性対照（不正入力の検知）', () => {
  it('誤ったパスワードは errorKind="wrong-password" を返す（throw しない）', async () => {
    const result = await parsePkcs12(base64ToBytes(PKCS12_RSA_BASE64), 'wrong-password-xxx');
    expect(result.errorKind).toBe('wrong-password');
    expect(result.error).toBeTruthy();
    expect(result.certs).toEqual([]);
  });

  it('PKCS#12 でないバイト列は errorKind="parse-error" を返す', async () => {
    const result = await parsePkcs12(new Uint8Array([1, 2, 3, 4, 5]), PKCS12_PASSWORD);
    expect(result.errorKind).toBe('parse-error');
    expect(result.certs).toEqual([]);
  });

  it('レガシー暗号（RC2/3DES）は errorKind="unsupported-encryption" を返す', async () => {
    const result = await parsePkcs12(base64ToBytes(PKCS12_LEGACY_BASE64), PKCS12_PASSWORD);
    expect(result.errorKind).toBe('unsupported-encryption');
    expect(result.error).toBeTruthy();
  });
});
