// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseSamlXml } from '@/utils/saml';
import {
  SAMPLE_RESPONSE_XML,
  FAILED_STATUS_RESPONSE_XML,
  ENCRYPTED_ASSERTION_RESPONSE_XML,
  AUTHN_REQUEST_XML,
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
    expect(a.conditions?.audiences).toEqual(['https://sp.example.com/metadata']);
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
});
