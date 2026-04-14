/** GTIN-14の制約 */
export const GTIN14_LENGTH = 14;

/** GS1 DataBar Limited が受け付ける先頭桁 */
export const DATABAR_LIMITED_FIRST_DIGITS = [0, 1] as const;

export interface Gs1CalcResult {
  checkDigit: number;
  fullGtin: string;
}

/**
 * GTIN-14 チェックディジットを計算する（モジュラス10 ウェイト3-1）
 * 左から奇数位(1,3,5…13)×3、偶数位(2,4,6…12)×1
 * check = (10 - sum%10) % 10
 *
 * @param digits13 - チェックディジットを除いた13桁の数字文字列
 */
export function calcGtin14CheckDigit(digits13: string): Gs1CalcResult {
  const digits = digits13.split('').map(Number);
  let sum = 0;
  digits.forEach((d, i) => {
    // 左から1番目（i=0）は奇数位→×3
    sum += i % 2 === 0 ? d * 3 : d * 1;
  });
  const checkDigit = (10 - (sum % 10)) % 10;
  return {
    checkDigit,
    fullGtin: digits13 + checkDigit,
  };
}

/**
 * GS1 DataBar Limited の入力バリデーション
 * @param input - 13桁の数字文字列
 * @returns エラーメッセージ（正常時は空文字）
 */
export function validateGtin14Input(input: string): string {
  if (!input) return '';
  if (!/^\d+$/.test(input)) return '数字のみ入力してください';
  if (input.length > 13) return `13桁を入力してください（現在${input.length}桁）`;
  if (input.length < 13) return `13桁を入力してください（現在${input.length}桁）`;
  const first = Number(input[0]);
  if (first !== 0 && first !== 1) {
    return 'GS1 DataBar Limitedの先頭桁は 0 または 1 のみ使用できます';
  }
  return '';
}

/** サポートするアプリケーション識別子 (AI) */
export type AiCode = '17' | '10' | '11' | '15' | '21';

export interface AiEntry {
  ai: AiCode;
  label: string;
  placeholder: string;
  /** 入力値のバリデーション。エラーメッセージを返す（正常時は空文字） */
  validate: (value: string) => string;
}

export const AI_DEFS: AiEntry[] = [
  {
    ai: '17',
    label: '賞味/消費期限 (17)',
    placeholder: 'YYMMDD (例: 231231)',
    validate: (v) => {
      if (!v) return '';
      if (!/^\d{6}$/.test(v)) return 'YYMMDD形式の6桁を入力してください';
      const mm = Number(v.slice(2, 4));
      const dd = Number(v.slice(4, 6));
      if (mm < 1 || mm > 12) return '月は01〜12で入力してください';
      if (dd < 0 || dd > 31) return '日は00〜31で入力してください';
      return '';
    },
  },
  {
    ai: '10',
    label: 'ロット番号 (10)',
    placeholder: '英数字 (例: ABC123)',
    validate: (v) => {
      if (!v) return '';
      if (!/^[\x20-\x7E]{1,20}$/.test(v))
        return '最大20文字の印刷可能なASCII文字を入力してください';
      return '';
    },
  },
  {
    ai: '11',
    label: '製造日 (11)',
    placeholder: 'YYMMDD (例: 230101)',
    validate: (v) => {
      if (!v) return '';
      if (!/^\d{6}$/.test(v)) return 'YYMMDD形式の6桁を入力してください';
      const mm = Number(v.slice(2, 4));
      const dd = Number(v.slice(4, 6));
      if (mm < 1 || mm > 12) return '月は01〜12で入力してください';
      if (dd < 0 || dd > 31) return '日は00〜31で入力してください';
      return '';
    },
  },
  {
    ai: '15',
    label: '最良品質保持期限 (15)',
    placeholder: 'YYMMDD (例: 231231)',
    validate: (v) => {
      if (!v) return '';
      if (!/^\d{6}$/.test(v)) return 'YYMMDD形式の6桁を入力してください';
      const mm = Number(v.slice(2, 4));
      const dd = Number(v.slice(4, 6));
      if (mm < 1 || mm > 12) return '月は01〜12で入力してください';
      if (dd < 0 || dd > 31) return '日は00〜31で入力してください';
      return '';
    },
  },
  {
    ai: '21',
    label: 'シリアル番号 (21)',
    placeholder: '英数字 (例: SN001)',
    validate: (v) => {
      if (!v) return '';
      if (!/^[\x20-\x7E]{1,20}$/.test(v))
        return '最大20文字の印刷可能なASCII文字を入力してください';
      return '';
    },
  },
];

/**
 * bwip-js の databarlimitedcomposite 用テキスト文字列を組み立てる
 * フォーマット: (01)GTIN14|(AI1)value1(AI2)value2...
 *
 * @param fullGtin - 14桁のGTIN
 * @param compositeFields - AI→値のペア配列（値が空のものは除外）
 */
export function buildBwipText(
  fullGtin: string,
  compositeFields: { ai: AiCode; value: string }[]
): string {
  const linear = `(01)${fullGtin}`;
  const filledFields = compositeFields.filter((f) => f.value.trim() !== '');
  if (filledFields.length === 0) return linear;
  const composite = filledFields.map((f) => `(${f.ai})${f.value.trim()}`).join('');
  return `${linear}|${composite}`;
}
