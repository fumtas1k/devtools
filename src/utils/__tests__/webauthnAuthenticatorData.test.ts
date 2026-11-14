import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  compareRpIdHash,
  decodeAttestationObject,
  decodeAuthenticatorData,
} from '../webauthnAuthenticatorData';

function encoded(bytes: number[] | Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function authenticator(flags = 0x1d): number[] {
  const hash = createHash('sha256').update('example.test').digest();
  return [...hash, flags, 0, 0, 1, 2];
}

function attestation(data: number[]): number[] {
  // 合成 CBOR map: {fmt: 'none', authData: <bytes>, attStmt: {}}
  return [
    0xa3,
    0x63,
    0x66,
    0x6d,
    0x74,
    0x64,
    0x6e,
    0x6f,
    0x6e,
    0x65,
    0x68,
    ...new TextEncoder().encode('authData'),
    0x58,
    data.length,
    ...data,
    0x67,
    ...new TextEncoder().encode('attStmt'),
    0xa0,
  ];
}

describe('authenticatorData の受動的な読み取り', () => {
  it('合成認証データからフラグとカウンタを読む', () => {
    const result = decodeAuthenticatorData(encoded(authenticator()));
    expect(result.flags).toEqual({ up: true, uv: true, be: true, bs: true });
    expect(result.signCount).toBe(258);
    expect(decodeAuthenticatorData(encoded(authenticator(0))).flags).toEqual({
      up: false,
      uv: false,
      be: false,
      bs: false,
    });
  });

  it('合成 attestationObject の authData を読む', () => {
    expect(decodeAttestationObject(encoded(attestation(authenticator())))).toEqual(
      decodeAuthenticatorData(encoded(authenticator()))
    );
  });

  it('RP ID の hash 一致と不一致を区別する', async () => {
    const data = decodeAuthenticatorData(encoded(authenticator()));
    await expect(compareRpIdHash(data, 'example.test')).resolves.toBe(true);
    await expect(compareRpIdHash(data, 'other.test')).resolves.toBe(false);
    await expect(compareRpIdHash(data, 'https://example.test')).rejects.toThrow('RP ID');
  });

  it('国際化ドメインを ASCII ホスト名として比較する', async () => {
    const hash = createHash('sha256').update('xn--r8jz45g.xn--zckzah').digest();
    const data = decodeAuthenticatorData(encoded([...hash, 0, 0, 0, 0, 0]));
    await expect(compareRpIdHash(data, '例え.テスト')).resolves.toBe(true);
  });

  it('短いバイナリ、不正な base64url と上限超過を拒否する（陽性対照）', () => {
    expect(() => decodeAuthenticatorData(encoded(authenticator().slice(0, 36)))).toThrow('短すぎ');
    expect(() => decodeAuthenticatorData('!')).toThrow('base64url');
    expect(() => decodeAuthenticatorData('A'.repeat(262_145))).toThrow('上限');
  });

  it('切断、欠落、重複、末尾データを含む CBOR を拒否する（陽性対照）', () => {
    const data = attestation(authenticator());
    expect(() => decodeAttestationObject(encoded(data.slice(0, -1)))).toThrow();
    expect(() => decodeAttestationObject(encoded([0xa0]))).toThrow();
    expect(() => decodeAttestationObject(encoded([...data, 0]))).toThrow();
    const key = [0x68, ...new TextEncoder().encode('authData'), 0x58, 37, ...authenticator()];
    expect(() => decodeAttestationObject(encoded([0xa2, ...key, ...key]))).toThrow('authData');
  });

  it('深すぎる CBOR を拒否する（陽性対照）', () => {
    const nested = [0xa1, 0x61, 0x78, ...Array(18).fill(0x81), 0xf6];
    expect(() => decodeAttestationObject(encoded(nested))).toThrow('深すぎ');
  });
});
