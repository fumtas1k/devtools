// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseSamlXml } from '@/utils/saml';

const wrap = (body: string) =>
  `<p:Response xmlns:p="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:a="urn:oasis:names:tc:SAML:2.0:assertion" xmlns:x="http://www.w3.org/2001/04/xmlenc#" xmlns:d="http://www.w3.org/2000/09/xmldsig#" xmlns:f="urn:fake">${body}</p:Response>`;

function parse(body: string) {
  const result = parseSamlXml(wrap(body));
  if (result.type !== 'response') throw new Error('response expected');
  return result;
}

describe('暗号化方式の抽出', () => {
  it('複数 Assertion・データ・鍵を個別に保持し、任意 prefix と default namespace に対応する', () => {
    const result = parse(`
      <a:Assertion><a:Subject><a:NameID>plain</a:NameID></a:Subject></a:Assertion>
      <a:EncryptedAssertion>
        <x:EncryptedData><x:EncryptionMethod Algorithm="urn:unknown:data"/><d:KeyInfo>
          <x:EncryptedKey><x:EncryptionMethod Algorithm="urn:key:one"/></x:EncryptedKey>
          <x:EncryptedKey><x:EncryptionMethod Algorithm="urn:key:two"/></x:EncryptedKey>
        </d:KeyInfo></x:EncryptedData>
        <EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes128-gcm"/></EncryptedData>
        <x:EncryptedKey><x:EncryptionMethod Algorithm="urn:sibling"/></x:EncryptedKey>
      </a:EncryptedAssertion>
      <a:EncryptedAssertion><x:EncryptedData/><x:EncryptedKey><x:EncryptionMethod Algorithm=""/></x:EncryptedKey></a:EncryptedAssertion>`);
    expect(result.assertions[0].nameId).toBe('plain');
    expect(result.encryptedAssertionCount).toBe(2);
    expect(result.encryptedAssertions).toEqual([
      {
        encryptedData: [
          {
            algorithms: ['urn:unknown:data'],
            encryptedKeys: [{ algorithms: ['urn:key:one'] }, { algorithms: ['urn:key:two'] }],
          },
          { algorithms: ['http://www.w3.org/2009/xmlenc11#aes128-gcm'], encryptedKeys: [] },
        ],
        encryptedKeys: [{ algorithms: ['urn:sibling'] }],
      },
      {
        encryptedData: [{ algorithms: [undefined], encryptedKeys: [] }],
        encryptedKeys: [{ algorithms: [undefined] }],
      },
    ]);
  });

  it('偽 namespace・別階層・修飾属性を無視し、欠落や空値は未指定とする', () => {
    const result = parse(`
      <a:EncryptedAssertion>
        <f:EncryptedData><x:EncryptionMethod Algorithm="urn:fake-data"/></f:EncryptedData>
        <x:EncryptedData>
          <f:EncryptionMethod Algorithm="urn:fake-method"/>
          <x:EncryptionMethod f:Algorithm="urn:fake-attribute"/>
          <x:EncryptionMethod Algorithm=""/>
          <x:EncryptionMethod Algorithm="   "/>
          <x:EncryptionMethod Algorithm="urn:real"/>
          <x:EncryptionMethod Algorithm="  urn:preserved  "/>
          <x:CipherData><x:EncryptionMethod Algorithm="urn:decoy"/><d:KeyInfo><x:EncryptedKey/></d:KeyInfo></x:CipherData>
          <f:KeyInfo><x:EncryptedKey/></f:KeyInfo><d:KeyInfo><f:EncryptedKey/><f:Wrapper><x:EncryptedKey/></f:Wrapper></d:KeyInfo>
        </x:EncryptedData>
        <f:Wrapper><x:EncryptedKey/><x:EncryptedData/></f:Wrapper>
        <x:EncryptedKey><f:Wrapper><x:EncryptionMethod Algorithm="urn:nested"/></f:Wrapper></x:EncryptedKey>
      </a:EncryptedAssertion>
      <f:EncryptedAssertion><x:EncryptedData/></f:EncryptedAssertion>`);
    expect(result.encryptedAssertionCount).toBe(1);
    expect(result.encryptedAssertions).toEqual([
      {
        encryptedData: [
          {
            algorithms: [undefined, undefined, undefined, 'urn:real', '  urn:preserved  '],
            encryptedKeys: [],
          },
        ],
        encryptedKeys: [{ algorithms: [undefined] }],
      },
    ]);
  });
});
