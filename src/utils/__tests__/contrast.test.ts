import { describe, it, expect } from 'vitest';
import {
  parseColor,
  relativeLuminance,
  contrastRatio,
  wcagLevels,
  apcaLc,
  buildMatrix,
} from '@/utils/contrast';

describe('parseColor', () => {
  it('#rrggbb をパースする', () => {
    expect(parseColor('#ff8800')).toEqual({ r: 255, g: 136, b: 0 });
  });
  it('#rgb を展開してパースする', () => {
    expect(parseColor('#f80')).toEqual({ r: 255, g: 136, b: 0 });
  });
  it('rgb() をパースする（空白ゆらぎ許容）', () => {
    expect(parseColor('rgb(255, 136, 0)')).toEqual({ r: 255, g: 136, b: 0 });
    expect(parseColor('rgb(255,136,0)')).toEqual({ r: 255, g: 136, b: 0 });
  });
  it('前後の空白を許容し大文字小文字を問わない', () => {
    expect(parseColor('  #FF8800  ')).toEqual({ r: 255, g: 136, b: 0 });
  });
  it('不正な入力は null を返す', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor('#ff88')).toBeNull();
    expect(parseColor('rgb(300,0,0)')).toBeNull(); // 範囲外
    expect(parseColor('#rrggbb')).toBeNull();
    expect(parseColor('rgba(0,0,0,0.5)')).toBeNull(); // v1 はアルファ非対応
  });
});

describe('relativeLuminance', () => {
  it('黒は 0、白は 1', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });
});

describe('contrastRatio', () => {
  it('黒×白は 21:1', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 1);
  });
  it('同色は 1:1', () => {
    const c = { r: 18, g: 52, b: 86 };
    expect(contrastRatio(c, c)).toBeCloseTo(1, 5);
  });
  it('対称（前景背景を入替えても同値）', () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 255, g: 255, b: 255 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 5);
  });
  it('#767676 × 白は約 4.54:1（AA 通常の境界）', () => {
    expect(contrastRatio({ r: 0x76, g: 0x76, b: 0x76 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(
      4.54,
      1
    );
  });
});

describe('wcagLevels（合否の両対照）', () => {
  it('21:1 は全項目 pass（正の対照）', () => {
    expect(wcagLevels(21)).toEqual({
      aaNormal: true,
      aaLarge: true,
      aaaNormal: true,
      aaaLarge: true,
    });
  });
  it('3:1 は AA 大のみ pass、AA 通常は fail（負の対照）', () => {
    expect(wcagLevels(3)).toEqual({
      aaNormal: false,
      aaLarge: true,
      aaaNormal: false,
      aaaLarge: false,
    });
  });
  it('1:1 は全項目 fail（負の対照）', () => {
    expect(wcagLevels(1)).toEqual({
      aaNormal: false,
      aaLarge: false,
      aaaNormal: false,
      aaaLarge: false,
    });
  });
});

describe('apcaLc（前景, 背景）', () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  it('黒文字×白背景は約 106（明背景＝正）', () => {
    expect(apcaLc(black, white)).toBeCloseTo(106.04, 0);
  });
  it('白文字×黒背景は約 -108（暗背景＝負）', () => {
    expect(apcaLc(white, black)).toBeCloseTo(-107.88, 0);
  });
  it('非対称（前景背景を入替えると符号が変わる）', () => {
    expect(Math.sign(apcaLc(black, white))).toBe(1);
    expect(Math.sign(apcaLc(white, black))).toBe(-1);
  });
  it('同色は 0', () => {
    expect(apcaLc(white, white)).toBe(0);
  });
});

describe('buildMatrix', () => {
  const colors = [
    { id: '1', label: 'black', rgb: { r: 0, g: 0, b: 0 } },
    { id: '2', label: 'white', rgb: { r: 255, g: 255, b: 255 } },
  ];
  it('N×N のセルを返す（行=前景, 列=背景）', () => {
    const m = buildMatrix(colors);
    expect(m).toHaveLength(2);
    expect(m[0]).toHaveLength(2);
  });
  it('対角は同色フラグを立てる', () => {
    const m = buildMatrix(colors);
    expect(m[0][0].sameColor).toBe(true);
    expect(m[0][1].sameColor).toBe(false);
  });
  it('セルに比・合否・APCA を含む', () => {
    const cell = buildMatrix(colors)[0][1]; // 前景=black, 背景=white
    expect(cell.ratio).toBeCloseTo(21, 1);
    expect(cell.levels.aaNormal).toBe(true);
    expect(cell.apca).toBeCloseTo(106.04, 0);
  });
});
