// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseSamlXml } from '@/utils/saml';
import {
  SAMPLE_RESPONSE_XML,
  FAILED_STATUS_RESPONSE_XML,
  ENCRYPTED_ASSERTION_RESPONSE_XML,
  AUTHN_REQUEST_XML,
  NESTED_STATUS_RESPONSE_XML,
  DEFAULT_NS_RESPONSE_XML,
  TWO_ASSERTIONS_RESPONSE_XML,
} from './saml-fixtures';

describe('parseSamlXml: Response', () => {
  it('サマリ情報を抽出する', () => {
    const m = parseSamlXml(SAMPLE_RESPONSE_XML);
    if (m.type !== 'response') throw new Error('response expected');
    expect(m.issuer).toBe('https://idp.example.com/metadata');
    expect(m.statusCode).toBe('urn:oasis:names:tc:SAML:2.0:status:Success');
    expect(m.destination).toBe('https://sp.example.com/acs');
    expect(m.inResponseTo).toBe('_req1');
    expect(m.issueInstant).toBe('2026-07-17T00:00:00Z');
    expect(m.signed).toBe(false);
    expect(m.encryptedAssertionCount).toBe(0);
  });

  it('Assertion の Subject / Conditions / AuthnStatement を抽出する', () => {
    const m = parseSamlXml(SAMPLE_RESPONSE_XML);
    if (m.type !== 'response') throw new Error('response expected');
    expect(m.assertions).toHaveLength(1);
    const a = m.assertions[0];
    expect(a.nameId).toBe('taro.yamada@example.com');
    expect(a.nameIdFormat).toBe('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress');
    expect(a.conditions?.notBefore).toBe('2026-07-16T23:55:00Z');
    expect(a.conditions?.notOnOrAfter).toBe('2026-07-17T00:05:00Z');
    expect(a.conditions?.audienceRestrictions).toEqual([['https://sp.example.com/metadata']]);
    expect(a.authnStatements[0].sessionIndex).toBe('_s1');
    expect(a.authnStatements[0].authnContextClassRef).toContain('PasswordProtectedTransport');
    expect(a.subjectConfirmations[0].recipient).toBe('https://sp.example.com/acs');
    expect(a.subjectConfirmations[0].method).toBe('urn:oasis:names:tc:SAML:2.0:cm:bearer');
  });

  it('属性（複数値・FriendlyName 含む）を抽出する', () => {
    const m = parseSamlXml(SAMPLE_RESPONSE_XML);
    if (m.type !== 'response') throw new Error('response expected');
    const attrs = m.assertions[0].attributes;
    expect(attrs).toHaveLength(3);
    expect(attrs[1]).toEqual({
      name: 'displayName',
      friendlyName: '表示名',
      values: ['山田 太郎'],
    });
    expect(attrs[2].values).toEqual(['dev', 'admin']);
  });

  it('Status 失敗レスポンスの StatusMessage を抽出する', () => {
    const m = parseSamlXml(FAILED_STATUS_RESPONSE_XML);
    if (m.type !== 'response') throw new Error('response expected');
    expect(m.statusCode).toBe('urn:oasis:names:tc:SAML:2.0:status:Responder');
    expect(m.statusMessage).toBe('Authentication failed');
    expect(m.assertions).toHaveLength(0);
  });

  it('EncryptedAssertion を数える', () => {
    const m = parseSamlXml(ENCRYPTED_ASSERTION_RESPONSE_XML);
    if (m.type !== 'response') throw new Error('response expected');
    expect(m.encryptedAssertionCount).toBe(1);
    expect(m.assertions).toHaveLength(0);
  });

  it('ネストした StatusCode の内側コードを statusSubCode として抽出する', () => {
    const m = parseSamlXml(NESTED_STATUS_RESPONSE_XML);
    if (m.type !== 'response') throw new Error('response expected');
    expect(m.statusCode).toBe('urn:oasis:names:tc:SAML:2.0:status:Responder');
    expect(m.statusSubCode).toBe('urn:oasis:names:tc:SAML:2.0:status:RequestDenied');
  });

  it('prefix なし（default xmlns）の Response も正常にパースする（回帰）', () => {
    const m = parseSamlXml(DEFAULT_NS_RESPONSE_XML);
    if (m.type !== 'response') throw new Error('response expected');
    expect(m.issuer).toBe('https://idp.example.com/metadata');
    expect(m.statusCode).toBe('urn:oasis:names:tc:SAML:2.0:status:Success');
    expect(m.assertions).toHaveLength(1);
    expect(m.assertions[0].nameId).toBe('taro.yamada@example.com');
  });

  it('Assertion 2 件をどちらも抽出する（回帰）', () => {
    const m = parseSamlXml(TWO_ASSERTIONS_RESPONSE_XML);
    if (m.type !== 'response') throw new Error('response expected');
    expect(m.assertions).toHaveLength(2);
    expect(m.assertions[0].nameId).toBe('user1@example.com');
    expect(m.assertions[1].nameId).toBe('user2@example.com');
  });
});

describe('parseSamlXml: AuthnRequest', () => {
  it('サマリ情報を抽出する', () => {
    const m = parseSamlXml(AUTHN_REQUEST_XML);
    if (m.type !== 'authnRequest') throw new Error('authnRequest expected');
    expect(m.issuer).toBe('https://sp.example.com/metadata');
    expect(m.destination).toBe('https://idp.example.com/sso');
    expect(m.acsUrl).toBe('https://sp.example.com/acs');
    expect(m.protocolBinding).toBe('urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST');
    expect(m.nameIdPolicyFormat).toBe('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress');
    expect(m.allowCreate).toBe('true');
    expect(m.authnContextClassRefs).toEqual([
      'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
    ]);
  });
});

describe('parseSamlXml: 異常系', () => {
  it('壊れた XML はエラー', () => {
    expect(() => parseSamlXml('<samlp:Response>')).toThrow(/XML/);
  });

  it('SAML 以外の XML はエラー', () => {
    expect(() => parseSamlXml('<root><child/></root>')).toThrow(/対応していない/);
  });

  it('LogoutRequest は未対応としてエラー', () => {
    const xml =
      '<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_l1" Version="2.0" IssueInstant="2026-07-17T00:00:00Z"/>';
    expect(() => parseSamlXml(xml)).toThrow(/LogoutRequest/);
  });

  it('SAML 1.1 namespace の Response は namespace URI と SAML 2.0 限定である旨をエラーに含む（陽性対照）', () => {
    const xml =
      '<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:1.0:protocol" ID="_r1" IssueInstant="2026-07-17T00:00:00Z"/>';
    expect(() => parseSamlXml(xml)).toThrow(/urn:oasis:names:tc:SAML:1\.0:protocol/);
    expect(() => parseSamlXml(xml)).toThrow(/SAML 2\.0/);
  });
});
