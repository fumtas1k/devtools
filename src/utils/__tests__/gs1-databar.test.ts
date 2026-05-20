import { describe, it, expect } from 'vitest';
import {
  calcGtin14CheckDigit,
  validateGtin14Input,
  buildBwipText,
  addSvgDimensions,
  AI_DEFS,
  type AiCode,
} from '@/utils/gs1-databar';

// ────────────────────────────────────────────
// AI_DEFS: isVariableLength
// ────────────────────────────────────────────
// ... (omitted existing tests for brevity in reasoning, will include all in actual tool call)
describe('AI_DEFS isVariableLength', () => {
  it('固定長AI (17, 11, 15) は isVariableLength=false', () => {
    const fixedAis = ['17', '11', '15'];
    for (const ai of fixedAis) {
      const def = AI_DEFS.find((d) => d.ai === ai);
      expect(def?.isVariableLength, `AI ${ai} should be fixed-length`).toBe(false);
    }
  });

  it('可変長AI (10, 21) は isVariableLength=true', () => {
    const variableAis = ['10', '21'];
    for (const ai of variableAis) {
      const def = AI_DEFS.find((d) => d.ai === ai);
      expect(def?.isVariableLength, `AI ${ai} should be variable-length`).toBe(true);
    }
  });
});

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
    const result = buildBwipText('04987000000017', [{ ai: '17' as AiCode, value: '231231' }]);
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
    const result = buildBwipText('04987000000017', [{ ai: '10' as AiCode, value: '  ABC  ' }]);
    expect(result).toBe('(01)04987000000017|(10)ABC');
  });
});

// ────────────────────────────────────────────
// addSvgDimensions
// ────────────────────────────────────────────
//
// 陽性対照: fix を revert (shape-rendering 注入や width/height 注入を削る) と
// 該当 it() が必ず fail する設計。bwip-js の SVG が anti-alias で滲んで scanner
// decode 失敗した事象 (composite CC-A 部のロット (10) が読めない) を再発防止する
// regression test 一式。
describe('addSvgDimensions', () => {
  it('viewBox から width / height 属性を注入する (PNG 変換時の natural size 0x0 回避)', () => {
    const input = '<svg viewBox="0 0 96 50" xmlns="http://www.w3.org/2000/svg"></svg>';
    const out = addSvgDimensions(input);
    expect(out).toContain('width="96"');
    expect(out).toContain('height="50"');
  });

  it('shape-rendering="crispEdges" を注入する (bar/space edge の anti-alias 抑止)', () => {
    const input = '<svg viewBox="0 0 96 50" xmlns="http://www.w3.org/2000/svg"></svg>';
    const out = addSvgDimensions(input);
    expect(out).toContain('shape-rendering="crispEdges"');
  });

  it('注入された属性は <svg> 開始タグ内に存在する (子要素ではなく root への適用)', () => {
    const input = '<svg viewBox="0 0 100 40"><rect width="10" height="40"/></svg>';
    const out = addSvgDimensions(input);
    const openTag = out.match(/<svg[^>]*>/);
    expect(openTag).not.toBeNull();
    expect(openTag![0]).toContain('shape-rendering="crispEdges"');
    expect(openTag![0]).toContain('width="100"');
    expect(openTag![0]).toContain('height="40"');
  });

  it('小数 viewBox は四捨五入される (整数 pixel 寸法)', () => {
    const input = '<svg viewBox="0 0 95.6 49.4"></svg>';
    const out = addSvgDimensions(input);
    expect(out).toContain('width="96"');
    expect(out).toContain('height="49"');
  });

  it('viewBox を持たない入力は変更せず返す (想定外フォーマットを破壊しない)', () => {
    const input = '<svg width="100" height="50"></svg>';
    expect(addSvgDimensions(input)).toBe(input);
  });
});
