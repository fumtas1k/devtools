import { describe, it, expect, beforeAll } from 'vitest';
import { parseCertificates } from '@/utils/cert/parse';
import { makeTestChain, type TestChain } from './cert-fixtures';

let chain: TestChain;
beforeAll(async () => {
  chain = await makeTestChain();
});

describe('parseCertificates', () => {
  it('空入力は topLevelError を返す', async () => {
    const r = await parseCertificates('');
    expect(r.certs).toHaveLength(0);
    expect(r.topLevelError).toBeTruthy();
  });

  it('PEM の leaf 証明書から主要フィールドを抽出する', async () => {
    const r = await parseCertificates(chain.leafPem);
    expect(r.certs).toHaveLength(1);
    const c = r.certs[0];
    expect(c.error).toBeUndefined();
    expect(c.subject.full).toContain('CN=');
    expect(c.san).toContain('DNS:example.test');
    expect(c.notAfter.getTime()).toBeGreaterThan(Date.now());
    expect(c.fingerprintSha256).toMatch(/^[0-9A-F:]+$/i);
    expect(c.publicKey.algorithm).toBe('EC');
  });

  it('複数 PEM ブロックを全件パースする', async () => {
    const all = `${chain.leafPem}\n${chain.intermediatePem}\n${chain.rootPem}`;
    const r = await parseCertificates(all);
    expect(r.certs).toHaveLength(3);
  });

  it('壊れた1枚があっても他の証明書はパースを継続する', async () => {
    const broken = `-----BEGIN CERTIFICATE-----\nMIIBADGARBAGE\n-----END CERTIFICATE-----`;
    const r = await parseCertificates(`${chain.leafPem}\n${broken}`);
    expect(r.certs.length).toBeGreaterThanOrEqual(1);
    expect(r.certs.some((c) => c.error)).toBe(true);
  });
});
