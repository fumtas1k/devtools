// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { maskSamlXml } from '@/utils/saml';
import { SAMPLE_RESPONSE_XML, LOGOUT_REQUEST_XML } from './saml-fixtures';

/** 署名付き Response。X509Certificate / SignatureValue の base64 が over-mask されないことの陰性対照用。 */
const SIGNED_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" ID="_rs" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <ds:Signature>
    <ds:SignatureValue>Qm9ndXNTaWduYXR1cmVWYWx1ZUJhc2U2NEhpZ2hFbnRyb3B5QUJDREVGMTIzNDU2Nzg5MA==</ds:SignatureValue>
    <ds:KeyInfo><ds:X509Data><ds:X509Certificate>Rml4dHVyZUNlcnRpZmljYXRlQmFzZTY0SGlnaEVudHJvcHlaWVhXVlUwOTg3NjU0MzIxUVJTVA==</ds:X509Certificate></ds:X509Data></ds:KeyInfo>
  </ds:Signature>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
</samlp:Response>`;

/** Destination の URL クエリにメールを埋め込み、フェーズ2 の scrubber 救済を実証する。 */
const RECIPIENT_EMAIL_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_re" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" Destination="https://sp.example.com/acs?login=leaked@corp.example">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
</samlp:Response>`;

describe('maskSamlXml: フェーズ1 構造ベースマスク（陽性対照）', () => {
  it('NameID のメールがマスクされる', () => {
    const { xml } = maskSamlXml(SAMPLE_RESPONSE_XML);
    expect(xml).not.toContain('taro.yamada@example.com');
    expect(xml).toContain('[REDACTED:PII_');
  });

  it('パターンでは拾えない日本語氏名（displayName）がマスクされる', () => {
    const { xml } = maskSamlXml(SAMPLE_RESPONSE_XML);
    expect(xml).not.toContain('山田 太郎');
  });

  it('複数 AttributeValue（groups の dev / admin）がすべてマスクされる', () => {
    const { xml } = maskSamlXml(SAMPLE_RESPONSE_XML);
    // Attribute 値として単独出現する dev / admin が消える（要素名 groups は残る）
    expect(xml).not.toMatch(/>dev</);
    expect(xml).not.toMatch(/>admin</);
    expect(xml).toContain('Name="groups"');
  });

  it('同一値（NameID メール = mail 属性値）は同一トークンになる（相関）', () => {
    const { xml } = maskSamlXml(SAMPLE_RESPONSE_XML);
    const tokens = xml.match(/\[REDACTED:PII_\d+\]/g) ?? [];
    // NameID と mail 属性が同じメールを持つため、同一トークンが 2 回以上出現する
    const counts = tokens.reduce<Record<string, number>>((acc, t) => {
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
    expect(Object.values(counts).some((c) => c >= 2)).toBe(true);
  });

  it('piiCount は occurrence 数（NameID 1 + mail 1 + displayName 1 + groups 2 = 5）', () => {
    const { piiCount } = maskSamlXml(SAMPLE_RESPONSE_XML);
    expect(piiCount).toBe(5);
  });

  it('LogoutRequest の NameID もマスクされる', () => {
    const { xml, piiCount } = maskSamlXml(LOGOUT_REQUEST_XML);
    // フィクスチャの NameID 実在値で検証する（空振り防止・陽性対照）
    expect(xml).not.toContain('taro.yamada@example.com');
    expect(xml).toContain('[REDACTED:PII_');
    expect(piiCount).toBeGreaterThanOrEqual(1);
  });
});

describe('maskSamlXml: フェーズ2 scrubber 併用（陽性対照）', () => {
  it('Destination URL に埋め込まれたメールが scrubber でマスクされる', () => {
    const { xml, secretCount } = maskSamlXml(RECIPIENT_EMAIL_RESPONSE_XML);
    expect(xml).not.toContain('leaked@corp.example');
    expect(xml).toContain('[REDACTED:EMAIL_');
    expect(secretCount).toBeGreaterThanOrEqual(1);
  });
});

describe('maskSamlXml: over-mask していないこと（陰性対照）', () => {
  it('X509Certificate / SignatureValue の base64（HIGH_ENTROPY）は残る', () => {
    const { xml } = maskSamlXml(SIGNED_RESPONSE_XML);
    expect(xml).toContain(
      'Qm9ndXNTaWduYXR1cmVWYWx1ZUJhc2U2NEhpZ2hFbnRyb3B5QUJDREVGMTIzNDU2Nzg5MA=='
    );
    expect(xml).toContain(
      'Rml4dHVyZUNlcnRpZmljYXRlQmFzZTY0SGlnaEVudHJvcHlaWVhXVlUwOTg3NjU0MzIxUVJTVA=='
    );
  });

  it('タイムスタンプ・要素名・属性名・ID が保持される', () => {
    const { xml } = maskSamlXml(SAMPLE_RESPONSE_XML);
    expect(xml).toContain('2026-07-17T00:00:00Z');
    expect(xml).toContain('Name="mail"');
    expect(xml).toContain('ID="_resp1"');
    expect(xml).toContain('SessionIndex="_s1"');
  });
});

describe('maskSamlXml: 不変条件', () => {
  it('マスク後の出力は valid XML のまま（再パースできる）', () => {
    const { xml } = maskSamlXml(SAMPLE_RESPONSE_XML);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    expect(doc.getElementsByTagName('parsererror').length).toBe(0);
  });

  it('パース不能な入力は件数 0 で元の文字列を返す', () => {
    const { xml, piiCount, secretCount } = maskSamlXml('<broken');
    expect(piiCount).toBe(0);
    expect(secretCount).toBe(0);
    expect(xml).toBe('<broken');
  });
});
