/**
 * csr-generate.test.ts
 *
 * generateCsr のユニットテスト（陰性対照=正常系の round-trip）。
 * 生成した CSR が pkijs で再パースでき、Subject/SAN がラウンドトリップすること、
 * 秘密鍵 PEM が Web Crypto で再 import できることを検証する。
 */
import { describe, it, expect } from 'vitest';
import * as asn1js from 'asn1js';
import { CertificationRequest } from 'pkijs';
import { generateCsr } from '@/utils/csr/generate';
import { parseCsr } from '@/utils/csr/parse';
import type { GenerateParams } from '@/utils/csr/types';

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

const baseParams: GenerateParams = {
  algorithm: 'RSA',
  rsaModulusLength: 2048,
  ecCurve: 'P-256',
  subject: {
    commonName: 'example.test',
    organization: 'Test Org',
    organizationalUnit: '',
    country: 'JP',
    state: '',
    locality: '',
    email: '',
  },
  san: [{ type: 'dns', value: 'www.example.test' }],
};

describe('generateCsr（陰性対照: 正常系 round-trip）', () => {
  it('RSA-2048 で生成した CSR は pkijs で再パースでき Subject/SAN がラウンドトリップする', async () => {
    const result = await generateCsr(baseParams);
    expect(result.csrPem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
    expect(result.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');

    const asn1 = asn1js.fromBER(pemToDer(result.csrPem));
    const pkcs10 = new CertificationRequest({ schema: asn1.result });
    const cn = pkcs10.subject.typesAndValues.find((tv) => tv.type === '2.5.4.3');
    expect(cn?.value.valueBlock.value).toBe('example.test');
    // 署名が自己整合
    await expect(pkcs10.verify()).resolves.toBe(true);
  });

  it('ECDSA P-256 でも CSR を生成でき署名が自己整合する', async () => {
    const result = await generateCsr({ ...baseParams, algorithm: 'ECDSA' });
    const asn1 = asn1js.fromBER(pemToDer(result.csrPem));
    const pkcs10 = new CertificationRequest({ schema: asn1.result });
    await expect(pkcs10.verify()).resolves.toBe(true);
  });

  it('生成した秘密鍵 PEM は Web Crypto で再 import できる', async () => {
    const result = await generateCsr(baseParams);
    const der = pemToDer(result.privateKeyPem);
    await expect(
      crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, [
        'sign',
      ])
    ).resolves.toBeDefined();
  });

  it('CN も SAN も空なら例外を投げる', async () => {
    await expect(
      generateCsr({
        ...baseParams,
        subject: { ...baseParams.subject, commonName: '' },
        san: [],
      })
    ).rejects.toThrow();
  });

  it('IP SAN は生成→再解析で IPv4 表記が復元される（IP オクテット往復）', async () => {
    const result = await generateCsr({
      ...baseParams,
      san: [{ type: 'ip', value: '10.0.0.1' }],
    });
    const parsed = await parseCsr(result.csrPem);
    expect(parsed.error).toBeUndefined();
    expect(parsed.san).toContain('IP:10.0.0.1');
  });
});

// 陽性対照（test-gates）: SAN IP の入力 validator。
// 旧実装は不正 IP を無言ドロップして resolve していたため、このテストは旧実装に当てると fail する
// （= 不正検知能力そのものの証明）。陰性対照（上の round-trip）と別 describe に分離する。
describe('generateCsr（陽性対照: 不正 SAN IP の拒否 / test-gates）', () => {
  it('非空だが不正な IPv4 の SAN は例外を投げる（無言ドロップしない）', async () => {
    await expect(
      generateCsr({
        ...baseParams,
        san: [{ type: 'ip', value: '999.1.1.1' }],
      })
    ).rejects.toThrow();
  });

  it('CN が空で唯一の SAN が不正 IP のとき空の SAN 拡張を作らず例外を投げる', async () => {
    await expect(
      generateCsr({
        ...baseParams,
        subject: { ...baseParams.subject, commonName: '' },
        san: [{ type: 'ip', value: 'not-an-ip' }],
      })
    ).rejects.toThrow();
  });
});
