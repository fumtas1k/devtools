import { describe, it, expect } from 'vitest';
import { ALG_MAP, verifySignature } from '../JwtDecoder';
import { bytesToBase64Url } from '@/utils/base64url';

// ────────────────────────────────────────────
// ALG_MAP の構造検証
// ────────────────────────────────────────────
describe('ALG_MAP', () => {
  it('HS256 が HMAC / SHA-256 にマップされている', () => {
    expect(ALG_MAP['HS256']).toEqual({ name: 'HMAC', hash: 'SHA-256' });
  });

  it('HS384 が HMAC / SHA-384 にマップされている', () => {
    expect(ALG_MAP['HS384']).toEqual({ name: 'HMAC', hash: 'SHA-384' });
  });

  it('HS512 が HMAC / SHA-512 にマップされている', () => {
    expect(ALG_MAP['HS512']).toEqual({ name: 'HMAC', hash: 'SHA-512' });
  });

  it('RS256 が RSASSA-PKCS1-v1_5 / SHA-256 にマップされている', () => {
    expect(ALG_MAP['RS256']).toEqual({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' });
  });

  it('RS384 が RSASSA-PKCS1-v1_5 / SHA-384 にマップされている', () => {
    expect(ALG_MAP['RS384']).toEqual({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' });
  });

  it('RS512 が RSASSA-PKCS1-v1_5 / SHA-512 にマップされている', () => {
    expect(ALG_MAP['RS512']).toEqual({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' });
  });

  it('ES256 が ECDSA / SHA-256 / P-256 にマップされている', () => {
    expect(ALG_MAP['ES256']).toEqual({ name: 'ECDSA', hash: 'SHA-256', namedCurve: 'P-256' });
  });

  it('ES384 が ECDSA / SHA-384 / P-384 にマップされている', () => {
    expect(ALG_MAP['ES384']).toEqual({ name: 'ECDSA', hash: 'SHA-384', namedCurve: 'P-384' });
  });

  it('ES512 が ECDSA / SHA-512 / P-521 にマップされている', () => {
    expect(ALG_MAP['ES512']).toEqual({ name: 'ECDSA', hash: 'SHA-512', namedCurve: 'P-521' });
  });

  it('登録されていない alg は undefined を返す', () => {
    expect(ALG_MAP['NONE']).toBeUndefined();
    expect(ALG_MAP['RS1']).toBeUndefined();
    expect(ALG_MAP['HS1']).toBeUndefined();
  });
});

// ────────────────────────────────────────────
// verifySignature — 不明アルゴリズムは 'unsupported'
// ────────────────────────────────────────────
describe('verifySignature - 未対応アルゴリズム', () => {
  it('ALG_MAP に存在しない alg は "unsupported" を返す', async () => {
    const result = await verifySignature('rawH', 'rawP', 'sig', { alg: 'NONE' }, 'secret');
    expect(result).toBe('unsupported');
  });

  it('alg が文字列でない場合は "unsupported" を返す', async () => {
    const result = await verifySignature('rawH', 'rawP', 'sig', { alg: 123 }, 'secret');
    expect(result).toBe('unsupported');
  });
});

// ────────────────────────────────────────────
// verifySignature — HS256 正常系
// ────────────────────────────────────────────
describe('verifySignature - HS256', () => {
  // 既知の HS256 署名済みトークン
  // header: {"alg":"HS256","typ":"JWT"}, payload: {"sub":"1234567890","name":"John Doe","iat":1516239022}
  // secret: "secret"
  const rawHeader = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
  const rawPayload = 'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ';

  it('正しいシークレットで "valid" を返す', async () => {
    // WebCrypto を使って署名を生成してから検証
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode('test-secret'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${rawHeader}.${rawPayload}`)
    );
    // base64url エンコード
    const sig = bytesToBase64Url(new Uint8Array(sigBuffer));

    const result = await verifySignature(
      rawHeader,
      rawPayload,
      sig,
      { alg: 'HS256' },
      'test-secret'
    );
    expect(result).toBe('valid');
  });

  it('誤ったシークレットで "invalid" を返す', async () => {
    // 正しい署名で誤ったキーを渡す
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode('correct-secret'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${rawHeader}.${rawPayload}`)
    );
    const sig = bytesToBase64Url(new Uint8Array(sigBuffer));

    const result = await verifySignature(
      rawHeader,
      rawPayload,
      sig,
      { alg: 'HS256' },
      'wrong-secret'
    );
    expect(result).toBe('invalid');
  });
});

// ────────────────────────────────────────────
// verifySignature — RS256 不正 PEM は 'error'
// ────────────────────────────────────────────
describe('verifySignature - RS256', () => {
  it('不正な PEM を渡すと "error" を返す', async () => {
    const result = await verifySignature('rawH', 'rawP', 'sig', { alg: 'RS256' }, 'not-a-pem-key');
    expect(result).toBe('error');
  });
});

// ────────────────────────────────────────────
// verifySignature — ES256 不正 PEM は 'error'
// ────────────────────────────────────────────
describe('verifySignature - ES256', () => {
  it('不正な PEM を渡すと "error" を返す', async () => {
    const result = await verifySignature('rawH', 'rawP', 'sig', { alg: 'ES256' }, 'not-a-pem-key');
    expect(result).toBe('error');
  });
});
