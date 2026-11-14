import { describe, expect, it } from 'vitest';
import { decodeClientData, MAX_RESPONSE_CHARS } from '../webauthnDecoder';

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fixture(clientData: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(clientData));
  return JSON.stringify({ response: { clientDataJSON: encode(bytes) } });
}

describe('WebAuthn clientDataJSON の読み取り', () => {
  it.each(['webauthn.create', 'webauthn.get'] as const)('合成 %s レスポンスを読む', (type) => {
    expect(decodeClientData(fixture({ type, origin: 'https://example.test' }))).toEqual({
      type,
      origin: 'https://example.test',
    });
  });

  it('不正な外側 JSON と必要なフィールドの欠落を拒否する（陽性対照）', () => {
    expect(() => decodeClientData('{')).toThrow('レスポンス JSON が不正');
    expect(() => decodeClientData('{}')).toThrow('response.clientDataJSON が必要');
  });

  it('不正な base64url と正規でない末尾ビットを拒否する（陽性対照）', () => {
    for (const value of ['?', 'a', 'Zh', 'e30=']) {
      expect(() =>
        decodeClientData(JSON.stringify({ response: { clientDataJSON: value } }))
      ).toThrow();
    }
  });

  it('不正 UTF-8、JSON、type、origin を拒否する（陽性対照）', () => {
    const wrapped = (bytes: Uint8Array) =>
      JSON.stringify({ response: { clientDataJSON: encode(bytes) } });
    expect(() => decodeClientData(wrapped(Uint8Array.of(0xff)))).toThrow('UTF-8');
    expect(() => decodeClientData(wrapped(new TextEncoder().encode('{')))).toThrow('UTF-8');
    expect(() =>
      decodeClientData(fixture({ type: 'other', origin: 'https://example.test' }))
    ).toThrow('type または origin');
    expect(() => decodeClientData(fixture({ type: 'webauthn.get', origin: '' }))).toThrow(
      'type または origin'
    );
  });

  it('上限超過を拒否する（陽性対照）', () => {
    expect(() => decodeClientData(' '.repeat(MAX_RESPONSE_CHARS + 1))).toThrow('上限');
  });
});
