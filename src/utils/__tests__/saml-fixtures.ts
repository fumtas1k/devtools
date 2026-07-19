/**
 * SAML テスト用フィクスチャ。
 * 日時は固定（2026-07-17 00:00Z 周辺）。checks のテストは now を注入して有効/期限切れを切り替える。
 */
export const SAMPLE_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_resp1" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" Destination="https://sp.example.com/acs" InResponseTo="_req1">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:Assertion ID="_a1" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
    <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">taro.yamada@example.com</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData Recipient="https://sp.example.com/acs" NotOnOrAfter="2026-07-17T00:05:00Z" InResponseTo="_req1"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="2026-07-16T23:55:00Z" NotOnOrAfter="2026-07-17T00:05:00Z">
      <saml:AudienceRestriction><saml:Audience>https://sp.example.com/metadata</saml:Audience></saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="2026-07-17T00:00:00Z" SessionIndex="_s1">
      <saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>
      <saml:Attribute Name="mail"><saml:AttributeValue>taro.yamada@example.com</saml:AttributeValue></saml:Attribute>
      <saml:Attribute Name="displayName" FriendlyName="表示名"><saml:AttributeValue>山田 太郎</saml:AttributeValue></saml:Attribute>
      <saml:Attribute Name="groups"><saml:AttributeValue>dev</saml:AttributeValue><saml:AttributeValue>admin</saml:AttributeValue></saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;

export const FAILED_STATUS_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_resp2" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Responder"/>
    <samlp:StatusMessage>Authentication failed</samlp:StatusMessage>
  </samlp:Status>
</samlp:Response>`;

export const ENCRYPTED_ASSERTION_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_resp3" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:EncryptedAssertion><xenc:EncryptedData xmlns:xenc="http://www.w3.org/2001/04/xmlenc#"/></saml:EncryptedAssertion>
</samlp:Response>`;

export const NESTED_STATUS_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_resp5" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Responder">
      <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:RequestDenied"/>
    </samlp:StatusCode>
    <samlp:StatusMessage>Authentication failed</samlp:StatusMessage>
  </samlp:Status>
</samlp:Response>`;

/** prefix なし（default xmlns）の Response。prefix 非依存パースの回帰確認用 */
export const DEFAULT_NS_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Response xmlns="urn:oasis:names:tc:SAML:2.0:protocol" ID="_resp6" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" Destination="https://sp.example.com/acs">
  <Issuer xmlns="urn:oasis:names:tc:SAML:2.0:assertion">https://idp.example.com/metadata</Issuer>
  <Status><StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></Status>
  <Assertion xmlns="urn:oasis:names:tc:SAML:2.0:assertion" ID="_a6" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
    <Issuer>https://idp.example.com/metadata</Issuer>
    <Subject>
      <NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">taro.yamada@example.com</NameID>
    </Subject>
  </Assertion>
</Response>`;

/** Assertion 2 件の Response。有効期間ラベルの連番付与の回帰確認用 */
export const TWO_ASSERTIONS_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_resp7" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:Assertion ID="_a7-1" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
    <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    <saml:Subject><saml:NameID>user1@example.com</saml:NameID></saml:Subject>
    <saml:Conditions NotBefore="2026-07-16T23:55:00Z" NotOnOrAfter="2026-07-17T00:05:00Z">
      <saml:AudienceRestriction><saml:Audience>https://sp.example.com/metadata</saml:Audience></saml:AudienceRestriction>
    </saml:Conditions>
  </saml:Assertion>
  <saml:Assertion ID="_a7-2" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
    <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    <saml:Subject><saml:NameID>user2@example.com</saml:NameID></saml:Subject>
    <saml:Conditions NotBefore="2026-07-16T23:55:00Z" NotOnOrAfter="2026-07-17T00:05:00Z">
      <saml:AudienceRestriction><saml:Audience>https://sp.example.com/metadata</saml:Audience></saml:AudienceRestriction>
    </saml:Conditions>
  </saml:Assertion>
</samlp:Response>`;

export const AUTHN_REQUEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_req1" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" Destination="https://idp.example.com/sso" AssertionConsumerServiceURL="https://sp.example.com/acs" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>https://sp.example.com/metadata</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
  <samlp:RequestedAuthnContext Comparison="exact">
    <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
  </samlp:RequestedAuthnContext>
</samlp:AuthnRequest>`;

export const LOGOUT_REQUEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_lreq1" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" Destination="https://idp.example.com/slo" NotOnOrAfter="2026-07-17T00:05:00Z" Reason="urn:oasis:names:tc:SAML:2.0:logout:user">
  <saml:Issuer>https://sp.example.com/metadata</saml:Issuer>
  <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">taro.yamada@example.com</saml:NameID>
  <samlp:SessionIndex>_s1</samlp:SessionIndex>
  <samlp:SessionIndex>_s2</samlp:SessionIndex>
</samlp:LogoutRequest>`;

/** EncryptedID を含む LogoutRequest（NameID なし・復号非対応の注記確認用） */
export const ENCRYPTED_ID_LOGOUT_REQUEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_lreq2" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://sp.example.com/metadata</saml:Issuer>
  <saml:EncryptedID><xenc:EncryptedData xmlns:xenc="http://www.w3.org/2001/04/xmlenc#"/></saml:EncryptedID>
</samlp:LogoutRequest>`;

/** NameID / EncryptedID / NotOnOrAfter がいずれもない LogoutRequest（チェックの error / info 分岐用） */
export const NO_NAMEID_LOGOUT_REQUEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_lreq3" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://sp.example.com/metadata</saml:Issuer>
</samlp:LogoutRequest>`;

export const LOGOUT_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutResponse xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_lres1" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" Destination="https://sp.example.com/slo" InResponseTo="_lreq1">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
</samlp:LogoutResponse>`;

/** 二段階ステータスで失敗する LogoutResponse（Status チェックの陽性対照用） */
export const FAILED_LOGOUT_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutResponse xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_lres2" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Responder">
      <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:RequestDenied"/>
    </samlp:StatusCode>
    <samlp:StatusMessage>Session not found</samlp:StatusMessage>
  </samlp:Status>
</samlp:LogoutResponse>`;

/** prefix なし（default xmlns）の LogoutRequest。prefix 非依存パースの回帰確認用 */
export const DEFAULT_NS_LOGOUT_REQUEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<LogoutRequest xmlns="urn:oasis:names:tc:SAML:2.0:protocol" ID="_lreq4" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <Issuer xmlns="urn:oasis:names:tc:SAML:2.0:assertion">https://sp.example.com/metadata</Issuer>
  <NameID xmlns="urn:oasis:names:tc:SAML:2.0:assertion">taro.yamada@example.com</NameID>
  <SessionIndex>_s1</SessionIndex>
</LogoutRequest>`;

/** prefix なし（default xmlns）の LogoutResponse。prefix 非依存パースの回帰確認用 */
export const DEFAULT_NS_LOGOUT_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<LogoutResponse xmlns="urn:oasis:names:tc:SAML:2.0:protocol" ID="_lres3" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" InResponseTo="_lreq4">
  <Issuer xmlns="urn:oasis:names:tc:SAML:2.0:assertion">https://idp.example.com/metadata</Issuer>
  <Status><StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></Status>
</LogoutResponse>`;

/** UTF-8 → base64（マルチバイト対応。btoa 直呼びは日本語で例外になるため必須） */
export function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
