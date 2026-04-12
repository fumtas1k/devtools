export type JanMode = 'jan13' | 'jan8';

export interface CalcSteps {
  /** weight 1 側の桁リスト */
  weight1Digits: number[];
  /** weight 3 側の桁リスト */
  weight3Digits: number[];
  weight1Sum: number;
  weight3Sum: number;
  total: number;
  remainder: number;
  checkDigit: number;
}

export interface JanResult {
  checkDigit: number;
  fullCode: string;
  steps: CalcSteps;
}

/**
 * JAN チェックディジットを計算する（モジュラス10 ウェイト3-1）
 *
 * JAN-13: 12桁入力。奇数位（1,3,5…）×1、偶数位（2,4,6…）×3
 * JAN-8:  7桁入力。奇数位（1,3,5,7）×3、偶数位（2,4,6）×1
 */
export function calcJan(input: string, mode: JanMode): JanResult {
  const digits = input.split('').map(Number);

  const weight1Digits: number[] = [];
  const weight3Digits: number[] = [];

  digits.forEach((d, i) => {
    const pos = i + 1; // 1-indexed
    if (mode === 'jan13') {
      // 奇数位 ×1、偶数位 ×3
      (pos % 2 === 1 ? weight1Digits : weight3Digits).push(d);
    } else {
      // JAN-8: 奇数位 ×3、偶数位 ×1
      (pos % 2 === 1 ? weight3Digits : weight1Digits).push(d);
    }
  });

  const weight1Sum = weight1Digits.reduce((a, b) => a + b, 0);
  const weight3Sum = weight3Digits.reduce((a, b) => a + b, 0);
  const total = weight1Sum + weight3Sum * 3;
  const remainder = total % 10;
  const checkDigit = remainder === 0 ? 0 : 10 - remainder;

  return {
    checkDigit,
    fullCode: input + checkDigit,
    steps: { weight1Digits, weight3Digits, weight1Sum, weight3Sum, total, remainder, checkDigit },
  };
}

/** 入力バリデーション。エラーメッセージを返す（正常時は空文字） */
export function validateJanInput(input: string, mode: JanMode): string {
  if (!input) return '';
  if (!/^\d+$/.test(input)) return '数字のみ入力してください';
  const expected = mode === 'jan13' ? 12 : 7;
  if (input.length !== expected) {
    return `JAN-13は12桁、JAN-8は7桁を入力してください（現在${input.length}桁）`;
  }
  return '';
}
