// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateDecryptedAssertion } from '../saml/decryption-plaintext';
const plaintext = readFileSync('tests/fixtures/saml-encryption/expected.xml', 'utf8');
async function validate(bytes: Uint8Array) {
  return validateDecryptedAssertion(bytes);
}
const utf8 = (text: string) => new TextEncoder().encode(text);

describe('復号した Assertion の表示境界', () => {
  it('日本語と名前空間が自己完結した Assertion を受け入れる', async () => {
    await expect(validate(utf8(plaintext))).resolves.toBe(plaintext);
  });
  it('ちょうど 1 MiB の UTF-8 Assertion を受け入れる', async () => {
    const prefix = '<Assertion xmlns="urn:oasis:names:tc:SAML:2.0:assertion">';
    const suffix = '</Assertion>';
    const xml = prefix + 'x'.repeat(1024 * 1024 - prefix.length - suffix.length) + suffix;
    await expect(validate(utf8(xml))).resolves.toBe(xml);
  });
  it.each([
    ['不正な UTF-8', new Uint8Array([0xc0, 0xaf])],
    ['DTD', utf8('<!DOCTYPE a><Assertion xmlns="urn:oasis:names:tc:SAML:2.0:assertion"/>')],
    ['不正 XML', utf8('<Assertion>')],
    ['異なる名前空間', utf8('<Assertion xmlns="urn:spoof"/>')],
    ['未定義 prefix', utf8('<saml:Assertion/>')],
    ['複数ルート', utf8(plaintext + plaintext)],
    [
      '再帰暗号化',
      utf8(
        '<Assertion xmlns="urn:oasis:names:tc:SAML:2.0:assertion"><EncryptedAssertion/></Assertion>'
      ),
    ],
    ['サイズ超過', new Uint8Array(1024 * 1024 + 1)],
  ])('%s を拒否する', async (_label, bytes) => {
    await expect(validate(bytes)).rejects.toThrow();
  });
});
