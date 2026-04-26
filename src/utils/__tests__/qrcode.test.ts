import { describe, it, expect } from 'vitest';
import qrcode from '@/utils/qrcode';

describe('qrcode (patched)', () => {
  it('stringToBytes が TextEncoder (UTF-8) を使用するように上書きされている', () => {
    // 'あ' の UTF-8 バイト配列は [227, 129, 130] (0xE3, 0x81, 0x82)
    const result = qrcode.stringToBytes('あ');
    expect(result).toEqual([227, 129, 130]);
  });

  it('絵文字を含む文字列も正しく UTF-8 バイト配列に変換できる', () => {
    // '🚀' (U+1F680) の UTF-8 バイト配列は [240, 159, 154, 128]
    const result = qrcode.stringToBytes('🚀');
    expect(result).toEqual([240, 159, 154, 128]);
  });

  it('ASCII 文字列は従来通り 1 バイトずつ変換される（UTF-8 と共通）', () => {
    const result = qrcode.stringToBytes('ABC');
    expect(result).toEqual([65, 66, 67]);
  });

  it('QRコードの生成プロセスが動作することを確認', () => {
    // 実際に生成してエラーにならないかチェック
    const qr = qrcode(0, 'M');
    qr.addData('こんにちは');
    expect(() => qr.make()).not.toThrow();
    
    const svg = qr.createSvgTag();
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});
