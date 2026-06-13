import { describe, it, expect } from 'vitest';
import { createQrSvg } from '@/utils/qrcode';

// stringToBytes の UTF-8 上書きは qrcode.ts モジュール内部で適用される。
describe('createQrSvg', () => {
  // --- スモークテスト: 各種入力で SVG 生成が throw せず完了することのみ確認 ---
  // 注意: これらは「生成できる」ことの確認であり、UTF-8 パッチの回帰検知ではない。
  // パッチを外しても <svg> 自体は生成される（latin1 切り詰めで別データの QR になるだけ）ため、
  // toContain('<svg') では回帰を検知できない。回帰検知は下の専用テストが担う。
  it('ASCII テキスト（"ABC"）から SVG 文字列を生成できる', () => {
    const svg = createQrSvg('ABC', 'M');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('日本語テキスト（"こんにちは"）から SVG 文字列を生成できる', () => {
    const svg = createQrSvg('こんにちは', 'M');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('絵文字（"🚀"）から SVG 文字列を生成できる', () => {
    const svg = createQrSvg('🚀', 'M');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it.each(['L', 'Q', 'H'] as const)('エラー訂正レベル %s で SVG を生成できる', (level) => {
    const svg = createQrSvg('test', level);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  // --- UTF-8 パッチの回帰検知（パッチが外れると実際に fail する）---
  it('UTF-8 パッチ回帰検知: マルチバイト文字が latin1 に切り詰められていない', () => {
    // qrcode-generator のデフォルト stringToBytes は char code を & 0xFF する latin1 実装。
    // その場合 'あ'(U+3042) は 0x3042 & 0xFF = 0x42 = 'B' に化け、createQrSvg('あ') は
    // createQrSvg('B') と同一 SVG になる。UTF-8 パッチ適用下では 'あ' は [227,129,130] と
    // なり 'B' とは異なる QR になる。パッチが外れると下記 2 つが一致して fail する。
    expect(createQrSvg('あ', 'M')).not.toBe(createQrSvg('B', 'M'));
  });
});
