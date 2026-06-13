import { describe, it, expect } from 'vitest';
import { detectInput } from '@/utils/cert/detect';

const PEM_CERT = `-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----`;

describe('detectInput', () => {
  it('空入力は empty を返す', () => {
    expect(detectInput('').kind).toBe('empty');
    expect(detectInput('   \n  ').kind).toBe('empty');
  });

  it('PEM の CERTIFICATE ブロックを複数抽出する', () => {
    const twoBlocks = `${PEM_CERT}\n${PEM_CERT}`;
    const r = detectInput(twoBlocks);
    expect(r.kind).toBe('pem');
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0].source).toBe('pem');
  });

  it('PKCS#12 の PEM ヘッダ（ENCRYPTED PRIVATE KEY を含む pfx 由来）ではなく、PRIVATE KEY のみは未対応扱いにしない', () => {
    // CERTIFICATE ブロックが1つも無ければ unknown
    const keyOnly = `-----BEGIN PRIVATE KEY-----\nMII\n-----END PRIVATE KEY-----`;
    expect(detectInput(keyOnly).kind).toBe('unknown');
  });
});
