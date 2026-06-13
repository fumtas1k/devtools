import { describe, it, expect } from 'vitest';
import { createQrSvg } from '@/utils/qrcode';

// stringToBytes の UTF-8 上書きは qrcode.ts モジュール内部で適用される。
// createQrSvg 経由で日本語・絵文字が正しく QR 生成できることを検証することで、
// マルチバイト対応パッチの回帰を間接的に検知する。
describe('createQrSvg', () => {
  it('ASCII テキスト（"ABC"）から SVG 文字列を生成できる', () => {
    const svg = createQrSvg('ABC', 'M');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('日本語テキスト（"こんにちは"）から SVG 文字列を生成できる（UTF-8 パッチの回帰検知）', () => {
    const svg = createQrSvg('こんにちは', 'M');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('日本語 1 文字（"あ"）から SVG 文字列を生成できる（UTF-8 パッチの回帰検知）', () => {
    const svg = createQrSvg('あ', 'M');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('絵文字（"🚀"）から SVG 文字列を生成できる（UTF-8 パッチの回帰検知）', () => {
    const svg = createQrSvg('🚀', 'M');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('エラー訂正レベル L で SVG を生成できる', () => {
    const svg = createQrSvg('test', 'L');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('エラー訂正レベル Q で SVG を生成できる', () => {
    const svg = createQrSvg('test', 'Q');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('エラー訂正レベル H で SVG を生成できる', () => {
    const svg = createQrSvg('test', 'H');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});
