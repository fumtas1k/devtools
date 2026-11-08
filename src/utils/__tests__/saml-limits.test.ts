// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { decodeSamlInput, formatXml, maskSamlXml, parseSamlXml } from '@/utils/saml';
import {
  assertSamlInputSize,
  exceedsUtf8ByteLimit,
  MAX_SAML_INPUT_LENGTH,
  MAX_SAML_XML_BYTES,
} from '@/utils/saml/limits';

const error = /XML のサイズが上限（UTF-8 で 32 MiB）/;
const xmlOfSize = (size: number) => `<a>${'x'.repeat(size - 7)}</a>`;

describe('SAML の UTF-8 サイズ境界', () => {
  it('TextEncoder と同じバイト数で ASCII、各幅の文字、孤立サロゲートを数える', () => {
    const samples = [
      '',
      'a',
      'é',
      'あ',
      '😀',
      '\ud800',
      '\udc00',
      '\ud800x',
      '\ud800\ud800\udc00',
      'aéあ😀\ud800\udc00\udc00',
    ];
    for (const sample of samples) {
      const bytes = new TextEncoder().encode(sample).length;
      expect(exceedsUtf8ByteLimit(sample, bytes)).toBe(false);
      if (bytes > 0) expect(exceedsUtf8ByteLimit(sample, bytes - 1)).toBe(true);
    }
  });

  it('生 XML は上限未満と上限ちょうどを受け入れる', () => {
    for (const size of [MAX_SAML_XML_BYTES - 1, MAX_SAML_XML_BYTES]) {
      expect(decodeSamlInput(xmlOfSize(size)).xml.length).toBe(size);
    }
  });

  it('マルチバイト XML の上限ちょうどを受け入れ、1 バイト超過を拒否する', () => {
    const body = 'あ'.repeat(Math.floor((MAX_SAML_XML_BYTES - 7) / 3)) + 'x';
    const xml = `<a>${body}</a>`;
    expect(Buffer.byteLength(xml, 'utf8')).toBe(MAX_SAML_XML_BYTES);
    expect(decodeSamlInput(xml).xml).toBe(xml);
    expect(() => decodeSamlInput(`<a>${body}x</a>`)).toThrow(error);
  });

  it('上限ちょうどの POST を受け入れる', { timeout: 120_000 }, () => {
    const xml = xmlOfSize(MAX_SAML_XML_BYTES);
    const b64 = Buffer.from(xml).toString('base64');
    expect(decodeSamlInput(b64).xml).toBe(xml);
  });

  it('陽性対照: 生 XML の上限超過を拒否する', () => {
    expect(() => decodeSamlInput(xmlOfSize(MAX_SAML_XML_BYTES + 1))).toThrow(error);
  });

  it('陽性対照: URL エンコードされた XML の上限超過を拒否する', () => {
    const xml = xmlOfSize(MAX_SAML_XML_BYTES + 1);
    expect(() => decodeSamlInput(`%3Ca%3E${xml.slice(3, -4)}%3C%2Fa%3E`)).toThrow(error);
  });

  it(
    '陽性対照: POST、base64url、URL とクエリ断片の XML 上限超過を拒否する',
    { timeout: 120_000 },
    () => {
      const b64 = Buffer.from(xmlOfSize(MAX_SAML_XML_BYTES + 1)).toString('base64');
      const base64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      expect(base64url).toContain('-');
      for (const input of [
        b64,
        base64url,
        `https://example.com/?SAMLResponse=${b64}`,
        `SAMLResponse=${b64}&RelayState=x`,
      ]) {
        expect(() => decodeSamlInput(input)).toThrow(error);
      }
    }
  );

  it('入力文字数の上限未満と上限ちょうどを受け入れる', () => {
    for (const size of [MAX_SAML_INPUT_LENGTH - 1, MAX_SAML_INPUT_LENGTH]) {
      expect(() => assertSamlInputSize(' '.repeat(size))).not.toThrow();
    }
  });

  it('陽性対照: 入力文字数は trim より前に拒否する', () => {
    const trim = vi.spyOn(String.prototype, 'trim');
    try {
      expect(() => decodeSamlInput(' '.repeat(MAX_SAML_INPUT_LENGTH + 1))).toThrow(
        /入力サイズが上限/
      );
      expect(trim).not.toHaveBeenCalled();
    } finally {
      trim.mockRestore();
    }
  });

  it('上限ちょうどの XML は DOMParser に渡す', () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString').mockReturnValue({
      getElementsByTagName: () => [1],
    } as unknown as Document);
    try {
      expect(() => parseSamlXml(xmlOfSize(MAX_SAML_XML_BYTES))).toThrow(/XML の構文エラー/);
      expect(parse).toHaveBeenCalledOnce();
    } finally {
      parse.mockRestore();
    }
  });

  it('陽性対照: 直接パースは上限超過を DOMParser に渡さない', () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    try {
      expect(() => parseSamlXml(xmlOfSize(MAX_SAML_XML_BYTES + 1))).toThrow(error);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it('陽性対照: 整形は上限超過を DOMParser に渡さず元の XML を返す', () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    const xml = xmlOfSize(MAX_SAML_XML_BYTES + 1);
    try {
      expect(formatXml(xml)).toBe(xml);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it('陽性対照: マスクは上限超過を DOMParser に渡さず元の XML と件数 0 を返す', () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    const xml = xmlOfSize(MAX_SAML_XML_BYTES + 1);
    try {
      expect(maskSamlXml(xml)).toEqual({ xml, piiCount: 0, secretCount: 0 });
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });
});
