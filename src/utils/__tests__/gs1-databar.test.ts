import { describe, it, expect } from 'vitest';
import {
  calcGtin14CheckDigit,
  validateGtin14Input,
  buildBwipText,
  type AiCode,
} from '../gs1-databar';

// ────────────────────────────────────────────
// calcGtin14CheckDigit
// ────────────────────────────────────────────
describe('calcGtin14CheckDigit', () => {
  it('0498700000001 → チェックディジット 7', () => {
    // 左から: 0×3 4×1 9×3 8×1 7×3 0×1 0×3 0×1 0×3 0×1 0×3 0×1 1×3
    // = 0+4+27+8+21+0+0+0+0+0+0+0+3 = 63; check=(10-3)%10=7
    const r = calcGtin14CheckDigit('0498700000001');
    expect(r.checkDigit).toBe(7);
    expect(r.fullGtin).toBe('04987000000017');
  });

  it('0000000000000 → チェックディジット 0', () => {
    const r = calcGtin14CheckDigit('0000000000000');
    expect(r.checkDigit).toBe(0);
    expect(r.fullGtin).toBe('00000000000000');
  });

  it('0100000000001 → チェックディジット 5', () => {
    // 0×3+1×1+0×3+0×1+0×3+0×1+0×3+0×1+0×3+0×1+0×3+0×1+1×3
    // = 0+1+0+0+0+0+0+0+0+0+0+0+3 = 4; check=(10-4)=6... let's recalc
    // positions: i=0(0×3=0) i=1(1×1=1) i=2(0×3=0) i=3(0×1=0) i=4(0×3=0)
    //            i=5(0×1=0) i=6(0×3=0) i=7(0×1=0) i=8(0×3=0) i=9(0×1=0)
    //            i=10(0×3=0) i=11(0×1=0) i=12(1×3=3) sum=4
    // check=(10-4)%10=6
    const r = calcGtin14CheckDigit('0100000000001');
    expect(r.checkDigit).toBe(6);
    expect(r.fullGtin).toBe('01000000000016');
  });

  it('先頭0のGTIN-14: 0012345678901 → 正しいチェックディジット', () => {
    // 0×3+0×1+1×3+2×1+3×3+4×1+5×3+6×1+7×3+8×1+9×3+0×1+1×3
    // = 0+0+3+2+9+4+15+6+21+8+27+0+3 = 98; check=(10-8)%10=2
    const r = calcGtin14CheckDigit('0012345678901');
    expect(r.checkDigit).toBe(2);
    expect(r.fullGtin).toBe('00123456789012');
  });
});

// ────────────────────────────────────────────
// validateGtin14Input
// ────────────────────────────────────────────
describe('validateGtin14Input', () => {
  it('空文字はエラーなし', () => {
    expect(validateGtin14Input('')).toBe('');
  });

  it('正しい13桁の先頭0はエラーなし', () => {
    expect(validateGtin14Input('0498700000001')).toBe('');
  });

  it('正しい13桁の先頭1はエラーなし', () => {
    expect(validateGtin14Input('1234567890123')).toBe('');
  });

  it('数字以外はエラー', () => {
    expect(validateGtin14Input('049870000000a')).toBe('数字のみ入力してください');
  });

  it('桁数不足はエラー', () => {
    expect(validateGtin14Input('0498700')).toContain('13桁');
  });

  it('桁数超過はエラー', () => {
    expect(validateGtin14Input('04987000000011')).toContain('13桁');
  });

  it('先頭桁が2以上はエラー', () => {
    expect(validateGtin14Input('2498700000001')).toContain('0 または 1');
    expect(validateGtin14Input('9498700000001')).toContain('0 または 1');
  });
});

// ────────────────────────────────────────────
// buildBwipText
// ────────────────────────────────────────────
describe('buildBwipText', () => {
  it('合成フィールドなし → linear部のみ', () => {
    const result = buildBwipText('04987000000017', []);
    expect(result).toBe('(01)04987000000017');
  });

  it('空値のフィールドは除外される', () => {
    const result = buildBwipText('04987000000017', [
      { ai: '17' as AiCode, value: '' },
      { ai: '10' as AiCode, value: '' },
    ]);
    expect(result).toBe('(01)04987000000017');
  });

  it('1つのAIフィールド', () => {
    const result = buildBwipText('04987000000017', [
      { ai: '17' as AiCode, value: '231231' },
    ]);
    expect(result).toBe('(01)04987000000017|(17)231231');
  });

  it('複数のAIフィールド', () => {
    const result = buildBwipText('04987000000017', [
      { ai: '17' as AiCode, value: '231231' },
      { ai: '10' as AiCode, value: 'ABC123' },
    ]);
    expect(result).toBe('(01)04987000000017|(17)231231(10)ABC123');
  });

  it('値の前後スペースはトリムされる', () => {
    const result = buildBwipText('04987000000017', [
      { ai: '10' as AiCode, value: '  ABC  ' },
    ]);
    expect(result).toBe('(01)04987000000017|(10)ABC');
  });
});
