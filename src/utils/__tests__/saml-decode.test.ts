// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { deflateSync } from 'fflate';
import { decodeSamlInput } from '@/utils/saml';
import { SAMPLE_RESPONSE_XML, AUTHN_REQUEST_XML, toBase64 } from './saml-fixtures';

function deflateBase64(xml: string): string {
  const compressed = deflateSync(new TextEncoder().encode(xml));
  let bin = '';
  for (const b of compressed) bin += String.fromCharCode(b);
  return btoa(bin);
}

describe('decodeSamlInput', () => {
  it('生 XML をそのまま返す', () => {
    const r = decodeSamlInput(SAMPLE_RESPONSE_XML);
    expect(r.binding).toBe('xml');
    expect(r.xml).toBe(SAMPLE_RESPONSE_XML);
  });

  it('base64（HTTP-POST binding）をデコードする', () => {
    const r = decodeSamlInput(toBase64(SAMPLE_RESPONSE_XML));
    expect(r.binding).toBe('post');
    expect(r.xml).toContain('<samlp:Response');
    expect(r.steps).toContain('base64 デコード');
  });

  it('改行・空白入り base64 も受け付ける', () => {
    const b64 = toBase64(SAMPLE_RESPONSE_XML).replace(/(.{60})/g, '$1\n');
    expect(decodeSamlInput(b64).binding).toBe('post');
  });

  it('base64 + deflate（HTTP-Redirect binding）を展開する', () => {
    const r = decodeSamlInput(deflateBase64(AUTHN_REQUEST_XML));
    expect(r.binding).toBe('redirect');
    expect(r.xml).toContain('<samlp:AuthnRequest');
    expect(r.steps).toContain('deflate 展開');
  });

  it('URL エンコードされた base64+deflate を展開する', () => {
    const r = decodeSamlInput(encodeURIComponent(deflateBase64(AUTHN_REQUEST_XML)));
    expect(r.binding).toBe('redirect');
  });

  it('URL 全体から SAMLRequest パラメータを抽出する', () => {
    const url = `https://idp.example.com/sso?SAMLRequest=${encodeURIComponent(deflateBase64(AUTHN_REQUEST_XML))}&RelayState=abc`;
    const r = decodeSamlInput(url);
    expect(r.binding).toBe('redirect');
    expect(r.steps[0]).toBe('URL からパラメータ抽出');
    expect(r.xml).toContain('<samlp:AuthnRequest');
  });

  it('URL 全体から SAMLResponse パラメータを抽出する', () => {
    const url = `https://sp.example.com/acs?SAMLResponse=${encodeURIComponent(toBase64(SAMPLE_RESPONSE_XML))}`;
    expect(decodeSamlInput(url).xml).toContain('<samlp:Response');
  });

  it('SAML パラメータの無い URL はエラー', () => {
    expect(() => decodeSamlInput('https://example.com/?foo=bar')).toThrow(
      /SAMLResponse \/ SAMLRequest/
    );
  });

  it('base64 でない文字列はエラー', () => {
    expect(() => decodeSamlInput('これはSAMLではない')).toThrow();
  });

  it('base64 だが中身が XML でない場合はエラー', () => {
    expect(() => decodeSamlInput(toBase64('hello world'))).toThrow(/XML ではありません/);
  });

  it('空入力はエラー', () => {
    expect(() => decodeSamlInput('   ')).toThrow(/入力が空/);
  });
});

describe('decodeSamlInput: レビュー指摘の回帰', () => {
  it('URL クエリ中の生の "+" を含む base64 を破壊せずデコードする（陽性対照）', () => {
    const b64 = toBase64(SAMPLE_RESPONSE_XML);
    // フィクスチャの base64 表現が "+" を含むことを前提にしたテスト
    // （searchParams.get は "+" を空白に変換して壊すため、含まれていないと検知能力が証明できない）
    expect(b64).toContain('+');
    const url = `https://sp.example.com/acs?SAMLResponse=${b64}`;
    const r = decodeSamlInput(url);
    expect(r.binding).toBe('post');
    expect(r.xml).toContain('<samlp:Response');
  });

  it('URL エンコードされた生 XML は binding xml と判定する', () => {
    const r = decodeSamlInput(encodeURIComponent(SAMPLE_RESPONSE_XML));
    expect(r.binding).toBe('xml');
    expect(r.xml).toBe(SAMPLE_RESPONSE_XML);
    expect(r.steps).toEqual(['URL デコード', '生 XML と判定']);
  });
});
