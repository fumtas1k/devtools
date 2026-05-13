import { describe, it, expect } from 'vitest';
import { calcJan, generateJanSample, validateJanInput } from '@/utils/jan-code';

// ────────────────────────────────────────────
// calcJan — JAN-13
// ────────────────────────────────────────────
describe('calcJan JAN-13', () => {
  it('490123456789 → チェックディジット 0', () => {
    // 奇数位(×1): 4+0+2+4+6+8=24, 偶数位(×3): 9+1+3+5+7+9=34 → 34×3=102
    // total=126, 126%10=6, check=4
    const r = calcJan('490123456789', 'jan13');
    expect(r.checkDigit).toBe(4);
    expect(r.fullCode).toBe('4901234567894');
  });

  it('計算ステップが正しい（4901234567890 の入力部分）', () => {
    const r = calcJan('490123456789', 'jan13');
    expect(r.steps.weight1Digits).toEqual([4, 0, 2, 4, 6, 8]); // 奇数位
    expect(r.steps.weight3Digits).toEqual([9, 1, 3, 5, 7, 9]); // 偶数位
    expect(r.steps.weight1Sum).toBe(24);
    expect(r.steps.weight3Sum).toBe(34);
    expect(r.steps.total).toBe(126); // 24 + 34×3
    expect(r.steps.remainder).toBe(6);
    expect(r.steps.checkDigit).toBe(4);
  });

  it('チェックディジットが 0 になるケース', () => {
    // remainder = 0 → check = 0
    const r = calcJan('000000000000', 'jan13');
    expect(r.checkDigit).toBe(0);
    expect(r.fullCode).toBe('0000000000000');
  });

  it('複数の既知コードを検証', () => {
    // 456789012345: 奇数(4+6+8+0+2+4=24)×1 + 偶数(5+7+9+1+3+5=30)×3=90 → 114 → check=6
    // 012345678901: 奇数(0+2+4+6+8+0=20)×1 + 偶数(1+3+5+7+9+1=26)×3=78 → 98 → check=2
    const cases: [string, number][] = [
      ['456789012345', 6],
      ['012345678901', 2],
    ];
    for (const [input, expected] of cases) {
      expect(calcJan(input, 'jan13').checkDigit).toBe(expected);
    }
  });
});

// ────────────────────────────────────────────
// calcJan — JAN-8
// ────────────────────────────────────────────
describe('calcJan JAN-8', () => {
  it('JAN-8: 奇数位 ×3、偶数位 ×1 で計算する', () => {
    // 2000001: 2×3+0×1+0×3+0×1+0×3+0×1+1×3 = 6+0+0+0+0+0+3 = 9
    // check = 10 - 9 = 1
    const r = calcJan('2000001', 'jan8');
    expect(r.checkDigit).toBe(1);
    expect(r.fullCode).toBe('20000011');
  });

  it('計算ステップが正しい', () => {
    const r = calcJan('2000001', 'jan8');
    expect(r.steps.weight3Digits).toEqual([2, 0, 0, 1]); // 奇数位（×3）
    expect(r.steps.weight1Digits).toEqual([0, 0, 0]); // 偶数位（×1）
    expect(r.steps.weight3Sum).toBe(3);
    expect(r.steps.weight1Sum).toBe(0);
    expect(r.steps.total).toBe(9); // 0×1 + 3×3
    expect(r.steps.checkDigit).toBe(1);
  });

  it('チェックディジットが 0 になるケース', () => {
    const r = calcJan('0000000', 'jan8');
    expect(r.checkDigit).toBe(0);
  });
});

// ────────────────────────────────────────────
// validateJanInput
// ────────────────────────────────────────────
describe('validateJanInput', () => {
  it('空文字はエラーなし', () => {
    expect(validateJanInput('', 'jan13')).toBe('');
    expect(validateJanInput('', 'jan8')).toBe('');
  });

  it('正しい桁数はエラーなし', () => {
    expect(validateJanInput('490123456789', 'jan13')).toBe('');
    expect(validateJanInput('4901234', 'jan8')).toBe('');
  });

  it('数字以外はエラー', () => {
    expect(validateJanInput('49012345678a', 'jan13')).toBe('数字のみ入力してください');
    expect(validateJanInput('490 1234', 'jan13')).toBe('数字のみ入力してください');
  });

  it('桁数不足はエラー', () => {
    expect(validateJanInput('123', 'jan13')).toContain('12桁');
    expect(validateJanInput('123', 'jan8')).toContain('7桁');
  });

  it('桁数超過はエラー', () => {
    expect(validateJanInput('4901234567890', 'jan13')).toContain('現在13桁');
    expect(validateJanInput('49012345', 'jan8')).toContain('現在8桁');
  });
});

// ────────────────────────────────────────────
// generateJanSample — サンプル入力値生成
// ────────────────────────────────────────────
describe('generateJanSample', () => {
  it('JAN-13: 12桁の数字列を "49" 始まりで返す（先頭 0 落ち無し）', () => {
    for (let i = 0; i < 100; i++) {
      const s = generateJanSample('jan13');
      expect(s).toMatch(/^49\d{10}$/);
    }
  });

  it('JAN-8: 7桁の数字列を "49" 始まりで返す（先頭 0 落ち無し）', () => {
    for (let i = 0; i < 100; i++) {
      const s = generateJanSample('jan8');
      expect(s).toMatch(/^49\d{5}$/);
    }
  });

  it('複数回呼ぶと異なる値が出る（毎回ランダム化されている）', () => {
    // 10^10 通りから 30 個取って衝突する確率は無視できるレベル
    const samples = new Set<string>();
    for (let i = 0; i < 30; i++) samples.add(generateJanSample('jan13'));
    expect(samples.size).toBeGreaterThanOrEqual(28);
  });

  it('生成したサンプルは validateJanInput で正常入力と判定される', () => {
    expect(validateJanInput(generateJanSample('jan13'), 'jan13')).toBe('');
    expect(validateJanInput(generateJanSample('jan8'), 'jan8')).toBe('');
  });
});
