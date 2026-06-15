/**
 * cert-chain.test.ts
 *
 * buildChain の陽性対照・陰性対照テスト。
 * test-gates skill チェックリストに従い、検証機構の discriminating power を保証する。
 *
 * 陽性対照: 正しいチェーンで全リンク signatureValid === true
 * 陰性対照1: issuer 不一致 → 親リンクなし（signatureValid !== true）
 * 陰性対照2: TBS 改ざん（DER 1バイト反転）→ signatureValid === false
 * 陰性対照3: 期限切れ証明書 → expired === true
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parseCertificates } from '@/utils/cert/parse';
import { buildChain } from '@/utils/cert/chain';
import {
  makeTestChain,
  makeExpiredCert,
  makeDuplicateDnChain,
  type TestChain,
} from './cert-fixtures';
import { SAMPLE_CERT_CHAIN_PEM } from '@/components/tools/certDecoderSample';

/** DER → PEM 変換ヘルパー */
function derToPem(der: Uint8Array): string {
  const b64 = Buffer.from(der)
    .toString('base64')
    .replace(/(.{64})/g, '$1\n');
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`;
}

let chain: TestChain;
beforeAll(async () => {
  chain = await makeTestChain();
});

// ────────────────────────────────────────────────────────────────────────────
// 陽性対照: 正しいチェーンは全リンクの署名検証に成功する
// ────────────────────────────────────────────────────────────────────────────

describe('buildChain — 陽性対照', () => {
  it('正しい root/intermediate/leaf チェーンは全リンクの signatureValid が true になる', async () => {
    const { certs } = await parseCertificates(
      `${chain.leafPem}\n${chain.intermediatePem}\n${chain.rootPem}`
    );
    expect(certs).toHaveLength(3);

    const r = await buildChain(certs);

    // 検証可能なリンクが最低 2 件（leaf→intermediate, intermediate→root）
    const verifiable = r.links.filter((l) => l.signatureValid !== null);
    expect(verifiable.length).toBeGreaterThanOrEqual(2);

    // すべての検証可能リンクが true
    expect(verifiable.every((l) => l.signatureValid === true)).toBe(true);
  });

  it('全証明書が有効期限内なので expired は全て false', async () => {
    const { certs } = await parseCertificates(
      `${chain.leafPem}\n${chain.intermediatePem}\n${chain.rootPem}`
    );
    const r = await buildChain(certs);
    expect(r.links.every((l) => l.expired === false)).toBe(true);
  });

  it('order は root を先頭に leaf を末尾に並べる', async () => {
    const { certs } = await parseCertificates(
      // 意図的に leaf→intermediate→root の逆順で渡す
      `${chain.leafPem}\n${chain.intermediatePem}\n${chain.rootPem}`
    );
    const r = await buildChain(certs);
    // order の先頭が root（自己署名）であることを確認
    const firstCert = certs[r.order[0]];
    expect(firstCert.subject.full).toBe(firstCert.issuer.full);
    // order の末尾が leaf（SAN を持つ）であることを確認
    const lastCert = certs[r.order[r.order.length - 1]];
    expect(lastCert.san).toContain('DNS:example.test');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 陰性対照1: issuer 不一致 → 親リンクなし
// ────────────────────────────────────────────────────────────────────────────

describe('buildChain — 陰性対照1: issuer 不一致', () => {
  it('無関係な証明書を混在させると leaf に対する signatureValid が true にならない', async () => {
    // 別チェーンの root を用意（chain.leaf の issuer とは DN が一致しない）
    const other = await makeTestChain();
    const { certs } = await parseCertificates(
      `${chain.leafPem}\n${other.rootPem}` // leaf の issuer は other.root ではない
    );
    const r = await buildChain(certs);

    // leaf（末尾 or SAN を持つ cert）のリンクを取得
    const leafCertIdx = certs.findIndex((c) => c.san.includes('DNS:example.test'));
    const leafLink = r.links.find((l) => l.subjectIndex === leafCertIdx);

    // 親が見つからないか、署名検証が true でないこと
    expect(leafLink?.signatureValid === true).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 陰性対照2: TBS 改ざん → signatureValid === false
// ────────────────────────────────────────────────────────────────────────────

describe('buildChain — 陰性対照2: DER 改ざん', () => {
  it('intermediate の DER を1バイト改ざんすると署名検証が false になる', async () => {
    const { certs } = await parseCertificates(
      `${chain.leafPem}\n${chain.intermediatePem}\n${chain.rootPem}`
    );
    expect(certs).toHaveLength(3);

    // intermediate を特定（subject が 'Test Intermediate CA' を含む）
    const intermediateIdx = certs.findIndex((c) => c.subject.full.includes('Test Intermediate CA'));
    expect(intermediateIdx).toBeGreaterThanOrEqual(0);

    // DER の TBS 付近（バイト 40）を1ビット反転して改ざん
    certs[intermediateIdx].der = new Uint8Array(certs[intermediateIdx].der);
    certs[intermediateIdx].der[40] ^= 0xff;

    const r = await buildChain(certs);

    // 改ざんされた intermediate のリンクを確認
    const tamperedLink = r.links.find((l) => l.subjectIndex === intermediateIdx);
    // 改ざんにより署名検証は false（または null = パース失敗）であること
    expect(tamperedLink?.signatureValid).not.toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 陰性対照3: 期限切れ証明書 → expired === true
// ────────────────────────────────────────────────────────────────────────────

describe('buildChain — 陰性対照3: 期限切れ', () => {
  it('notAfter が過去の証明書は expired === true になる', async () => {
    const expiredDer = await makeExpiredCert();
    const { certs } = await parseCertificates(derToPem(expiredDer));
    expect(certs).toHaveLength(1);
    expect(certs[0].notAfter.getTime()).toBeLessThan(Date.now());

    const r = await buildChain(certs);
    expect(r.links.some((l) => l.expired === true)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// サンプル証明書チェーンの健全性（UI のサンプルボタンが壊れていないことの保証）
// ────────────────────────────────────────────────────────────────────────────

describe('SAMPLE_CERT_CHAIN_PEM', () => {
  it('3 枚にパースでき、全リンクの署名が有効かつ期限内である', async () => {
    const { certs } = await parseCertificates(SAMPLE_CERT_CHAIN_PEM);
    expect(certs).toHaveLength(3);
    expect(certs.every((c) => c.error === undefined)).toBe(true);

    const r = await buildChain(certs);
    const verifiable = r.links.filter((l) => l.signatureValid !== null);
    expect(verifiable.length).toBeGreaterThanOrEqual(2);
    expect(verifiable.every((l) => l.signatureValid === true)).toBe(true);
    expect(r.links.every((l) => l.expired === false)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DN 重複時の AKI/SKI による親解決（#3）と order/links の整合（#5）
// ────────────────────────────────────────────────────────────────────────────

describe('buildChain — DN 重複時の親解決（#3 / #5）', () => {
  it('同一 Subject DN の CA が複数ある場合、leaf の AKI に一致する SKI を持つ CA を親に選ぶ', async () => {
    const dup = await makeDuplicateDnChain();
    // 入力順は AKI 一致の caB を「先」に、不一致の caA を「後」に置く。
    // 旧実装の subjectMap 後勝ち（最後の caA が勝つ）では親を取り違えるため、
    // この順序で修正の discriminating power を担保する。
    const { certs } = await parseCertificates(`${dup.caBPem}\n${dup.caAPem}\n${dup.leafPem}`);
    expect(certs).toHaveLength(3);

    const r = await buildChain(certs);

    const leafIdx = certs.findIndex((c) => c.subject.full.includes('dup-leaf.test'));
    const leafLink = r.links.find((l) => l.subjectIndex === leafIdx);
    expect(leafLink).toBeDefined();

    // 親が SKI=skiB を持つ CA（caB）であること
    expect(leafLink!.issuerIndex).not.toBeNull();
    expect(certs[leafLink!.issuerIndex!].subjectKeyId).toBe(dup.skiBHex);

    // 正しい親を選んだので署名検証が成功する
    expect(leafLink!.signatureValid).toBe(true);

    // #5: order と links の整合 — 親は order 上で leaf より前に並ぶ
    const posOf = (i: number) => r.order.indexOf(i);
    expect(posOf(leafLink!.issuerIndex!)).toBeLessThan(posOf(leafIdx));
  });
});
